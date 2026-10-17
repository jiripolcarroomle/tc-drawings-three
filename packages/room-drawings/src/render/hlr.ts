import { cross, dot, normalize, scale, vec3, type Vec2, type Vec3 } from '../math.ts';
import type { Solid } from '../geometry/solids.ts';

/**
 * Orthographic projection with exact hidden-line removal.
 * Every candidate edge is split where it crosses the outline of a face in front of it; each piece is visible
 * when no front-facing face covers its midpoint at a smaller distance to the viewer. Faces that contain the
 * edge (its own faces, coplanar neighbours) never hide it. Face lookup goes through a uniform grid.
 */

export interface ViewBasis {
    right: Vec3;
    up: Vec3;
    /** Unit vector pointing to the viewer (larger = closer). */
    toward: Vec3;
}

/** Camera basis looking along `direction`, with world +y up (or +z when looking straight down/up). */
export function viewBasis(direction: Vec3): ViewBasis {
    const toward = normalize(scale(direction, -1));
    const worldUp = Math.abs(direction.y) > 0.999 * Math.hypot(direction.x, direction.y, direction.z) ? vec3(0, 0, 1) : vec3(0, 1, 0);
    const right = normalize(cross(worldUp, toward));
    return { right, up: cross(toward, right), toward };
}

export interface ProjectedFace {
    solid: number;
    rings: Vec2[][];
    /** Largest distance towards the viewer, used for painting far to near. */
    depthMax: number;
    cls: string | undefined;
}

export interface ClassedSegment {
    cls: string | undefined;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface HlrResult {
    /** Front-facing faces, sorted far to near. */
    faces: ProjectedFace[];
    visible: ClassedSegment[];
    /** Hidden edge pieces, only for solids where `wantHidden` is true. */
    hidden: ClassedSegment[];
}

interface Occluder {
    solid: number;
    face: number;
    rings: Vec2[][];
    normal: Vec3; // view coordinates
    d: number;
    minX: number; maxX: number; minY: number; maxY: number;
}

export interface HlrOptions {
    /** Required depth difference for an occlusion [mm]. */
    depthTolerance: number;
    /** Points closer than this to a face outline are not covered by the face [mm]. */
    boundaryTolerance: number;
    cellSize?: number;
}

export function hiddenLineRender(solids: Solid[], classes: (string | undefined)[], wantHidden: boolean[], basis: ViewBasis, options: HlrOptions): HlrResult {
    const toView = (p: Vec3) => vec3(dot(p, basis.right), dot(p, basis.up), dot(p, basis.toward));
    const cell = options.cellSize ?? 250;

    // front-facing faces = occluders (back faces of closed solids are always behind their front faces)
    const occluders: Occluder[] = [];
    const facing: boolean[][] = solids.map(() => []);
    const faces: ProjectedFace[] = [];
    solids.forEach((solid, si) => solid.faces.forEach((face, fi) => {
        const normal = toView(face.normal);
        facing[si][fi] = normal.z > 1e-6;
        if (!facing[si][fi]) return;
        const viewRings = face.rings.map(ring => ring.map(toView));
        const flat = viewRings.flat();
        const rings = viewRings.map(ring => ring.map(p => ({ x: p.x, y: p.y })));
        occluders.push({
            solid: si, face: fi, rings, normal, d: dot(normal, viewRings[0][0]),
            minX: Math.min(...flat.map(p => p.x)), maxX: Math.max(...flat.map(p => p.x)),
            minY: Math.min(...flat.map(p => p.y)), maxY: Math.max(...flat.map(p => p.y)),
        });
        faces.push({ solid: si, rings, depthMax: Math.max(...flat.map(p => p.z)), cls: classes[si] });
    }));
    const depthAt = (o: Occluder, x: number, y: number) => (o.d - o.normal.x * x - o.normal.y * y) / o.normal.z;

    const grid = new Map<string, number[]>();
    occluders.forEach((o, index) => {
        for (let gx = Math.floor(o.minX / cell); gx <= Math.floor(o.maxX / cell); gx++) {
            for (let gy = Math.floor(o.minY / cell); gy <= Math.floor(o.maxY / cell); gy++) {
                const key = gx + ',' + gy;
                const list = grid.get(key);
                if (list) list.push(index); else grid.set(key, [index]);
            }
        }
    });

    const covers = (o: Occluder, x: number, y: number): boolean => {
        if (x < o.minX || x > o.maxX || y < o.minY || y > o.maxY) return false;
        let inside = false;
        for (const ring of o.rings) {
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const a = ring[i], b = ring[j];
                if (distanceToSegment(x, y, a, b) < options.boundaryTolerance) return false;
                if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
            }
        }
        return inside;
    };

