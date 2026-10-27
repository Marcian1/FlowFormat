// Horizontal compaction of a microflow / nanoflow diagram.
//
// Works on the plain model objects handed out by the Extensions API and mutates them in place. The
// caller is responsible for saving the unit afterwards. Positions are `relativeMiddlePoint` (centre) and
// `size`, so an object spans [x - width / 2, x + width / 2].

type Obj = {
    $ID: string;
    $Type: string;
    relativeMiddlePoint: { x: number; y: number };
    size: { width: number; height: number };
    objectCollection?: { objects: Obj[] };
};

type Flow = {
    $ID: string;
    $Type: string;
    origin: string;
    destination: string;
    line?: {
        $Type: string;
        originControlVector?: { width: number; height: number };
        destinationControlVector?: { width: number; height: number };
    };
    caseValues?: { $Type: string; value?: unknown; enumerationValue?: unknown }[];
};

export type CompactOptions = {
    /** Horizontal space that is kept between the right edge of an element and the left edge of the next one */
    gap: number;
    /** Centres closer together than this (px) are treated as one column / one row */
    alignTolerance: number;
    /** Never bring two objects closer than this when they are on the same row */
    minClearance: number;
};

export const DEFAULT_OPTIONS: CompactOptions = { gap: 40, alignTolerance: 10, minClearance: 12 };

const CHAR_WIDTH = 7;

const isAnnotation = (o: Obj) => o.$Type === "Microflows$Annotation";
const left = (o: Obj) => o.relativeMiddlePoint.x - o.size.width / 2;
const right = (o: Obj) => o.relativeMiddlePoint.x + o.size.width / 2;
const top = (o: Obj) => o.relativeMiddlePoint.y - o.size.height / 2;
const bottom = (o: Obj) => o.relativeMiddlePoint.y + o.size.height / 2;

/** Enumeration / inheritance case captions are drawn on the flow, so such flows need more room. */
function labelWidth(flow: Flow): number {
    let width = 0;
    for (const c of flow.caseValues ?? []) {
        const text = c.$Type === "Microflows$EnumerationCase" ? String(c.value ?? "") : c.$Type === "Microflows$InheritanceCase" ? "entity" : "";
        width = Math.max(width, text.length * CHAR_WIDTH + 20);
    }
    return width;
}

/**
 * Compacts one object collection (the flow itself or the body of a loop).
 * Returns the horizontal distance the right-most content edge moved to the left.
 */
