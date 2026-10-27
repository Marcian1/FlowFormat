import {
  era
} from "./chunk-WA3LWEMV.js";

// src/main/compactor.ts
var DEFAULT_OPTIONS = { gap: 40, alignTolerance: 10, minClearance: 12 };
var CHAR_WIDTH = 7;
var isAnnotation = (o) => o.$Type === "Microflows$Annotation";
var left = (o) => o.relativeMiddlePoint.x - o.size.width / 2;
var right = (o) => o.relativeMiddlePoint.x + o.size.width / 2;
var top = (o) => o.relativeMiddlePoint.y - o.size.height / 2;
var bottom = (o) => o.relativeMiddlePoint.y + o.size.height / 2;
function labelWidth(flow) {
  let width = 0;
  for (const c of flow.caseValues ?? []) {
    const text = c.$Type === "Microflows$EnumerationCase" ? String(c.value ?? "") : c.$Type === "Microflows$InheritanceCase" ? "entity" : "";
    width = Math.max(width, text.length * CHAR_WIDTH + 20);
  }
  return width;
}
function compactCollection(objects, flows, opts) {
  const members = new Map(objects.map((o) => [o.$ID, o]));
  const ownFlows = flows.filter((f) => members.has(f.origin) && members.has(f.destination));
  const annotationFlows = ownFlows.filter((f) => f.$Type === "Microflows$AnnotationFlow");
  const seqFlows = ownFlows.filter((f) => f.$Type !== "Microflows$AnnotationFlow");
  const before = new Map(objects.map((o) => [o.$ID, { x: o.relativeMiddlePoint.x, w: o.size.width }]));
  const contentRight = (list) => list.reduce((m, o) => Math.max(m, right(o)), -Infinity);
  const rightBefore = contentRight(objects);
  for (const o of objects) {
    if (o.$Type === "Microflows$LoopedActivity" && o.objectCollection) {
      const saved = compactCollection(o.objectCollection.objects, flows, opts);
      if (saved > 0) {
        o.size = { ...o.size, width: o.size.width - saved };
        o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x: o.relativeMiddlePoint.x - saved / 2 };
      }
    }
  }
  const nodes = objects.filter((o) => !isAnnotation(o));
  if (nodes.length === 0) return 0;
  for (const f of [...seqFlows].sort((a, b) => left(members.get(a.origin)) - left(members.get(b.origin)))) {
    const a = members.get(f.origin);
    const b = members.get(f.destination);
    const dy = b.relativeMiddlePoint.y - a.relativeMiddlePoint.y;
    if (dy !== 0 && Math.abs(dy) < opts.alignTolerance) {
      b.relativeMiddlePoint = { ...b.relativeMiddlePoint, y: a.relativeMiddlePoint.y };
    }
  }
  const sorted = [...nodes].sort((a, b) => a.relativeMiddlePoint.x - b.relativeMiddlePoint.x);
  const columns = [];
  for (const o of sorted) {
    const col = columns[columns.length - 1];
    if (col && o.relativeMiddlePoint.x - col[0].relativeMiddlePoint.x < opts.alignTolerance) col.push(o);
    else columns.push([o]);
  }
  for (const col of columns) {
    const x = col[0].relativeMiddlePoint.x;
    for (const o of col) o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x };
  }
  const columnOf = /* @__PURE__ */ new Map();
  columns.forEach((col, i) => col.forEach((o) => columnOf.set(o.$ID, i)));
  const incoming = /* @__PURE__ */ new Map();
  for (const f of seqFlows) {
    if (columnOf.get(f.origin) < columnOf.get(f.destination)) {
      (incoming.get(f.destination) ?? incoming.set(f.destination, []).get(f.destination)).push(f);
    }
  }
  const placed = [];
  const shiftOf = /* @__PURE__ */ new Map();
  columns.forEach((col, i) => {
    let shift = Infinity;
    for (const o of col) {
      for (const f of incoming.get(o.$ID) ?? []) {
        const origin = members.get(f.origin);
        const wanted = Math.max(opts.gap, labelWidth(f));
        shift = Math.min(shift, left(o) - right(origin) - wanted);
      }
    }
    if (!isFinite(shift) || i === 0) shift = 0;
    shift = Math.max(0, shift);
    for (const o of col) {
      for (const p of placed) {
        const verticallyClose = top(o) - opts.minClearance < bottom(p) && bottom(o) + opts.minClearance > top(p);
        if (verticallyClose) shift = Math.min(shift, Math.max(0, left(o) - right(p) - opts.minClearance));
      }
    }
    for (const o of col) {
      o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x: o.relativeMiddlePoint.x - shift };
      shiftOf.set(o.$ID, shift);
      placed.push(o);
    }
  });
  for (const o of objects.filter(isAnnotation)) {
    const link = annotationFlows.find((f) => f.origin === o.$ID || f.destination === o.$ID);
    const otherId = link ? link.origin === o.$ID ? link.destination : link.origin : void 0;
    let shift = otherId ? shiftOf.get(otherId) : void 0;
    if (shift === void 0) {
      let best = Infinity;
      for (const n of nodes) {
        const d = Math.abs(before.get(n.$ID).x - o.relativeMiddlePoint.x);
        if (d < best) {
          best = d;
          shift = shiftOf.get(n.$ID);
        }
      }
    }
    if (shift) o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x: o.relativeMiddlePoint.x - shift };
  }
  for (const f of ownFlows) {
    const a = members.get(f.origin);
    const b = members.get(f.destination);
    const oldSpan = before.get(b.$ID).x - before.get(a.$ID).x;
    const newSpan = b.relativeMiddlePoint.x - a.relativeMiddlePoint.x;
    if (f.line?.$Type === "Microflows$BezierCurve" && oldSpan > 0 && newSpan > 0 && newSpan < oldSpan) {
      const ratio = newSpan / oldSpan;
      for (const key of ["originControlVector", "destinationControlVector"]) {
        const v = f.line[key];
        if (v) f.line[key] = { width: Math.round(v.width * ratio), height: v.height };
      }
    }
  }
  return Math.max(0, rightBefore - contentRight(objects));
}
function compactFlow(flow, opts = DEFAULT_OPTIONS) {
  return compactCollection(flow.objectCollection.objects, flow.flows, opts);
}

