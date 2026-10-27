import type { getStudioProApi } from "@mendix/extensions-api";
import type { FlowInfo, FlowKind, FlowResult } from "../shared/protocol";
import { compactFlow } from "./compactor";

type StudioPro = ReturnType<typeof getStudioProApi>;

const TYPES: Record<FlowKind, string> = {
    microflow: "Microflows$Microflow",
    nanoflow: "Microflows$Nanoflow"
};

function accessor(studioPro: StudioPro, kind: FlowKind) {
    const model = studioPro.app.model;
    return kind === "microflow" ? model.microflows : model.nanoflows;
}

export async function listModules(studioPro: StudioPro): Promise<string[]> {
    const modules = await studioPro.app.model.modules.getModules();
    return modules.map((m) => m.name).sort((a, b) => a.localeCompare(b));
}

export async function listAllFlows(studioPro: StudioPro): Promise<FlowInfo[]> {
    const flows: FlowInfo[] = [];
    for (const kind of ["microflow", "nanoflow"] as const) {
        const infos = await accessor(studioPro, kind).getUnitsInfo();
        for (const u of infos) {
            if (u.$Type === TYPES[kind]) {
                flows.push({ id: u.$ID, kind, name: u.name ?? "", moduleName: u.moduleName ?? "" });
            }
        }
    }
    return flows.sort((a, b) => a.moduleName.localeCompare(b.moduleName) || a.name.localeCompare(b.name));
}

/** Finds the kind of a flow document from its id, for the context-menu entry. */
export async function findFlow(studioPro: StudioPro, id: string): Promise<FlowInfo | undefined> {
    for (const kind of ["microflow", "nanoflow"] as const) {
        const infos = await accessor(studioPro, kind).getUnitsInfo();
        const hit = infos.find((u) => u.$ID === id);
        if (hit) return { id, kind, name: hit.name ?? "", moduleName: hit.moduleName ?? "" };
    }
    return undefined;
}

const BATCH_SIZE = 25;
const yieldToHost = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const label = (info: FlowInfo | undefined, fallback: string) => (info ? `${info.moduleName}.${info.name}` : fallback);

/** Compacts one loaded flow and saves it only when something changed. */
async function formatLoaded(api: ReturnType<typeof accessor>, unit: any, info: FlowInfo): Promise<FlowResult> {
    const base = { id: info.id, kind: info.kind, name: info.name, moduleName: info.moduleName };
    try {
        const saved = compactFlow(unit);
        if (saved <= 0) return { ...base, status: "unchanged", pixelsSaved: 0 };
        await api.save(unit);
        return { ...base, status: "formatted", pixelsSaved: Math.round(saved) };
    } catch (e) {
        console.error("[FlowFormat] format failed", info, e);
        return { ...base, status: "error", message: (e as any)?.message ?? String(e) };
    }
}

/**
 * Formats many flows without hogging Studio Pro: flows are loaded in batches (one scan of the unit list per
 * batch instead of one per flow), unchanged flows are never saved, and control goes back to the host between
 * batches so the UI stays responsive. Can be cancelled between batches.
 */
export async function formatFlows(
    studioPro: StudioPro,
    flows: Pick<FlowInfo, "id" | "kind">[],
    onProgress: (done: number, total: number, current: string) => void,
    shouldCancel: () => boolean = () => false
): Promise<{ results: FlowResult[]; cancelled: boolean }> {
    const infos = new Map<string, FlowInfo>();
    for (const kind of ["microflow", "nanoflow"] as const) {
        for (const u of await accessor(studioPro, kind).getUnitsInfo()) {
            if (u.$Type === TYPES[kind]) infos.set(u.$ID, { id: u.$ID, kind, name: u.name ?? "", moduleName: u.moduleName ?? "" });
        }
    }

    const results: FlowResult[] = [];
    let cancelled = false;
    const total = flows.length;
    let lastPush = 0;
    const report = (current: string, force = false) => {
        const now = Date.now();
        if (force || now - lastPush >= 150) {
            lastPush = now;
            onProgress(results.length, total, current);
        }
    };

    for (const kind of ["microflow", "nanoflow"] as const) {
        const api = accessor(studioPro, kind);
        const ids = flows.filter((f) => f.kind === kind).map((f) => f.id);
        for (let i = 0; i < ids.length; i += BATCH_SIZE) {
            if (shouldCancel()) {
                cancelled = true;
                break;
            }
            const batch = ids.slice(i, i + BATCH_SIZE);
            const wanted = new Set(batch);
            report(batch.length === 1 ? label(infos.get(batch[0]), batch[0]) : `${kind}s ${i + 1}-${i + batch.length}`, true);

            let units: any[] = [];
            try {
                units = (await api.loadAll((u) => wanted.has(u.$ID), batch.length)) as any[];
            } catch (e) {
                console.error("[FlowFormat] batch load failed", e);
            }
            const loaded = new Set(units.map((u) => u.$ID));

            for (const unit of units) {
                const info = infos.get(unit.$ID) ?? { id: unit.$ID, kind, name: unit.name ?? "", moduleName: "" };
                report(label(info, unit.$ID));
                results.push(await formatLoaded(api, unit, info));
            }
            for (const id of batch) {
                if (!loaded.has(id)) {
                    const info = infos.get(id);
                    results.push({ id, kind, name: info?.name ?? "", moduleName: info?.moduleName ?? "", status: "error", message: "Flow could not be loaded." });
                }
            }
            await yieldToHost();
        }
        if (cancelled) break;
    }
    onProgress(results.length, total, "");
    return { results, cancelled };
}
