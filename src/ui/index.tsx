import React, { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { ComponentContext, IComponent, getStudioProApi } from "@mendix/extensions-api";
import type { FlowInfo, FlowKind, FlowResult, Push, Request, Response } from "../shared/protocol";
import { styles } from "./styles";

type Messaging = ReturnType<typeof getStudioProApi>["ui"]["messagePassing"];
type KindFilter = "all" | FlowKind;
const PAGE_SIZE = 300;
type Progress = { done: number; total: number; current: string };

export const component: IComponent = {
    async loaded(componentContext: ComponentContext) {
        const messaging = getStudioProApi(componentContext).ui.messagePassing;
        const style = document.createElement("style");
        style.textContent = styles;
        document.head.appendChild(style);
        createRoot(document.getElementById("root")!).render(
            <StrictMode>
                <App messaging={messaging} />
            </StrictMode>
        );
    }
};

function request(messaging: Messaging, message: Request): Promise<Response> {
    return new Promise((resolve, reject) => {
        messaging.sendMessage<Request, Response>(message, async (response) => resolve(response)).catch(reject);
    });
}

const kindLabel = (k: FlowKind) => (k === "microflow" ? "Microflow" : "Nanoflow");

function App({ messaging }: { messaging: Messaging }) {
    const [modules, setModules] = useState<string[]>([]);
    const [moduleName, setModuleName] = useState("");
    const [allFlows, setAllFlows] = useState<FlowInfo[]>([]);
    const [confirmApp, setConfirmApp] = useState(false);
    const [loading, setLoading] = useState(true);
    const [kindFilter, setKindFilter] = useState<KindFilter>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [lastClicked, setLastClicked] = useState<string | null>(null);

    const [progress, setProgress] = useState<Progress | null>(null);
    const [results, setResults] = useState<FlowResult[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cancelled, setCancelled] = useState(false);
    const [shown, setShown] = useState(PAGE_SIZE);

    // Messages pushed from the main entry point
    useEffect(() => {
        let handlerRef: Awaited<ReturnType<Messaging["addMessageHandler"]>> | undefined;
        let disposed = false;
        messaging
            .addMessageHandler<Push>(async ({ message }) => {
                if (message.type === "formatProgress") {
                    setProgress({ done: message.done, total: message.total, current: message.current });
                } else if (message.type === "formatDone") {
                    setProgress(null);
                    setResults(message.results);
                    setCancelled(!!message.cancelled);
                }
            })
            .then((ref) => {
                if (disposed) void messaging.removeMessageHandler(ref);
                else handlerRef = ref;
            });
        return () => {
            disposed = true;
            if (handlerRef) void messaging.removeMessageHandler(handlerRef);
        };
    }, [messaging]);

    useEffect(() => {
        request(messaging, { type: "getModules" }).then((r) => {
            if (r.type === "modules") {
                setModules(r.modules);
                setModuleName((current) => current || r.modules[0] || "");
            }
        });
    }, [messaging]);

    useEffect(() => {
        request(messaging, { type: "getAllFlows" }).then((r) => {
            if (r.type !== "flows") return;
            setAllFlows(r.flows);
            setError(r.error ?? null);
            setLoading(false);
        });
    }, [messaging]);

    useEffect(() => {
        setSelected(new Set());
        setLastClicked(null);
        setConfirmApp(false);
    }, [moduleName]);

    const flows = useMemo(() => allFlows.filter((f) => f.moduleName === moduleName), [allFlows, moduleName]);

    const visible = useMemo(() => {
        const q = search.trim().toLowerCase();
        return flows.filter((f) => (kindFilter === "all" || f.kind === kindFilter) && (!q || f.name.toLowerCase().includes(q)));
    }, [flows, kindFilter, search]);

    const counts = useMemo(
        () => ({
            microflow: flows.filter((f) => f.kind === "microflow").length,
            nanoflow: flows.filter((f) => f.kind === "nanoflow").length
        }),
        [flows]
    );

    useEffect(() => setShown(PAGE_SIZE), [moduleName, kindFilter, search]);

    const resultById = useMemo(() => new Map((results ?? []).map((r) => [r.id, r])), [results]);
    const busy = progress !== null;
    const selectedVisible = visible.filter((f) => selected.has(f.id));
    const allVisibleSelected = visible.length > 0 && selectedVisible.length === visible.length;

    // Plain click toggles, shift+click selects the range since the last click.
    const toggle = (flow: FlowInfo, shift: boolean) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (shift && lastClicked) {
                const a = visible.findIndex((f) => f.id === lastClicked);
                const b = visible.findIndex((f) => f.id === flow.id);
                if (a >= 0 && b >= 0) {
                    const turnOn = !prev.has(flow.id);
                    for (const f of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) {
                        if (turnOn) next.add(f.id);
                        else next.delete(f.id);
                    }
                    return next;
                }
            }
            if (next.has(flow.id)) next.delete(flow.id);
            else next.add(flow.id);
            return next;
        });
        setLastClicked(flow.id);
    };

    const toggleAll = () =>
        setSelected((prev) => {
            const next = new Set(prev);
            for (const f of visible) {
                if (allVisibleSelected) next.delete(f.id);
                else next.add(f.id);
            }
            return next;
        });

    const open = (id: string) => void request(messaging, { type: "open", id });

    const run = async (list: FlowInfo[]) => {
        if (list.length === 0) return;
        setConfirmApp(false);
        setError(null);
        setResults(null);
        setCancelled(false);
        setProgress({ done: 0, total: list.length, current: "" });
        const r = await request(messaging, { type: "format", flows: list.map(({ id, kind }) => ({ id, kind })) });
        if (r.type === "ack" && !r.ok) {
            setProgress(null);
            setError(r.error ?? "Could not start formatting.");
        }
    };

    const formatted = results?.filter((r) => r.status === "formatted") ?? [];
    const failed = results?.filter((r) => r.status === "error") ?? [];
    const kindWord = kindFilter === "all" ? "flows" : kindFilter + "s";
    const allCount = kindFilter === "all" ? flows.length : counts[kindFilter];

    return (
        <div className="app">
            <div className="header">
                <div>
                    <h1>Flow Format</h1>
                    <p className="sub">Removes excess horizontal whitespace from microflows and nanoflows without changing any logic.</p>
                </div>
            </div>

            <div className="card options">
                <label className="check">
                    Module
                    <select value={moduleName} disabled={busy} onChange={(e) => setModuleName(e.target.value)}>
                        {modules.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </select>
                </label>
                <div className="seg">
                    {(["all", "microflow", "nanoflow"] as const).map((k) => (
                        <button key={k} className={"seg-btn" + (kindFilter === k ? " on" : "")} onClick={() => setKindFilter(k)}>
                            {k === "all" ? `All (${flows.length})` : `${kindLabel(k)}s (${counts[k]})`}
                        </button>
                    ))}
                </div>
                <input className="search" placeholder="Filter by name" value={search} onChange={(e) => setSearch(e.target.value)} />
                <div className="spacer" />
                <button className="btn" disabled={busy || selected.size === 0} onClick={() => run(flows.filter((f) => selected.has(f.id)))}>
                    Format selected ({selected.size})
                </button>
                <button className="btn primary" disabled={busy || allCount === 0} onClick={() => run(flows.filter((f) => kindFilter === "all" || f.kind === kindFilter))}>
                    Format all {kindWord} in {moduleName || "module"} ({allCount})
                </button>
                <button className="btn" disabled={busy || allFlows.length === 0} onClick={() => setConfirmApp(true)}>
                    Format all flows in app ({allFlows.length})
                </button>
            </div>

            {confirmApp && !busy && (
                <div className="banner warn">
                    This formats all {allFlows.length} microflows and nanoflows in {new Set(allFlows.map((f) => f.moduleName)).size} modules, including any
                    Marketplace modules (those may fail if they are protected). Make sure your work is committed first.
                    <div className="confirm-actions">
                        <button className="btn primary small" onClick={() => run(allFlows)}>
                            Format everything
                        </button>
                        <button className="btn small" onClick={() => setConfirmApp(false)}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {progress && (
                <div className="card">
                    <div className="progress-text">
                        <span>Formatting {progress.current}</span>
                        <span>
                            {progress.done} / {progress.total}
                        </span>
                    </div>
                    <div className="bar">
                        <div className="bar-fill" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                    </div>
                    <div className="confirm-actions">
                        <button className="btn small" onClick={() => void request(messaging, { type: "cancel" })}>
                            Cancel
                        </button>
                        <span className="hint">Runs in the background. Flows already formatted stay formatted if you cancel.</span>
                    </div>
                </div>
            )}

            {error && <div className="banner error">{error}</div>}

            {results && !progress && (
                <div className={"banner " + (failed.length ? "warn" : "ok")}>
                    {cancelled && "Cancelled. "}Formatted {formatted.length} of {results.length} flow{results.length === 1 ? "" : "s"}
                    {results.length - formatted.length - failed.length > 0 && `, ${results.length - formatted.length - failed.length} already compact`}
                    {failed.length > 0 && `, ${failed.length} failed`}. Use Studio Pro&apos;s undo or version control if you want to revert.
                    {failed.length > 0 && (
                        <ul>
                            {failed.map((r) => (
                                <li key={r.id}>
                                    {r.moduleName}.{r.name}: {r.message}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <div className="card list">
                <div className="row head">
                    <input type="checkbox" checked={allVisibleSelected} disabled={busy || visible.length === 0} onChange={toggleAll} title="Select all shown" />
                    <span className="name">Name</span>
                    <span className="type">Type</span>
                    <span className="res">Last run</span>
                    <span className="act" />
                </div>
                {loading && <p className="muted pad">Loading flows...</p>}
                {!loading && visible.length === 0 && <p className="muted pad">No flows to show.</p>}
                {visible.slice(0, shown).map((f) => {
                    const r = resultById.get(f.id);
                    return (
                        <div key={f.id} className={"row" + (selected.has(f.id) ? " sel" : "")} onClick={(e) => !busy && toggle(f, e.shiftKey)} onDoubleClick={() => open(f.id)}>
                            <input type="checkbox" readOnly checked={selected.has(f.id)} disabled={busy} />
                            <span className="name">{f.name}</span>
                            <span className="type">{kindLabel(f.kind)}</span>
                            <span className={"res " + (r?.status ?? "")}>
                                {r ? (r.status === "formatted" ? `-${r.pixelsSaved}px` : r.status === "unchanged" ? "already compact" : "failed") : ""}
                            </span>
                            <button
                                className="btn small"
                                title="Open this flow in the editor"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    open(f.id);
                                }}
                            >
                                Open
                            </button>
                        </div>
                    );
                })}
                {visible.length > shown && (
                    <p className="pad">
                        <button className="btn small" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                            Show more ({visible.length - shown} not shown)
                        </button>{" "}
                        <span className="hint">Selecting all or formatting a module still covers every flow, shown or not.</span>
                    </p>
                )}
                <p className="hint pad">Click rows to select several flows, shift+click for a range. Double-click a row or press Open to see the flow in the editor. You can also right-click a single flow in the App Explorer and choose &quot;Remove flow whitespace&quot;.</p>
            </div>
        </div>
    );
}
