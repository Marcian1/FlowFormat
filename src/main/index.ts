import { ComponentContext, IComponent, getStudioProApi } from "@mendix/extensions-api";
import type { Push, Request, Response } from "../shared/protocol";
import { findFlow, formatFlows, listAllFlows, listModules } from "./formatter";

export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        if (componentContext.runMode === "headless") {
            return;
        }

        const studioPro = getStudioProApi(componentContext);
        const messaging = studioPro.ui.messagePassing;

        const openTab = () =>
            studioPro.ui.tabs.open(
                { title: "Flow Format" },
                { componentName: "extension/FlowFormat", uiEntrypoint: "tab" },
                { isSingleton: true }
            );

        await studioPro.ui.extensionsMenu.add({
            menuId: "FlowFormat.MainMenu",
            caption: "Flow Format",
            subMenus: [
                {
                    menuId: "FlowFormat.ShowMenu",
                    caption: "Format flows in a module...",
                    action: async () => {
                        await openTab();
                    }
                }
            ]
        });

        // Right click a microflow or nanoflow in the App Explorer (or in its editor) to format just that flow.
        const formatSingle = async ({ documentId }: { documentId: string }) => {
            const flow = await findFlow(studioPro, documentId);
            if (!flow) return;
            const {
                results: [result]
            } = await formatFlows(studioPro, [flow], () => {});
            const message =
                result.status === "formatted"
                    ? `Removed ${result.pixelsSaved}px of whitespace.`
                    : result.status === "unchanged"
                      ? "Nothing to compact."
                      : `Failed: ${result.message}`;
            await studioPro.ui.notifications.show({ title: `Flow Format: ${flow.name}`, message, displayDurationInSeconds: 5 });
        };
        for (const documentType of ["Microflows$Microflow", "Microflows$Nanoflow"]) {
            await studioPro.ui.appExplorer.addContextMenu(
                { menuId: `FlowFormat.Explorer.${documentType}`, caption: "Remove flow whitespace", action: formatSingle },
                documentType
            );
            await studioPro.ui.documents.addContextMenu(
                { menuId: `FlowFormat.Editor.${documentType}`, caption: "Remove flow whitespace", action: formatSingle },
                documentType
            );
        }

        const push = (message: Push) => messaging.sendMessage<Push, never>(message);
        const reply = (messageId: string, response: Response) => messaging.sendResponse(messageId, response);
        let busy = false;
        let cancelRequested = false;

        await messaging.addMessageHandler<Request>(async ({ messageId, message }) => {
            switch (message.type) {
                case "getModules": {
                    try {
                        await reply(messageId, { type: "modules", modules: await listModules(studioPro) });
                    } catch (e) {
                        console.error("[FlowFormat] getModules failed", e);
                        await reply(messageId, { type: "modules", modules: [] });
                    }
                    return;
                }

                case "getAllFlows": {
                    try {
                        await reply(messageId, { type: "flows", flows: await listAllFlows(studioPro) });
                    } catch (e) {
                        console.error("[FlowFormat] getAllFlows failed", e);
                        await reply(messageId, { type: "flows", flows: [], error: (e as any)?.message ?? String(e) });
                    }
                    return;
                }

                case "format": {
                    if (busy) {
                        await reply(messageId, { type: "ack", ok: false, error: "A format run is already in progress." });
                        return;
                    }
                    busy = true;
                    cancelRequested = false;
                    await reply(messageId, { type: "ack", ok: true });
                    // Not awaited: the handler returns at once, progress is pushed to the UI.
                    void formatFlows(
                        studioPro,
                        message.flows,
                        (done, total, current) => void push({ type: "formatProgress", done, total, current }),
                        () => cancelRequested
                    )
                        .then(({ results, cancelled }) => push({ type: "formatDone", results, cancelled }))
                        .catch((e) => {
                            console.error("[FlowFormat] format failed", e);
                            return push({ type: "formatDone", results: [] });
                        })
                        .finally(() => {
                            busy = false;
                        });
                    return;
                }

                case "cancel": {
                    cancelRequested = true;
                    await reply(messageId, { type: "ack", ok: true });
                    return;
                }

                case "open": {
                    try {
                        await studioPro.ui.editors.editDocument({ id: message.id });
                    } catch (e) {
                        console.warn("[FlowFormat] open failed", e);
                    }
                    await reply(messageId, { type: "ack", ok: true });
                    return;
                }
            }
        });
    }
};