    const visible: ClassedSegment[] = [];
    const hidden: ClassedSegment[] = [];
    solids.forEach((solid, si) => solid.edges.forEach(edge => {
        if (!edge.faces.some(fi => facing[si][fi])) return; // only front and silhouette edges
        const A = toView(edge.a), B = toView(edge.b);
        if (Math.hypot(B.x - A.x, B.y - A.y) < 1e-3) return; // edge pointing at the viewer
        const candidates = new Set<number>();
        for (let gx = Math.floor(Math.min(A.x, B.x) / cell); gx <= Math.floor(Math.max(A.x, B.x) / cell); gx++) {
            for (let gy = Math.floor(Math.min(A.y, B.y) / cell); gy <= Math.floor(Math.max(A.y, B.y) / cell); gy++) {
                for (const index of grid.get(gx + ',' + gy) ?? []) candidates.add(index);
            }
        }
        const blockers: Occluder[] = [];
        for (const index of [...candidates].sort((a, b) => a - b)) {
            const o = occluders[index];
            if (o.solid === si && edge.faces.includes(o.face)) continue;
            // an edge lying in the face plane (flush neighbours) is never hidden by that face
            if (Math.abs(depthAt(o, A.x, A.y) - A.z) < options.depthTolerance && Math.abs(depthAt(o, B.x, B.y) - B.z) < options.depthTolerance) continue;
            if (Math.max(A.x, B.x) < o.minX || Math.min(A.x, B.x) > o.maxX || Math.max(A.y, B.y) < o.minY || Math.min(A.y, B.y) > o.maxY) continue;
            blockers.push(o);
        }
        const ts = [0, 1];
        for (const o of blockers) {
            for (const ring of o.rings) {
                for (let i = 0; i < ring.length; i++) {
                    const t = segmentIntersection(A, B, ring[i], ring[(i + 1) % ring.length]);
                    if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
                }
            }
        }
        ts.sort((a, b) => a - b);
        const emit = (isHidden: boolean, t0: number, t1: number) => {
            if (isHidden && !wantHidden[si]) return;
            (isHidden ? hidden : visible).push({ cls: classes[si], x1: A.x + (B.x - A.x) * t0, y1: A.y + (B.y - A.y) * t0, x2: A.x + (B.x - A.x) * t1, y2: A.y + (B.y - A.y) * t1 });
        };
        let runStart = 0, runHidden: boolean | undefined;
        for (let i = 0; i < ts.length - 1; i++) {
            if (ts[i + 1] - ts[i] < 1e-7) continue;
            const t = (ts[i] + ts[i + 1]) / 2;
            const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t, z = A.z + (B.z - A.z) * t;
            const isHidden = blockers.some(o => covers(o, x, y) && depthAt(o, x, y) > z + options.depthTolerance);
            if (runHidden === undefined) {
                runHidden = isHidden;
            }
            else if (isHidden !== runHidden) {
                emit(runHidden, runStart, ts[i]);
                runStart = ts[i];
                runHidden = isHidden;
            }
        }
        if (runHidden !== undefined) emit(runHidden, runStart, 1);
    }));

    return { faces: faces.sort((a, b) => a.depthMax - b.depthMax || a.solid - b.solid), visible, hidden };
}

function distanceToSegment(x: number, y: number, a: Vec2, b: Vec2): number {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}

/** Parameter t on A-B of the intersection with p-q, or -1. */
function segmentIntersection(A: Vec3, B: Vec3, p: Vec2, q: Vec2): number {
    const rx = B.x - A.x, ry = B.y - A.y, sx = q.x - p.x, sy = q.y - p.y;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-12) return -1;
    const t = ((p.x - A.x) * sy - (p.y - A.y) * sx) / denominator;
    const u = ((p.x - A.x) * ry - (p.y - A.y) * rx) / denominator;
    return u >= -1e-9 && u <= 1 + 1e-9 ? t : -1;
}
