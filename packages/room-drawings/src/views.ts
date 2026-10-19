import type { DrawingContent, NodeContext, ViewInfo } from './content.ts';
import { add, cross, dot, length, normalize, scale, sub, transformDirection, vec3, type Vec3 } from './math.ts';
import type { DrawingSettings } from './settings.ts';
import type { Solid } from './geometry/solids.ts';
import { ancestorModule, NodeKind, placedModules, walls, type Scene, type SceneNode } from './scene/scene.ts';

/**
 * Which views exist and what each one shows:
 * - top view: everything,
 * - elevations, grouped by `settings.views.grouping`:
 *   - 'walls': one per wall side that has a (non-generated) module closer than `maxDistanceFromWall`; it shows
 *     that wall and those modules;
 *   - 'runs': modules are grouped into runs (same facing, backs in one plane, neighbours along the run, no wall in
 *     between). A run whose back stands at a wall face belongs to that wall's elevation (which also keeps the
 *     modules close to the wall, as with 'walls'); any other run (peninsula, island, free-standing) gets its own
 *     elevation looking at its fronts.
 *   Generated modules (countertops, toekicks, legs, ...) are shown with their owners (content `ownerIds`);
 *   without owner ids they fall back to the distance from the wall (or the run's back plane).
 */

export interface ViewDefinition extends ViewInfo {
    title: string;
    /** Direction the viewer looks in (world). */
    direction: Vec3;
    wall?: SceneNode;
    /** Wall corners offered to the annotation lines (distances to the walls), world coordinates. */
    wallVertices: Vec3[];
    /**
     * Elevations: letter of the view for the marker in the top view; `at` is the middle of the wall face (or run)
     * moved to the front of the furniture standing there, `direction` the view direction (world).
     */
    marker?: { label: string; at: Vec3; direction: Vec3 };
    /** Draw a floor line under the drawing (elevations without a wall behind). */
    ground?: boolean;
    /** Is a node with geometry part of this view? */
    shows(node: SceneNode): boolean;
}

/** An elevation before it gets its letter. */
interface ElevationPlan {
    name: string;
    title: (label: string) => string;
    direction: Vec3;
    wall?: SceneNode;
    wallVertices: Vec3[];
    /** Line behind the furniture (wall face or run back) and the direction away from it, for the marker. */
    base: { start: Vec3; end: Vec3; away: Vec3 };
    /** Top level modules shown. */
    shown: Set<SceneNode>;
    ground: boolean;
}

/** A module seen from its front: horizontal front direction, right-hand direction of a viewer facing it, extent. */
interface ModuleFrame {
    module: SceneNode;
    front: Vec3;
    right: Vec3;
    /** Rearmost point along `front` (the back plane). */
    back: number;
    /** Foremost point along `front`. */
    frontEdge: number;
    /** Extent along `right`. */
    min: number;
    max: number;
}