// src/main/formatter.ts
var TYPES = {
  microflow: "Microflows$Microflow",
  nanoflow: "Microflows$Nanoflow"
};
function accessor(studioPro, kind) {
  const model = studioPro.app.model;
  return kind === "microflow" ? model.microflows : model.nanoflows;
}
async function listModules(studioPro) {
  const modules = await studioPro.app.model.modules.getModules();
  return modules.map((m) => m.name).sort((a, b) => a.localeCompare(b));
}
async function listAllFlows(studioPro) {
  const flows = [];
  for (const kind of ["microflow", "nanoflow"]) {
    const infos = await accessor(studioPro, kind).getUnitsInfo();
    for (const u of infos) {
      if (u.$Type === TYPES[kind]) {
        flows.push({ id: u.$ID, kind, name: u.name ?? "", moduleName: u.moduleName ?? "" });
      }
    }
  }
  return flows.sort((a, b) => a.moduleName.localeCompare(b.moduleName) || a.name.localeCompare(b.name));
}
async function findFlow(studioPro, id) {
  for (const kind of ["microflow", "nanoflow"]) {
    const infos = await accessor(studioPro, kind).getUnitsInfo();
    const hit = infos.find((u) => u.$ID === id);
    if (hit) return { id, kind, name: hit.name ?? "", moduleName: hit.moduleName ?? "" };
  }
  return void 0;
}
var BATCH_SIZE = 25;
var yieldToHost = () => new Promise((resolve) => setTimeout(resolve, 0));
var label = (info, fallback) => info ? `${info.moduleName}.${info.name}` : fallback;
async function formatLoaded(api, unit, info) {
  const base = { id: info.id, kind: info.kind, name: info.name, moduleName: info.moduleName };
  try {
    const saved = compactFlow(unit);
    if (saved <= 0) return { ...base, status: "unchanged", pixelsSaved: 0 };
    await api.save(unit);
    return { ...base, status: "formatted", pixelsSaved: Math.round(saved) };
  } catch (e) {
    console.error("[FlowFormat] format failed", info, e);
    return { ...base, status: "error", message: e?.message ?? String(e) };
  }
}
async function formatFlows(studioPro, flows, onProgress, shouldCancel = () => false) {
  const infos = /* @__PURE__ */ new Map();
  for (const kind of ["microflow", "nanoflow"]) {
    for (const u of await accessor(studioPro, kind).getUnitsInfo()) {
      if (u.$Type === TYPES[kind]) infos.set(u.$ID, { id: u.$ID, kind, name: u.name ?? "", moduleName: u.moduleName ?? "" });
    }
  }
  const results = [];
  let cancelled = false;
  const total = flows.length;
  let lastPush = 0;
  const report = (current, force = false) => {
    const now = Date.now();
    if (force || now - lastPush >= 150) {
      lastPush = now;
      onProgress(results.length, total, current);
    }
  };
  for (const kind of ["microflow", "nanoflow"]) {
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
      let units = [];
      try {
        units = await api.loadAll((u) => wanted.has(u.$ID), batch.length);
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

// src/main/index.ts
var component = {
  async loaded(componentContext) {
    if (componentContext.runMode === "headless") {
      return;
    }
    const studioPro = era(componentContext);
    const messaging = studioPro.ui.messagePassing;
    const openTab = () => studioPro.ui.tabs.open(
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
    const formatSingle = async ({ documentId }) => {
      const flow = await findFlow(studioPro, documentId);
      if (!flow) return;
      const {
        results: [result]
      } = await formatFlows(studioPro, [flow], () => {
      });
      const message = result.status === "formatted" ? `Removed ${result.pixelsSaved}px of whitespace.` : result.status === "unchanged" ? "Nothing to compact." : `Failed: ${result.message}`;
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
    const push = (message) => messaging.sendMessage(message);
    const reply = (messageId, response) => messaging.sendResponse(messageId, response);
    let busy = false;
    let cancelRequested = false;
    await messaging.addMessageHandler(async ({ messageId, message }) => {
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
            await reply(messageId, { type: "flows", flows: [], error: e?.message ?? String(e) });
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
          void formatFlows(
            studioPro,
            message.flows,
            (done, total, current) => void push({ type: "formatProgress", done, total, current }),
            () => cancelRequested
          ).then(({ results, cancelled }) => push({ type: "formatDone", results, cancelled })).catch((e) => {
            console.error("[FlowFormat] format failed", e);
            return push({ type: "formatDone", results: [] });
          }).finally(() => {
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
export {
  component
};
//# sourceMappingURL=main.js.map
