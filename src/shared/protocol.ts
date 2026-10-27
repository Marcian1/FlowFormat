// Messages exchanged between the main entry point (model access) and the UI tab.

export type FlowKind = "microflow" | "nanoflow";

export type FlowInfo = {
    /** Unit id of the flow document */
    id: string;
    kind: FlowKind;
    name: string;
    moduleName: string;
};

export type FlowResult = {
    id: string;
    name: string;
    moduleName: string;
    kind: FlowKind;
    status: "formatted" | "unchanged" | "error";
    /** Pixels removed from the widest point of the flow */
    pixelsSaved?: number;
    message?: string;
};

export type Request =
    | { type: "getModules" }
    | { type: "getAllFlows" }
    | { type: "format"; flows: Pick<FlowInfo, "id" | "kind">[] }
    | { type: "cancel" }
    | { type: "open"; id: string };

export type Response =
    | { type: "modules"; modules: string[] }
    | { type: "flows"; flows: FlowInfo[]; error?: string }
    | { type: "ack"; ok: boolean; error?: string };

export type Push =
    | { type: "formatProgress"; done: number; total: number; current: string }
    | { type: "formatDone"; results: FlowResult[]; cancelled?: boolean };