export function defineViews(scene: Scene, solids: Map<SceneNode, Solid>, content: DrawingContent, settings: DrawingSettings): ViewDefinition[] {
    const views: ViewDefinition[] = [];
    const included = (node: SceneNode, view: ViewInfo) => content.includeNode?.(nodeContext(node, view)) ?? true;
    const chainIncluded = (node: SceneNode, view: ViewInfo) => {
        for (let current: SceneNode | null = node; current; current = current.parent) {
            if ((current.kind === NodeKind.Part || current.kind === NodeKind.Module) && !included(current, view)) return false;
        }
        return true;
    };

    if (settings.views.top) {
        const info: ViewInfo = { name: 'topview', kind: 'top' };
        views.push({ ...info, title: 'Top view', direction: vec3(0, -1, 0), wallVertices: [], shows: node => node.kind === NodeKind.Wall || chainIncluded(node, info) });
    }
    if (!settings.views.elevations) {
        return views;
    }

    const modules = placedModules(scene);
    const owners = modules.filter(m => !m.module?.generationModuleId);
    const generated = modules.filter(m => !!m.module?.generationModuleId);
    const vertices = new Map<SceneNode, Vec3[]>();
    const verticesOf = (node: SceneNode): Vec3[] => {
        let result = vertices.get(node);
        if (!result) {
            const own = solids.get(node)?.faces.flatMap(face => face.rings.flat()) ?? [];
            result = [...own, ...node.children.flatMap(verticesOf)];
            vertices.set(node, result);
        }
        return result;
    };
    /** The owners shown plus the generated modules that belong to them. */
    const withGenerated = (ownersShown: SceneNode[], closeWithoutOwners: (module: SceneNode) => boolean) => {
        const ownerIds = new Set(ownersShown.map(m => m.module!.uid));
        return new Set<SceneNode>([...ownersShown, ...generated.filter(m => {
            const ids = content.ownerIds?.({ node: m, data: m.data });
            return ids?.length ? ids.some(id => ownerIds.has(id)) : closeWithoutOwners(m);
        })]);
    };

    // outlines of everything in the top view except walls, for the elevation markers
    let furnitureRings: Vec3[][] | undefined;
    const furniture = () => furnitureRings ??= [...solids].filter(([node]) => node.kind !== NodeKind.Wall && chainIncluded(node, { name: 'topview', kind: 'top' }))
        .flatMap(([, solid]) => solid.faces.flatMap(face => face.rings));

    const sides = settings.views.rearElevations ? ['front', 'rear'] as const : ['front'] as const;
    const maxDistance = settings.views.maxDistanceFromWall;
    const plans: ElevationPlan[] = [];
    const wallPlan = (wall: SceneNode, rear: boolean, ownersShown: SceneNode[]): ElevationPlan => {
        const face = wallFace(wall, rear);
        return {
            name: `${wall.id}-${rear ? 'rear' : 'front'}-elevation`,
            title: label => `Elevation ${label} – ${wall.id.replace(/-/g, ' ')}${rear ? ', rear side' : ''}`,
            direction: rear ? scale(wall.wall!.normal, -1) : wall.wall!.normal,
            wall,
            wallVertices: wallFaceCorners(wall.wall!, rear),
            base: face,
            shown: withGenerated(ownersShown, m => closeToFace([m], verticesOf, face, maxDistance).length > 0),
            ground: false,
        };
    };

    if (settings.views.grouping === 'runs') {
        const frames = owners.flatMap(module => {
            const frame = moduleFrame(module, verticesOf, content);
            return frame ? [frame] : [];
        });
        const runs = groupRuns(frames, walls(scene), settings);
        // runs standing at a wall face belong to that wall side
        const atWall = new Map<string, { wall: SceneNode; rear: boolean; modules: SceneNode[] }>();
        const free: ModuleFrame[][] = [];
        for (const run of runs) {
            const found = wallBehind(run, walls(scene), maxDistance);
            if (!found) {
                free.push(run);
                continue;
            }
            const key = `${found.wall.id}:${found.rear}`;
            const entry = atWall.get(key) ?? atWall.set(key, { wall: found.wall, rear: found.rear, modules: [] }).get(key)!;
            entry.modules.push(...run.map(f => f.module));
        }
        for (const wall of walls(scene)) {
            for (const side of sides) {
                const rear = side === 'rear';
                const ownRuns = atWall.get(`${wall.id}:${rear}`)?.modules ?? [];
                const close = closeToFace(owners, verticesOf, wallFace(wall, rear), maxDistance);
                const ownersShown = [...new Set([...ownRuns, ...close])];
                if (ownersShown.length) plans.push(wallPlan(wall, rear, ownersShown));
            }
        }
        // a free run needs its own elevation only when some of its modules are not shown with a wall yet
        const shownAtWalls = new Set(plans.flatMap(plan => [...plan.shown]));
        free.filter(run => run.some(f => !shownAtWalls.has(f.module))).forEach((run, index) => {
            const { front, right } = run[0]!;
            const back = Math.min(...run.map(f => f.back));
            const min = Math.min(...run.map(f => f.min)), max = Math.max(...run.map(f => f.max));
            const base = { start: add(scale(right, min), scale(front, back)), end: add(scale(right, max), scale(front, back)), away: front };
            plans.push({
                name: `run-${index + 1}-elevation`,
                title: label => `Elevation ${label} – free-standing units`,
                direction: scale(front, -1),
                wallVertices: [],
                base,
                shown: withGenerated(run.map(f => f.module), m => closeToFace([m], verticesOf, base, maxDistance).length > 0),
                ground: true,
            });
        });
    }
    else {
        for (const wall of walls(scene)) {
            for (const side of sides) {
                const rear = side === 'rear';
                const ownersClose = closeToFace(owners, verticesOf, wallFace(wall, rear), maxDistance);
                if (ownersClose.length) plans.push(wallPlan(wall, rear, ownersClose));
            }
        }
    }

    plans.forEach((plan, index) => {
        const label = elevationLabel(index);
        const info: ViewInfo = { name: plan.name, kind: 'elevation' };
        views.push({
            ...info,
            title: plan.title(label),
            direction: plan.direction,
            wall: plan.wall,
            wallVertices: plan.wallVertices,
            marker: { label, at: markerPosition(plan.base, furniture(), maxDistance), direction: plan.direction },
            ground: plan.ground || undefined,
            shows: node => {
                if (node.kind === NodeKind.Wall) return node === plan.wall;
                const module = topModule(node);
                return !!module && plan.shown.has(module) && chainIncluded(node, info);
            },
        });
    });
    // the top view gets the corners of all walls that have an elevation
    const top = views.find(v => v.kind === 'top');
    if (top) top.wallVertices.push(...views.flatMap(v => v.kind === 'elevation' ? v.wallVertices : []));
    return views;

    function topModule(node: SceneNode): SceneNode | undefined {
        let result: SceneNode | undefined;
        for (let current: SceneNode | null = node; current; current = current.parent) {
            if (current.kind === NodeKind.Module) result = current;
        }
        return result;
    }
}

