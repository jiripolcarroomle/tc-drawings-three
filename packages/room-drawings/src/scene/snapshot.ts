import { IDENTITY, type Mat4 } from '../math.ts';
import { addChild, createNode, type Geometry, type ModuleInfo, type NodeKind, type Scene, type SceneNode, type WallData } from './scene.ts';

/**
 * Compact JSON snapshot of a scene (regression fixtures, debugging, reproducing issues outside the host).
 * Node data (the order entries) is only written when a `data` serializer is given, because the live order
 * objects are circular and large; the caller decides what to keep.
 */

export const SNAPSHOT_FORMAT = 'room-drawings-scene';

export interface SceneSnapshot {
    format: typeof SNAPSHOT_FORMAT;
    version: 1;
    root: SnapshotNode;
}

export interface SnapshotNode {
    kind: NodeKind;
    id: string;
    /** Local transform, omitted for the identity. */
    matrix?: number[];
    geometry?: Geometry;
    wall?: WallData;
    module?: ModuleInfo;
    data?: unknown;
    children?: SnapshotNode[];
}

const isIdentity = (m: Mat4) => m.every((value, index) => value === IDENTITY[index]);

export function sceneToSnapshot(scene: Scene, options: { data?: (node: SceneNode) => unknown } = {}): SceneSnapshot {
    const write = (node: SceneNode): SnapshotNode => {
        const result: SnapshotNode = { kind: node.kind, id: node.id };
        if (!isIdentity(node.matrix)) result.matrix = [...node.matrix];
        if (node.geometry) result.geometry = node.geometry;
        if (node.wall) result.wall = node.wall;
        if (node.module) result.module = { ...node.module };
        const data = options.data?.(node);
        if (data !== undefined) result.data = data;
        if (node.children.length) result.children = node.children.map(write);
        return result;
    };
    return { format: SNAPSHOT_FORMAT, version: 1, root: write(scene.root) };
}

export function sceneFromSnapshot(snapshot: SceneSnapshot): Scene {
    if (snapshot?.format !== SNAPSHOT_FORMAT) {
        throw new Error(`room-drawings: not a scene snapshot (format ${String((snapshot as { format?: unknown })?.format)})`);
    }
    const read = (source: SnapshotNode, parent: SceneNode | null): SceneNode => {
        const node = createNode(source.kind, source.id, {
            matrix: source.matrix ?? IDENTITY,
            geometry: source.geometry,
            wall: source.wall,
            module: source.module ? { ...source.module } : undefined,
            data: source.data,
        });
        if (parent) addChild(parent, node);
        for (const child of source.children ?? []) read(child, node);
        return node;
    };
    return { root: read(snapshot.root, null) };
}
