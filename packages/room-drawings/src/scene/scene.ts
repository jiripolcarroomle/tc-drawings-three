import { IDENTITY, invert, multiply, type Mat4, type Vec3 } from '../math.ts';

/**
 * The scene the drawings are made of: walls, position groups, modules and their parts with transforms
 * and geometry. It is built from the order data (from-order.ts) or read from a snapshot (snapshot.ts).
 */

export const NodeKind = {
    Root: 'root',
    WallGroup: 'wallGroup',
    Wall: 'wall',
    Group: 'group',
    PosGroup: 'posGroup',
    Module: 'module',
    Part: 'part',
} as const;
export type NodeKind = typeof NodeKind[keyof typeof NodeKind];

export type ExtrusionDirection = 'x' | 'y' | 'z';

/** Geometry of a part in its local coordinate system; `origin` is the translation of the geometry inside the part. */
export type Geometry =
    | { type: 'box'; origin: Vec3; size: Vec3 }
    /** SVG path profile extruded along an axis by `depth`, see geometry/solids.ts for the axis mapping. */
    | { type: 'extrusion'; origin: Vec3; size?: Vec3; svg: string; direction: ExtrusionDirection; depth: number }
    /** 3D model; drawn by its bounding box `size`. */
    | { type: 'mesh'; origin: Vec3; size: Vec3; url: string };

/** Wall segment in world coordinates. The front face runs from `start` to `end`; `normal` points from the front face into the wall. */
export interface WallData {
    start: Vec3;
    end: Vec3;
    backStart: Vec3;
    backEnd: Vec3;
    normal: Vec3;
    height: number;
    thickness: number;
}

export interface ModuleInfo {
    /** Module type id from the order data. */
    modId: string;
    /** Unique id of the module instance in the order data. */
    uid: string;
    /** Generation modules (countertop, toekick, ...) have no placement of their own. */
    isGenerated: boolean;
    /** Set on modules created by a generation module; they are reparented to the position group. */
    generationModuleId?: string;
}

export interface SceneNode {
    kind: NodeKind;
    id: string;
    /** Local transform relative to the parent. */
    matrix: Mat4;
    /** World transform, kept up to date by addChild / updateWorld. */
    world: Mat4;
    parent: SceneNode | null;
    children: SceneNode[];
    geometry?: Geometry;
    wall?: WallData;
    module?: ModuleInfo;
    /** The original order entry (module or part). Opaque for the API, handed to the content callbacks. */
    data?: unknown;
}

export interface Scene {
    root: SceneNode;
}

export function createNode(kind: NodeKind, id: string, props: Partial<Omit<SceneNode, 'kind' | 'id' | 'children' | 'parent' | 'world'>> = {}): SceneNode {
    const matrix = props.matrix ?? IDENTITY;
    return { ...props, kind, id, matrix, world: matrix, parent: null, children: [] };
}

export function updateWorld(node: SceneNode, parentWorld: Mat4 = node.parent?.world ?? IDENTITY): void {
    node.world = multiply(parentWorld, node.matrix);
    for (const child of node.children) {
        updateWorld(child, node.world);
    }
}

/**
 * Attaches `child` to `parent`. With `keepWorld`, the child keeps its current world transform (reparenting),
 * otherwise its matrix is taken as local to the new parent.
 */
export function addChild(parent: SceneNode, child: SceneNode, keepWorld = false): void {
    if (child.parent) {
        const siblings = child.parent.children;
        siblings.splice(siblings.indexOf(child), 1);
    }
    if (keepWorld) {
        child.matrix = multiply(invert(parent.world), child.world);
    }
    child.parent = parent;
    parent.children.push(child);
    updateWorld(child, parent.world);
}

export function walk(node: SceneNode, visit: (node: SceneNode) => void): void {
    visit(node);
    for (const child of node.children) {
        walk(child, visit);
    }
}

export const findAll = (scene: Scene, predicate: (node: SceneNode) => boolean): SceneNode[] => {
    const result: SceneNode[] = [];
    walk(scene.root, node => { if (predicate(node)) result.push(node); });
    return result;
};

export const walls = (scene: Scene): SceneNode[] => findAll(scene, node => node.kind === NodeKind.Wall && !!node.wall);

/** Modules placed directly in the position groups (articles and the parts generated for them), without the generation modules themselves. */
export const placedModules = (scene: Scene): SceneNode[] => findAll(scene, node =>
    node.kind === NodeKind.Module && !node.module?.isGenerated
    && (node.parent?.kind === NodeKind.PosGroup || node.parent?.kind === NodeKind.Group));

export const ancestorModule = (node: SceneNode): SceneNode | undefined => {
    for (let current: SceneNode | null = node; current; current = current.parent) {
        if (current.kind === NodeKind.Module) return current;
    }
    return undefined;
};

/** Unique ids within one scene; a taken id gets a `_1`, `_2`, ... suffix. */
export class IdRegistry {
    private readonly used = new Set<string>();
    take(id: string): string {
        let candidate = id;
        for (let counter = 1; this.used.has(candidate); counter++) {
            candidate = `${id}_${counter}`;
        }
        this.used.add(candidate);
        return candidate;
    }
}