/** A, B, ..., Z, AA, AB, ... */
function elevationLabel(index: number): string {
    const letter = String.fromCharCode(65 + index % 26);
    return index < 26 ? letter : elevationLabel(Math.floor(index / 26) - 1) + letter;
}

/** Front or back face of a wall as a line in the floor plan, with the direction into the room on that side. */
function wallFace(wallNode: SceneNode, rear: boolean): { start: Vec3; end: Vec3; away: Vec3 } {
    const wall = wallNode.wall!;
    return rear
        ? { start: wall.backStart, end: wall.backEnd, away: wall.normal }
        : { start: wall.start, end: wall.end, away: scale(wall.normal, -1) };
}

/** How a module faces: its front direction (content `moduleFront`, default local +z) and its extent seen from the front. */
function moduleFrame(module: SceneNode, verticesOf: (node: SceneNode) => Vec3[], content: DrawingContent): ModuleFrame | undefined {
    const points = verticesOf(module);
    if (!points.length) return undefined;
    const local = content.moduleFront?.({ node: module, data: module.data }) ?? vec3(0, 0, 1);
    const direction = transformDirection(module.world, vec3(local.x, local.y, local.z));
    if (Math.hypot(direction.x, direction.z) < 1e-6) return undefined;
    const front = normalize(vec3(direction.x, 0, direction.z));
    const right = normalize(cross(vec3(0, 1, 0), front));
    let back = Infinity, frontEdge = -Infinity, min = Infinity, max = -Infinity;
    for (const p of points) {
        back = Math.min(back, dot(p, front));
        frontEdge = Math.max(frontEdge, dot(p, front));
        const along = dot(p, right);
        min = Math.min(min, along);
        max = Math.max(max, along);
    }
    return { module, front, right, back, frontEdge, min, max };
}

