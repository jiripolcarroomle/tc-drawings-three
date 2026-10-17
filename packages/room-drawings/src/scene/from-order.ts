import type { Logger } from '../log.ts';
import { add, IDENTITY, normalize, rotationYTranslation, scale, sub, toMat4, vec3, type Vec3 } from '../math.ts';
import type { ModuleInput, OrderInput, OrderLineGroupInput, PartInput, RoomContourSegmentInput } from '../input/order.ts';
import { addChild, createNode, IdRegistry, NodeKind, type ExtrusionDirection, type Geometry, type Scene, type SceneNode, type WallData } from './scene.ts';

/**
 * Builds the scene from the order data:
 * - walls from the room contours (back corners joined),
 * - one position group per order line group, with the modules (and submodules) of its items,
 * - parts first attached to the group, then moved to the module that created them,
 * - children of generation modules (countertops, toekicks, legs, ...) moved up to the group, because the
 *   generation modules have no placement of their own; they remember the generation module in `generationModuleId`.
 */
export function buildSceneFromOrder(order: OrderInput, groups: OrderLineGroupInput[], logger?: Logger): Scene {
    const ids = new IdRegistry();
    const root = createNode(NodeKind.Root, ids.take('scene-root'));

    const wallGroup = createNode(NodeKind.WallGroup, ids.take('walls-group'));
    addChild(root, wallGroup);
    createWalls(order, ids).forEach(wall => addChild(wallGroup, wall));

    const groupsRoot = createNode(NodeKind.Group, ids.take('pos-groups-root'));
    addChild(root, groupsRoot);

    for (const group of groups ?? []) {
        const position = group.groupPos?.calcGroupPos ?? [0, 0, 0];
        const posGroup = createNode(NodeKind.PosGroup, ids.take('pos-group-' + (group.groupPos?.calcGroup ?? '')), {
            matrix: rotationYTranslation(group.groupPos?.calcGroupRotationY ?? 0, vec3(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0)),
        });
        addChild(groupsRoot, posGroup);

        const partNodes = new Map<PartInput, SceneNode>();
        for (const item of group.items ?? []) {
            for (const part of item.orderData?.bomEntries ?? []) {
                addPartNodes(part, posGroup, ids, partNodes);
            }
            const module = item.orderData?.orderItem;
            if (module) {
                addModuleNodes(module, posGroup, ids);
            }
        }
        for (const module of [...posGroup.children]) {
            if (module.kind === NodeKind.Module) {
                moveCreatedParts(module, posGroup, partNodes, logger);
            }
        }
        for (const module of [...posGroup.children]) {
            if (module.kind === NodeKind.Module && module.module?.isGenerated) {
                for (const child of [...module.children]) {
                    addChild(posGroup, child, true);
                    if (child.module) {
                        child.module.generationModuleId = module.id;
                    }
                }
            }
        }
    }
    return { root };
}

// ---------- walls ----------

const DEFAULT_WALL_HEIGHT = 3000;
const DEFAULT_WALL_THICKNESS = 200;

function wallFromSegment(from: RoomContourSegmentInput, to: RoomContourSegmentInput): WallData {
    const thickness = to.thickness ?? from.thickness ?? DEFAULT_WALL_THICKNESS;
    const height = to.height ?? from.height ?? DEFAULT_WALL_HEIGHT;
    // plan (x, y) -> scene (x, 0, -y)
    const start = vec3(from.x, 0, -from.y);
    const end = vec3(to.x, 0, -to.y);
    const direction = normalize(sub(end, start));
    const normal = vec3(-direction.z, 0, direction.x);
    return {
        start, end, normal, height, thickness,
        backStart: add(start, scale(normal, thickness)),
        backEnd: add(end, scale(normal, thickness)),
    };
}

