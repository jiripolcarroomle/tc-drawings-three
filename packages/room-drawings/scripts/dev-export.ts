// Dev tooling (not part of the package API): converts the scene export the product writes today
// (`dev_serialized_scene.json`, the tc-drawings-three scene format) into a room-drawings scene snapshot.
import { vec3, type Vec3 } from '../src/math.ts';
import type { Geometry, NodeKind } from '../src/scene/scene.ts';
import { SNAPSHOT_FORMAT, type SceneSnapshot, type SnapshotNode } from '../src/scene/snapshot.ts';

type Xyz = { _x: number; _y: number; _z: number };
interface DevExportNode {
    kind: string;
    id: string;
    transform?: { elements: number[] };
    _geometry?: { origin?: { elements: number[] }; size?: Xyz; svgString?: string; svgExtrusionDirection?: string; svgDepth?: number; meshUrl?: string; hidden?: boolean };
    wallData?: { segmentStart: Xyz; segmentEnd: Xyz; segmentBackStart: Xyz; segmentBackEnd: Xyz; normalToWall: Xyz; wallHeight: number; wallThickness: number };
    orderLineEntry?: Record<string, unknown> | null;
    generationModuleId?: string;
    children?: DevExportNode[];
}

const v = (p: Xyz): Vec3 => vec3(p._x, p._y, p._z);
const KINDS: Record<string, NodeKind> = { sceneRoot: 'root', wallGroup: 'wallGroup', wall: 'wall', group: 'group', posGroup: 'posGroup', module: 'module', part: 'part' };

/** Library specifics stay here, in dev tooling: `g` (global variables) is repeated on every entry and dropped. */
const DROPPED_DATA_KEYS = new Set(['g']);

export function snapshotFromDevExport(root: DevExportNode): SceneSnapshot {
    const convert = (node: DevExportNode): SnapshotNode => {
        const kind = KINDS[node.kind];
        if (!kind) throw new Error(`unknown node kind ${node.kind} (${node.id})`);
        const result: SnapshotNode = { kind, id: node.id };
        const m = node.transform?.elements;
        if (m && !m.every((value, i) => value === (i % 5 === 0 ? 1 : 0))) result.matrix = m;
        const entry = node.orderLineEntry ?? undefined;
        if (node.wallData) {
            const w = node.wallData;
            result.wall = { start: v(w.segmentStart), end: v(w.segmentEnd), backStart: v(w.segmentBackStart), backEnd: v(w.segmentBackEnd), normal: v(w.normalToWall), height: w.wallHeight, thickness: w.wallThickness };
        }
        else if (node._geometry && !node._geometry.hidden) {
            const g = node._geometry;
            const origin = g.origin ? vec3(g.origin.elements[12], g.origin.elements[13], g.origin.elements[14]) : vec3(0, 0, 0);
            let geometry: Geometry | undefined;
            if (g.svgString) {
                const direction = (g.svgExtrusionDirection === 'x' || g.svgExtrusionDirection === 'y') ? g.svgExtrusionDirection : 'z';
                const dim = entry?.[direction === 'x' ? '_dimx' : direction === 'y' ? '_dimy' : '_dimz'];
                geometry = { type: 'extrusion', origin, size: g.size ? v(g.size) : undefined, svg: g.svgString, direction, depth: g.svgDepth ?? (typeof dim === 'number' ? dim : 1000) };
            }
            else if (g.meshUrl && g.size) geometry = { type: 'mesh', origin, size: v(g.size), url: g.meshUrl };
            else if (g.size) geometry = { type: 'box', origin, size: v(g.size) };
            if (geometry) result.geometry = geometry;
        }
        if (kind === 'module' && entry) {
            result.module = { modId: String(entry.modId), uid: String(entry._id ?? node.id), isGenerated: !!entry._isGenerated, ...(node.generationModuleId ? { generationModuleId: node.generationModuleId } : {}) };
        }
        if (entry && (kind === 'module' || kind === 'part')) {
            result.data = Object.fromEntries(Object.entries(entry).filter(([key]) => !DROPPED_DATA_KEYS.has(key)));
        }
        if (node.children?.length) result.children = node.children.map(convert);
        return result;
    };
    return { format: SNAPSHOT_FORMAT, version: 1, root: convert(root) };
}