/**
 * Runs: modules facing the same way where the back of one lies within the depth of the other (from its back to its
 * front, extended by `runBackTolerance`) - so units at one wall, and fillers or panels standing at the front of a
 * run, belong together - and that follow each other along the run (gap up to `runGap`, stacked wall units
 * overlap), unless a wall stands between them.
 */
function groupRuns(frames: ModuleFrame[], wallNodes: SceneNode[], settings: DrawingSettings): ModuleFrame[][] {
    const parent = frames.map((_, i) => i);
    const find = (i: number): number => parent[i] === i ? i : (parent[i] = find(parent[i]!));
    const parallel = Math.cos(10 * Math.PI / 180);
    const backPoint = (f: ModuleFrame) => add(add(scale(f.right, (f.min + f.max) / 2), scale(f.front, f.back)), scale(f.front, 50));
    for (let i = 0; i < frames.length; i++) {
        for (let j = i + 1; j < frames.length; j++) {
            const a = frames[i]!, b = frames[j]!;
            if (dot(a.front, b.front) < parallel) continue;
            const tolerance = settings.views.runBackTolerance;
            const backWithin = (f: ModuleFrame, back: number) => back >= f.back - tolerance && back <= f.frontEdge + tolerance;
            if (!backWithin(a, b.back) && !backWithin(b, a.back)) continue;
            const bMin = dot(scale(b.right, (b.min + b.max) / 2), a.right) - (b.max - b.min) / 2;
            const bMax = bMin + (b.max - b.min);
            if (Math.max(a.min, bMin) - Math.min(a.max, bMax) > settings.views.runGap) continue;
            // the cap: never across a wall (points 50 mm in front of the backs, so a wall behind does not count)
            if (wallNodes.some(w => segmentCrossesWall(backPoint(a), backPoint(b), w))) continue;
            parent[find(i)] = find(j);
        }
    }
    const groups = new Map<number, ModuleFrame[]>();
    frames.forEach((frame, i) => {
        const root = find(i);
        (groups.get(root) ?? groups.set(root, []).get(root)!).push(frame);
    });
    return [...groups.values()];
}

/** The wall face a run stands at: facing away from it, back plane within `distance`, overlapping along it. */
function wallBehind(run: ModuleFrame[], wallNodes: SceneNode[], distance: number): { wall: SceneNode; rear: boolean } | undefined {
    const { front, right } = run[0]!;
    const back = Math.min(...run.map(f => f.back));
    const min = Math.min(...run.map(f => f.min)), max = Math.max(...run.map(f => f.max));
    const parallel = Math.cos(10 * Math.PI / 180);
    let best: { wall: SceneNode; rear: boolean; gap: number } | undefined;
    for (const wall of wallNodes) {
        for (const rear of [false, true]) {
            const face = wallFace(wall, rear);
            if (dot(face.away, front) < parallel) continue;
            const gap = back - dot(face.start, front);
            if (gap < -50 || gap > distance) continue;
            const a = dot(face.start, right), b = dot(face.end, right);
            if (Math.min(max, Math.max(a, b)) - Math.max(min, Math.min(a, b)) <= 1) continue;
            if (!best || Math.abs(gap) < Math.abs(best.gap)) best = { wall, rear, gap };
        }
    }
    return best;
}

/** Does the floor plan segment p-q cross the wall body? */
function segmentCrossesWall(p: Vec3, q: Vec3, wallNode: SceneNode): boolean {
    const wall = wallNode.wall!;
    const quad = [wall.start, wall.end, wall.backEnd, wall.backStart];
    const inside = (v: Vec3) => {
        let result = false;
        for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
            const a = quad[i]!, b = quad[j]!;
            if ((a.z > v.z) !== (b.z > v.z) && v.x < ((b.x - a.x) * (v.z - a.z)) / (b.z - a.z) + a.x) result = !result;
        }
        return result;
    };
    if (inside(p) || inside(q)) return true;
    const cross2 = (o: Vec3, a: Vec3, b: Vec3) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    for (let i = 0; i < quad.length; i++) {
        const a = quad[i]!, b = quad[(i + 1) % quad.length]!;
        if (cross2(p, q, a) * cross2(p, q, b) < 0 && cross2(a, b, p) * cross2(a, b, q) < 0) return true;
    }
    return false;
}