function createWalls(order: OrderInput, ids: IdRegistry): SceneNode[] {
    const result: SceneNode[] = [];
    for (const contour of order?.rooms ?? []) {
        const walls: WallData[] = [];
        for (let i = 1; i < contour.segments.length; i++) {
            const segment = contour.segments[i];
            if (segment.cmd !== 'L' || segment.type !== 'wall' || !segment.height || !segment.thickness) {
                continue;
            }
            walls.push(wallFromSegment(contour.segments[i - 1], segment));
        }
        // join the back sides of consecutive walls at their intersection
        for (let i = 0; i < walls.length; i++) {
            const from = walls[i], to = walls[(i + 1) % walls.length];
            if (Math.hypot(from.end.x - to.start.x, from.end.y - to.start.y, from.end.z - to.start.z) > 0.01) {
                continue;
            }
            const fromDirection = normalize(sub(from.end, from.start));
            const toDirection = normalize(sub(to.end, to.start));
            const joint = add(add(from.end,
                scale(toDirection, from.thickness / (from.normal.x * toDirection.x + from.normal.z * toDirection.z))),
                scale(fromDirection, to.thickness / (to.normal.x * fromDirection.x + to.normal.z * fromDirection.z)));
            from.backEnd = joint;
            to.backStart = joint;
        }
        walls.forEach((wall, index) => result.push(createNode(NodeKind.Wall, ids.take(`wall-${index}`), { wall })));
    }
    return result;
}

// ---------- modules and parts ----------

const partId = (part: PartInput) => `part__${part._partId}__${part._id}:${part._parentUniqueId}`;

function partGeometry(part: PartInput): Geometry | undefined {
    const origin = vec3(part._x ?? 0, part._y ?? 0, part._z ?? 0);
    const size: Vec3 = vec3(part._dimx ?? 0, part._dimy ?? 0, part._dimz ?? 0);
    if (part._extrude?.svg) {
        const direction = (['x', 'y', 'z'].includes(part._extrude.direction) ? part._extrude.direction : 'z') as ExtrusionDirection;
        const depth = direction === 'x' ? size.x : direction === 'y' ? size.y : size.z;
        return { type: 'extrusion', origin, size, svg: part._extrude.svg, direction, depth: depth || 1000 };
    }
    if (part._threedModel?._3dUrl) {
        return { type: 'mesh', origin, size, url: part._threedModel._3dUrl };
    }
    return { type: 'box', origin, size };
}

/** Parts are attached to the group first (hidden ones are skipped, their child parts are not). */
function addPartNodes(part: PartInput, posGroup: SceneNode, ids: IdRegistry, partNodes: Map<PartInput, SceneNode>): void {
    const node = createNode(NodeKind.Part, ids.take(partId(part)), {
        matrix: toMat4(part._fullMatrix) ?? IDENTITY,
        geometry: partGeometry(part),
        data: part,
    });
    partNodes.set(part, node);
    if (!part._hidden) {
        addChild(posGroup, node);
    }
    for (const child of part._childParts ?? []) {
        addPartNodes(child, posGroup, ids, partNodes);
    }
}

function addModuleNodes(module: ModuleInput, parent: SceneNode, ids: IdRegistry): SceneNode {
    const position = module._articlePos;
    const matrix = toMat4(module._origin)
        ?? rotationYTranslation(module._articleRotationY ?? position?.rotationY ?? 0, vec3(position?.x ?? 0, position?.y ?? 0, position?.z ?? 0));
    const node = createNode(NodeKind.Module, ids.take(`${module.modId}_${module._id}`), {
        matrix,
        module: { modId: module.modId, uid: module._id, isGenerated: !!module._isGenerated },
        data: module,
    });
    addChild(parent, node);
    for (const sub of module.m ?? []) {
        addModuleNodes(sub, node, ids);
    }
    return node;
}

/** Moves the visible leaf parts a module created (its `p` list) from the group to the module, keeping their world position. */
function moveCreatedParts(moduleNode: SceneNode, posGroup: SceneNode, partNodes: Map<PartInput, SceneNode>, logger?: Logger): void {
    const module = moduleNode.data as ModuleInput;
    for (const part of module.p ?? []) {
        if (part._hidden || part._childParts?.length) {
            continue;
        }
        const partNode = partNodes.get(part) ?? [...partNodes.entries()].find(([candidate]) => partId(candidate) === partId(part))?.[1];
        if (!partNode) {
            logger?.warning(`room-drawings: part ${partId(part)} of module ${moduleNode.id} is not in the order's part list`);
            continue;
        }
        if (!partNode.parent) {
            logger?.warning(`room-drawings: part ${partNode.id} is not attached (hidden parent part?)`);
            continue;
        }
        if (partNode.parent !== posGroup) {
            logger?.warning(`room-drawings: part ${partNode.id} is listed by ${moduleNode.id} but already attached to ${partNode.parent.id}`);
        }
        addChild(moduleNode, partNode, true);
    }
    for (const sub of moduleNode.children) {
        if (sub.kind === NodeKind.Module) {
            moveCreatedParts(sub, posGroup, partNodes, logger);
        }
    }
}
