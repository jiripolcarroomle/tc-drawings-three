import type { DrawingContent, NodeContext, ViewInfo } from './content.ts';
import { add, dot, length, normalize, scale, sub, vec3, type Vec3 } from './math.ts';
import type { DrawingSettings } from './settings.ts';
import type { Solid } from './geometry/solids.ts';
import { ancestorModule, NodeKind, placedModules, walls, type Scene, type SceneNode } from './scene/scene.ts';

/**
 * Which views exist and what each one shows:
 * - top view: everything,
 * - elevation per wall side that has a (non-generated) module closer than `maxDistanceFromWall`;
 *   it shows that wall, those modules, and the generated modules (countertops, toekicks, legs, ...) owned by
 *   them (content `ownerIds`); generated modules without owner ids fall back to the wall distance.
 */

export interface ViewDefinition extends ViewInfo {
    title: string;
    /** Direction the viewer looks in (world). */
    direction: Vec3;
    wall?: SceneNode;
    /** Wall corners offered to the annotation lines (distances to the walls), world coordinates. */
    wallVertices: Vec3[];
    /**
     * Elevations: letter of the view for the marker in the top view; `at` is the middle of the wall face moved to
     * the front of the furniture shown (the marker goes in front of it), `direction` the view direction (world).
     */
    marker?: { label: string; at: Vec3; direction: Vec3 };
    /** Is a node with geometry part of this view? */
    shows(node: SceneNode): boolean;
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

    // outlines of everything in the top view except walls, for the elevation markers
    let furnitureRings: Vec3[][] | undefined;
    const furniture = () => furnitureRings ??= [...solids].filter(([node]) => node.kind !== NodeKind.Wall && chainIncluded(node, { name: 'topview', kind: 'top' }))
        .flatMap(([, solid]) => solid.faces.flatMap(face => face.rings));

    let letter = 0;
    for (const wall of walls(scene)) {
        for (const side of settings.views.rearElevations ? ['front', 'rear'] as const : ['front'] as const) {
            const rear = side === 'rear';
            const ownersClose = closeToWall(owners, verticesOf, wall, rear, settings.views.maxDistanceFromWall);
            if (!ownersClose.length) continue;
            const label = elevationLabel(letter++);
            const direction = rear ? scale(wall.wall!.normal, -1) : wall.wall!.normal;
            const ownerIds = new Set(ownersClose.map(m => m.module!.uid));
            const shown = new Set<SceneNode>([...ownersClose, ...generated.filter(m => {
                const ids = content.ownerIds?.({ node: m, data: m.data });
                return ids?.length
                    ? ids.some(id => ownerIds.has(id))
                    : closeToWall([m], verticesOf, wall, rear, settings.views.maxDistanceFromWall).length > 0;
            })]);
            const info: ViewInfo = { name: `${wall.id}-${side}-elevation`, kind: 'elevation' };
            views.push({
                ...info,
                title: `Elevation ${label} – ${wall.id.replace(/-/g, ' ')}${rear ? ', rear side' : ''}`,
                direction,
                wall,
                wallVertices: wallFaceCorners(wall.wall!, rear),
                marker: { label, at: markerPosition(wall, rear, furniture(), settings.views.maxDistanceFromWall), direction },
                shows: node => {
                    if (node.kind === NodeKind.Wall) return node === wall;
                    const module = topModule(node);
                    return !!module && shown.has(module) && chainIncluded(node, info);
                },
            });
        }
    }
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

/**
 * Middle of the wall face, moved away from the wall to the front of the furniture standing there: face outlines
 * that come within `band` of the middle (measured along the wall) and start closer than `near` to the wall
 * face; furniture elsewhere along the wall or across the room does not count.
 */
function markerPosition(wallNode: SceneNode, rear: boolean, furniture: Vec3[][], near: number, band = 300): Vec3 {
    const wall = wallNode.wall!;
    const start = rear ? wall.backStart : wall.start, end = rear ? wall.backEnd : wall.end;
    const along = normalize(sub(end, start));
    const away = rear ? wall.normal : scale(wall.normal, -1);
    const half = length(sub(end, start)) / 2;
    const lo = half - band, hi = half + band;
    let depth = 0;
    for (const ring of furniture) {
        let ringMin = Infinity, ringMax = -Infinity;
        for (let i = 0; i < ring.length; i++) {
            const p = sub(ring[i]!, start), q = sub(ring[(i + 1) % ring.length]!, start);
            const pa = dot(p, along), qa = dot(q, along), pd = dot(p, away), qd = dot(q, away);
            // the part of the edge within the band along the wall
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
    return add(scale(add(start, end), 0.5), scale(away, depth));
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
 * Modules whose floor plan footprint overlaps the wall span and comes closer than `distance` to the wall face
 * (front: into the room, rear: away from the back face).
 */
function closeToWall(modules: SceneNode[], verticesOf: (node: SceneNode) => Vec3[], wallNode: SceneNode, rear: boolean, distance: number): SceneNode[] {
    const wall = wallNode.wall!;
    const start = rear ? wall.backStart : wall.start, end = rear ? wall.backEnd : wall.end;
    const span = length(sub(end, start));
    if (span < 0.01) return [];
    const along = normalize(sub(end, start));
    const away = rear ? wall.normal : scale(wall.normal, -1);
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