function compactCollection(objects: Obj[], flows: Flow[], opts: CompactOptions): number {
    const members = new Map(objects.map((o) => [o.$ID, o]));
    const ownFlows = flows.filter((f) => members.has(f.origin) && members.has(f.destination));
    const annotationFlows = ownFlows.filter((f) => f.$Type === "Microflows$AnnotationFlow");
    const seqFlows = ownFlows.filter((f) => f.$Type !== "Microflows$AnnotationFlow");

    const before = new Map(objects.map((o) => [o.$ID, { x: o.relativeMiddlePoint.x, w: o.size.width }]));
    const contentRight = (list: Obj[]) => list.reduce((m, o) => Math.max(m, right(o)), -Infinity);
    const rightBefore = contentRight(objects);

    // Inner loops first, so the outer pass sees their final size.
    for (const o of objects) {
        if (o.$Type === "Microflows$LoopedActivity" && o.objectCollection) {
            const saved = compactCollection(o.objectCollection.objects, flows, opts);
            if (saved > 0) {
                // Keep the left edge of the loop where it is, shrink from the right.
                o.size = { ...o.size, width: o.size.width - saved };
                o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x: o.relativeMiddlePoint.x - saved / 2 };
            }
        }
    }

    const nodes = objects.filter((o) => !isAnnotation(o));
    if (nodes.length === 0) return 0;

    // Snap slightly misaligned rows: a connected neighbour that is a few pixels off gets the same y.
    for (const f of [...seqFlows].sort((a, b) => left(members.get(a.origin)!) - left(members.get(b.origin)!))) {
        const a = members.get(f.origin)!;
        const b = members.get(f.destination)!;
        const dy = b.relativeMiddlePoint.y - a.relativeMiddlePoint.y;
        if (dy !== 0 && Math.abs(dy) < opts.alignTolerance) {
            b.relativeMiddlePoint = { ...b.relativeMiddlePoint, y: a.relativeMiddlePoint.y };
        }
    }

    // Group into columns by centre x. Objects in one column always move together, which keeps
    // split / merge pairs and stacked end events vertically aligned.
    const sorted = [...nodes].sort((a, b) => a.relativeMiddlePoint.x - b.relativeMiddlePoint.x);
    const columns: Obj[][] = [];
    for (const o of sorted) {
        const col = columns[columns.length - 1];
        if (col && o.relativeMiddlePoint.x - col[0].relativeMiddlePoint.x < opts.alignTolerance) col.push(o);
        else columns.push([o]);
    }
    for (const col of columns) {
        const x = col[0].relativeMiddlePoint.x;
        for (const o of col) o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x };
    }

    const columnOf = new Map<string, number>();
    columns.forEach((col, i) => col.forEach((o) => columnOf.set(o.$ID, i)));
    const incoming = new Map<string, Flow[]>();
    for (const f of seqFlows) {
        if (columnOf.get(f.origin)! < columnOf.get(f.destination)!) {
            (incoming.get(f.destination) ?? incoming.set(f.destination, []).get(f.destination)!).push(f);
        }
    }

    // Left-to-right sweep. `placed` holds everything that is already in its final position.
    const placed: Obj[] = [];
    const shiftOf = new Map<string, number>();
    columns.forEach((col, i) => {
        let shift = Infinity;
        for (const o of col) {
            for (const f of incoming.get(o.$ID) ?? []) {
                const origin = members.get(f.origin)!;
                const wanted = Math.max(opts.gap, labelWidth(f));
                shift = Math.min(shift, left(o) - right(origin) - wanted);
            }
        }
        // A column without incoming flows (start event, parameters, ...) stays where it is.
        if (!isFinite(shift) || i === 0) shift = 0;
        shift = Math.max(0, shift);

        // Skip the part of the move that would make us overlap something already placed.
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

    // Annotations follow the activity they are attached to; loose ones follow the nearest activity.
    for (const o of objects.filter(isAnnotation)) {
        const link = annotationFlows.find((f) => f.origin === o.$ID || f.destination === o.$ID);
        const otherId = link ? (link.origin === o.$ID ? link.destination : link.origin) : undefined;
        let shift = otherId ? shiftOf.get(otherId) : undefined;
        if (shift === undefined) {
            let best = Infinity;
            for (const n of nodes) {
                const d = Math.abs(before.get(n.$ID)!.x - o.relativeMiddlePoint.x);
                if (d < best) {
                    best = d;
                    shift = shiftOf.get(n.$ID);
                }
            }
        }
        if (shift) o.relativeMiddlePoint = { ...o.relativeMiddlePoint, x: o.relativeMiddlePoint.x - shift };
    }

    // Shrink bezier handles in proportion to the distance that was removed, so curves do not bulge.
    for (const f of ownFlows) {
        const a = members.get(f.origin)!;
        const b = members.get(f.destination)!;
        const oldSpan = before.get(b.$ID)!.x - before.get(a.$ID)!.x;
        const newSpan = b.relativeMiddlePoint.x - a.relativeMiddlePoint.x;
        if (f.line?.$Type === "Microflows$BezierCurve" && oldSpan > 0 && newSpan > 0 && newSpan < oldSpan) {
            const ratio = newSpan / oldSpan;
            for (const key of ["originControlVector", "destinationControlVector"] as const) {
                const v = f.line[key];
                if (v) f.line[key] = { width: Math.round(v.width * ratio), height: v.height };
            }
        }
    }

    return Math.max(0, rightBefore - contentRight(objects));
}

/** Compacts a whole flow. Returns how many pixels narrower the diagram became. */
export function compactFlow(flow: { objectCollection: { objects: unknown[] }; flows: unknown[] }, opts: CompactOptions = DEFAULT_OPTIONS): number {
    return compactCollection(flow.objectCollection.objects as Obj[], flow.flows as Flow[], opts);
}
