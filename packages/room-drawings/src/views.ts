import type { DrawingContent, NodeContext, ViewInfo } from './content.ts';
import { dot, length, normalize, scale, sub, vec3, type Vec3 } from './math.ts';
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
        views.push({ ...info, title: 'Top view', direction: vec3(0, -1, 0), shows: node => node.kind === NodeKind.Wall || chainIncluded(node, info) });
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

    for (const wall of walls(scene)) {
        for (const side of settings.views.rearElevations ? ['front', 'rear'] as const : ['front'] as const) {
            const rear = side === 'rear';
            const ownersClose = closeToWall(owners, verticesOf, wall, rear, settings.views.maxDistanceFromWall);
            if (!ownersClose.length) continue;
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
                title: `Elevation ${wall.id} (${side})`,
                direction: rear ? scale(wall.wall!.normal, -1) : wall.wall!.normal,
                wall,
                shows: node => {
                    if (node.kind === NodeKind.Wall) return node === wall;
                    const module = topModule(node);
                    return !!module && shown.has(module) && chainIncluded(node, info);
                },
            });
        }
    }
    return views;

    function topModule(node: SceneNode): SceneNode | undefined {
        let result: SceneNode | undefined;
        for (let current: SceneNode | null = node; current; current = current.parent) {
            if (current.kind === NodeKind.Module) result = current;
        }
        return result;
    }
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
