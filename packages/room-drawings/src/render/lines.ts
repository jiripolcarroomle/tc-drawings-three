import type { ClassedSegment } from './hlr.ts';

/**
 * Merges collinear, overlapping segments (adjacent parts share outlines, so many edges are drawn twice).
 * On a shared piece the class with the higher priority wins (heavier line), the others keep only what is left.
 */
export function mergeSegments(segments: ClassedSegment[], priority: (cls: string | undefined) => number, tolerance = 0.05): ClassedSegment[] {
    interface Interval { t0: number; t1: number }
    interface Line { dx: number; dy: number; offset: number; byClass: Map<string | undefined, Interval[]> }
    const lines = new Map<string, Line>();
    for (const s of segments) {
        let dx = s.x2 - s.x1, dy = s.y2 - s.y1;
        const length = Math.hypot(dx, dy);
        if (length < tolerance) continue;
        dx /= length;
        dy /= length;
        if (dx < -1e-9 || (Math.abs(dx) <= 1e-9 && dy < 0)) { dx = -dx; dy = -dy; } // canonical direction
        const offset = -dy * s.x1 + dx * s.y1;
        const key = Math.round(Math.atan2(dy, dx) * 1e4) + ':' + Math.round(offset / tolerance);
        let line = lines.get(key);
        if (!line) {
            line = { dx, dy, offset, byClass: new Map() };
            lines.set(key, line);
        }
        const ta = dx * s.x1 + dy * s.y1, tb = dx * s.x2 + dy * s.y2;
        const list = line.byClass.get(s.cls) ?? line.byClass.set(s.cls, []).get(s.cls)!;
        list.push({ t0: Math.min(ta, tb), t1: Math.max(ta, tb) });
    }

    const result: ClassedSegment[] = [];
    for (const line of lines.values()) {
        const covered: Interval[] = [];
        const classes = [...line.byClass.keys()].sort((a, b) => priority(b) - priority(a) || String(a).localeCompare(String(b)));
        for (const cls of classes) {
            for (const interval of union(line.byClass.get(cls)!, tolerance)) {
                for (const piece of subtract(interval, covered, tolerance)) {
                    result.push({
                        cls,
                        x1: line.dx * piece.t0 - line.dy * line.offset, y1: line.dy * piece.t0 + line.dx * line.offset,
                        x2: line.dx * piece.t1 - line.dy * line.offset, y2: line.dy * piece.t1 + line.dx * line.offset,
                    });
                }
                covered.push(interval);
            }
        }
    }
    return result;

    function union(intervals: Interval[], tol: number): Interval[] {
        const sorted = [...intervals].sort((a, b) => a.t0 - b.t0);
        const merged: Interval[] = [];
        for (const i of sorted) {
            const last = merged[merged.length - 1];
            if (last && i.t0 <= last.t1 + tol) last.t1 = Math.max(last.t1, i.t1);
            else merged.push({ ...i });
        }
        return merged;
    }

    function subtract(interval: Interval, cover: Interval[], tol: number): Interval[] {
        let pieces = [interval];
        for (const c of cover) {
            pieces = pieces.flatMap(p => {
                if (c.t1 <= p.t0 + tol || c.t0 >= p.t1 - tol) return [p];
                const rest: Interval[] = [];
                if (c.t0 > p.t0 + tol) rest.push({ t0: p.t0, t1: c.t0 });
                if (c.t1 < p.t1 - tol) rest.push({ t0: c.t1, t1: p.t1 });
                return rest;
            });
        }
        return pieces;
    }
}