/**
 * Middle of the base line (wall face or run back), moved away from it to the front of the furniture standing
 * there: face outlines that come within `band` of the middle (measured along the line) and start closer than
 * `near` to it; furniture elsewhere along the line or across the room does not count.
 */
function markerPosition(base: { start: Vec3; end: Vec3; away: Vec3 }, furniture: Vec3[][], near: number, band = 300): Vec3 {
    const { start, end, away } = base;
    const along = normalize(sub(end, start));
    const half = length(sub(end, start)) / 2;
    const lo = half - band, hi = half + band;
    let depth = 0;
    for (const ring of furniture) {
        let ringMin = Infinity, ringMax = -Infinity;
        for (let i = 0; i < ring.length; i++) {
            const p = sub(ring[i]!, start), q = sub(ring[(i + 1) % ring.length]!, start);
            const pa = dot(p, along), qa = dot(q, along), pd = dot(p, away), qd = dot(q, away);
            // the part of the edge within the band along the line
            let t0 = 0, t1 = 1;
            if (Math.abs(qa - pa) < 1e-9) {
                if (pa < lo || pa > hi) continue;
            }
            else {
                const a = (lo - pa) / (qa - pa), b = (hi - pa) / (qa - pa);
                t0 = Math.max(0, Math.min(a, b));
                t1 = Math.min(1, Math.max(a, b));
                if (t0 > t1) continue;
            }
            const d0 = pd + (qd - pd) * t0, d1 = pd + (qd - pd) * t1;
            ringMin = Math.min(ringMin, d0, d1);
            ringMax = Math.max(ringMax, d0, d1);
        }
        if (ringMin > -1 && ringMin <= near && ringMax > depth) depth = ringMax;
    }
    const middle = scale(add(start, end), 0.5);
    return add(vec3(middle.x, 0, middle.z), scale(away, depth));
}

/** The four corners of the viewed wall face (bottom and top). */
function wallFaceCorners(wall: NonNullable<SceneNode['wall']>, rear: boolean): Vec3[] {
    const [a, b] = rear ? [wall.backStart, wall.backEnd] : [wall.start, wall.end];
    return [a, b, vec3(a.x, a.y + wall.height, a.z), vec3(b.x, b.y + wall.height, b.z)];
}

export function nodeContext(node: SceneNode, view: ViewInfo): NodeContext {
    return { node, data: node.data, module: ancestorModule(node)?.data, view };
}

/**
 * Modules whose floor plan footprint overlaps the face span and comes closer than `distance` to the face
 * (measured in the `away` direction).
 */
function closeToFace(modules: SceneNode[], verticesOf: (node: SceneNode) => Vec3[], face: { start: Vec3; end: Vec3; away: Vec3 }, distance: number): SceneNode[] {
    const { start, end, away } = face;
    const span = length(sub(vec3(end.x, 0, end.z), vec3(start.x, 0, start.z)));
    if (span < 0.01) return [];
    const along = normalize(sub(vec3(end.x, 0, end.z), vec3(start.x, 0, start.z)));
    const tolerance = 1;
    return modules.filter(module => {
        const points = verticesOf(module);
        if (!points.length) return false;
        let minAlong = Infinity, maxAlong = -Infinity, minDistance = Infinity, maxDistance = -Infinity;
        for (const p of points) {
            const v = sub(p, start), a = dot(v, along), d = dot(v, away);
            if (a < minAlong) minAlong = a;
            if (a > maxAlong) maxAlong = a;
            if (d < minDistance) minDistance = d;
            if (d > maxDistance) maxDistance = d;
        }
        return maxAlong >= -tolerance && minAlong <= span + tolerance && maxDistance >= -tolerance && minDistance <= distance;
    });
}
