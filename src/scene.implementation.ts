
import { logWarning, Matrix4, Vector3 } from "./tc/base";
import { createWallsGroupFromOrderData, type IWallSegment } from "./wall";
import { IdsMap } from "./idsmap";
import { type IGeometryData, Object3DNodeKind, type IOrderLineEntry, type IOrderSceneNode } from "./scene.interfaces";
import { type ISceneGeometryConversionSettings } from "./drawingrenderer.intefaces";

/**
 * Builds the project's technology-agnostic scene graph from raw order data.
 *
 * The resulting tree contains walls, pos-group placeholders, modules, and parts.
 * Parts are initially created under pos-groups and then reparented to modules
 * according to the ownership information in the order data.
 *
 * @param o Order-level source data.
 * @param ol Order-line group source data.
 * @returns Root scene node of the generated scene graph.
 */
export function createScene(
    o: any, // IOrderData
    ol: any, // IFullOrderLineGroupData
): IOrderSceneNode {
    const idsMap = new IdsMap();
    const scenceRoot = OrderSceneNode.createSceneRoot(idsMap);

    // creates walls nodes from the order room data and adds them to the scene
    const wallsGroup = createWallsGroupFromOrderData(o.rooms, idsMap);
    if (wallsGroup) {
        scenceRoot.addChild(wallsGroup, false);
    }

    // re-creates the order line hierarchy as a hierarchy of scene nodes
    const posGroupsRootNode = OrderSceneNode.createGroup(idsMap, 'pos-groups-root');
    scenceRoot.addChild(posGroupsRootNode, false);

    // attach the parts to their parent modules, from which the addPart was called
    ol?.forEach((orderLineEntry: any) => {
        const posGroupNode = OrderSceneNode.createPosGroupRootFromIFullOrderLineGroupData(orderLineEntry, posGroupsRootNode);
        reparentPartsFromPosGroupsToModulesRecursive(posGroupNode, posGroupNode);
    })

    return scenceRoot;
}

export class OrderSceneNode implements IOrderSceneNode {
    readonly kind: Object3DNodeKind;
    readonly id: string;
    readonly idsMap: IdsMap;
    children: IOrderSceneNode[] = [];

    getPartChildren(): IOrderSceneNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Part);
    }
    getModuleChildren(): IOrderSceneNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Module);
    }

    parent: IOrderSceneNode | null = null;
    orderLineEntry: IOrderLineEntry | null = null;
    transform: Matrix4 = new Matrix4(); // identity by default
    private _worldTransform: Matrix4 = new Matrix4(); // identity by default

    get worldTransform(): Matrix4 {
        return this._worldTransform;
    }

    updateWorldTransform(parentWorldTransform: Matrix4): void {
        // worldTransform = parentWorldTransform * localTransform
        this._worldTransform = parentWorldTransform.clone().multiply(this.transform);
        // update children
        for (const child of this.children) {
            child.updateWorldTransform(this._worldTransform);
        }
    }

    addChild(child: IOrderSceneNode, keepWorldTransform?: boolean): void {
        // already contains
        if (this.children.includes(child)) {
            return;
        }
        const parentWorld = computeWorldTransform(this);
        if (keepWorldTransform) {
            // localTransform = inverse(parentWorldTransform) * childWorldTransform
            // This is intended for re-parenting EXISTING nodes.
            const childWorld = computeWorldTransform(child);
            child.transform = parentWorld.clone().invert().multiply(childWorld);
        }
        child.parent = this;
        child.updateWorldTransform(parentWorld);
        this.children.push(child);
    }

    removeChild(child: IOrderSceneNode): IOrderSceneNode | null {
        const index = this.children.indexOf(child);
        if (index === -1) {
            return null;
        }
        const childWorld = computeWorldTransform(child);
        child.transform = childWorld;
        child.parent = null;
        this.children.splice(index, 1);
        return child;
    }

    private readonly _geometry: GeometryData;
    geometry(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData {
        return this._geometry.evaluateWithRenderSettings(drawingRenderSettings);
    }

    wallData: IWallSegment | undefined;

    getAllBBoxCornersInWorld(): Vector3[] {
        const worldCorners: Vector3[] = [];

        const size = this._geometry.size;
        if (size) {
            const localCorners = [
                new Vector3(0, 0, 0),
                new Vector3(size._x, 0, 0),
                new Vector3(0, size._y, 0),
                new Vector3(0, 0, size._z),
                new Vector3(size._x, size._y, 0),
                new Vector3(size._x, 0, size._z),
                new Vector3(0, size._y, size._z),
                new Vector3(size._x, size._y, size._z),
            ];
            localCorners.forEach(corner => {
                const worldCorner = corner.applyMatrix4(this.worldTransform);
                worldCorners.push(worldCorner);
            });

        }
        this.children.forEach(child => {
            const childCorners = child.getAllBBoxCornersInWorld();
            worldCorners.push(...childCorners);
        });

        return worldCorners;

    }

    private constructor(idsMap: IdsMap, id: string | undefined, kind: Object3DNodeKind) {
        this.idsMap = idsMap;
        this.kind = kind;
        this.id = id ? this.idsMap.useIdOrGenerateUnique(id) : this.idsMap.getRandomId();
        this.idsMap.register(this);
        this._geometry = new GeometryData(this, new Matrix4());
    }


    static createSceneRoot(idsMap: IdsMap): OrderSceneNode {
        return new OrderSceneNode(idsMap, 'scene-root', Object3DNodeKind.SceneRoot);
    }

    static createWallsGroup(idsMap: IdsMap, _id?: string): OrderSceneNode {
        const wallsGroupNode = new OrderSceneNode(idsMap, 'walls-group', Object3DNodeKind.WallGroup);
        return wallsGroupNode;
    }

    /**
     * Creates a group node with no geometry payload.
     */
    static createGroup(idsMap: IdsMap, id?: string): OrderSceneNode {
        return new OrderSceneNode(idsMap, id, Object3DNodeKind.Group);
    }


    /**
     * Creates a positional grouping node used as an intermediate order-data root.
     *
     * @param idsMap Scene ID registry.
     * @param id Optional preferred ID.
     * @returns Pos-group node.
     */
    static createPosGroup(idsMap: IdsMap, id?: string): OrderSceneNode {
        return new OrderSceneNode(idsMap, id, Object3DNodeKind.PosGroup);
    }

    /**
     * Creates a wall node and seeds its geometry metadata from a wall segment.
     *
     * @param idsMap Scene ID registry.
     * @param id Optional preferred ID.
     * @param wallSegment Source wall segment.
     * @returns Wall node positioned at the segment center.
     */
    static createFromWall(idsMap: IdsMap, id: string | undefined, wallSegment: IWallSegment): OrderSceneNode {
        const node = new OrderSceneNode(idsMap, id, Object3DNodeKind.Wall);
        node.wallData = wallSegment;
        node._geometry.svgString = `
            <svg><path d="
                M ${wallSegment.segmentStart._x} ${wallSegment.segmentStart._z}
                L ${wallSegment.segmentEnd._x} ${wallSegment.segmentEnd._z} 
                L ${wallSegment.segmentBackEnd._x} ${wallSegment.segmentBackEnd._z} 
                L ${wallSegment.segmentBackStart._x} ${wallSegment.segmentBackStart._z} 
                Z"
            /></svg>
        `;
        node._geometry.svgExtrusionDirection = 'y';
        node._geometry.svgDepth = wallSegment.wallHeight;
        return node;
    }

    /**
     * Creates a pos-group subtree from one full order-line group entry.
     *
     * Parts are created first under the pos-group, then module nodes are built.
     * A later reparenting step attaches parts to their owning modules.
     *
     * @param source Order-line group source entry.
     * @param posGroupsRootNode Parent node that owns all generated pos-groups.
     * @returns Generated pos-group node.
     */
    static createPosGroupRootFromIFullOrderLineGroupData(source: any /* IFullOrderLineGroupData */, posGroupsRootNode: OrderSceneNode): OrderSceneNode {
        const posGroupNode = OrderSceneNode.createPosGroup(posGroupsRootNode.idsMap, 'pos-group-' + (source.groupPos.calcGroup ?? ''));
        posGroupNode.orderLineEntry = source;
        const groupPosition = Vector3.fromArray(source.groupPos.calcGroupPos);
        const groupRotationY = source.groupPos.calcGroupRotationY ?? 0;
        posGroupNode.transform.makeRotationY(groupRotationY).setPosition(groupPosition._x, groupPosition._y, groupPosition._z);
        posGroupsRootNode.addChild(posGroupNode, false);

        source.items.forEach((item: any /* IFullOrderLineData */) => {
            const orderData: any /* IBomOrderLineData */ = item.orderData;
            orderData.bomEntries?.forEach((bomEntry: any) => {
                OrderSceneNode.createScenePartNodeFromPartBase(bomEntry, posGroupNode);
            });
            OrderSceneNode.createSceneModuleNodeFromOD_Base(orderData.orderItem, posGroupNode);
        });
        return posGroupNode;
    }

    /**
     * Creates a part node from a source part entry.
     *
     * Hidden parts are registered but not attached to the visible scene tree.
     * Child parts are recursively added under the same pos-group so later module
     * reparenting can resolve them by ID.
     *
     * @param source Source part entry.
     * @param posGroupNode Pos-group that temporarily owns created part nodes.
     * @returns Created part node.
     */
    static createScenePartNodeFromPartBase(source: any /* PartBase */, posGroupNode: OrderSceneNode): OrderSceneNode {
        const partNode = new OrderSceneNode(posGroupNode.idsMap, getPartId(source), Object3DNodeKind.Part);

        partNode.orderLineEntry = source;
        partNode.transform = source._fullMatrix;
        if (!source._hidden) {
            posGroupNode.addChild(partNode, false);
        }
        source._childParts.forEach((childPart: any /* PartBase */) => {
            OrderSceneNode.createScenePartNodeFromPartBase(childPart, posGroupNode);
        });
        partNode._geometry.size = new Vector3(source._dimx, source._dimy, source._dimz);
        if (source._extrude) {
            partNode._geometry.svgString = source._extrude.svg;
            partNode._geometry.svgExtrusionDirection = source._extrude.direction;
        }
        if (source._threedModel) {
            partNode._geometry.meshUrl = source._threedModel._3dUrl;
        }

        //logInfo(`${partNode.id}: ${partNode.orderLineEntry}`);
        return partNode;
    }

    /**
     * Creates a module node from order data and recursively adds submodules.
     *
     * The module transform is taken from `_origin` when present, otherwise it is
     * derived from article position and rotation fields.
     *
     * @param source Source module entry.
     * @param parentNode Parent scene node.
     * @returns Created module node.
     */
    static createSceneModuleNodeFromOD_Base(source: any /* OD_Base */, parentNode: OrderSceneNode): OrderSceneNode {
        const moduleNode = new OrderSceneNode(parentNode.idsMap, source.modId + '_' + source._id, Object3DNodeKind.Module);
        moduleNode.orderLineEntry = source;
        if (source._origin) {
            moduleNode.transform.multiply(source._origin);
        }
        else {
            const modulePosition = new Vector3(source._articlePos.x, source._articlePos.y, source._articlePos.z);
            const moduleRotationY = source._articleRotationY ?? source._articlePos?.rotationY ?? 0;
            moduleNode.transform.makeRotationY(moduleRotationY).setPosition(modulePosition._x, modulePosition._y, modulePosition._z);
        }
        parentNode.addChild(moduleNode, false);
        source.m?.forEach((subModule: any /* OD_Base */) => OrderSceneNode.createSceneModuleNodeFromOD_Base(subModule, moduleNode));
        return moduleNode;
    }

}

class GeometryData implements IGeometryData {
    ownerNode: IOrderSceneNode;
    origin: Matrix4;
    hidden?: boolean;
    size?: Vector3;
    svgExtrusionDirection?: string;
    svgString?: string;
    svgDepth?: number;
    meshUrl?: string;

    constructor(ownerNode: IOrderSceneNode, origin: Matrix4) {
        this.ownerNode = ownerNode;
        this.origin = origin;
    }

    getMutableCopy(): IGeometryData {
        const copy = new GeometryData(this.ownerNode, this.origin.clone());
        copy.hidden = this.hidden;
        copy.size = this.size ? new Vector3(this.size._x, this.size._y, this.size._z) : undefined;
        copy.svgExtrusionDirection = this.svgExtrusionDirection;
        copy.svgString = this.svgString;
        copy.svgDepth = this.svgDepth;
        copy.meshUrl = this.meshUrl;
        return copy;
    }

    evaluateWithRenderSettings(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData {
        const evaluated = this.getMutableCopy() as GeometryData;
        if (drawingRenderSettings.doNotFetchMeshes && evaluated.meshUrl) {
            delete evaluated.meshUrl;
        }
        if (!drawingRenderSettings.wallsMaterial && this.ownerNode.kind === Object3DNodeKind.Wall) {
            evaluated.hidden = true;
        }
        return evaluated;
    }
}

/**
 * Collapses the temporary pos-group hierarchy by reparenting visible leaf parts
 * to the module nodes that own them.
 *
 * The lookup is driven by each module node's `orderLineEntry.p` collection.
 * Hidden parts and grouped child parts stay untouched.
 * 
 * This is necessary for necessary for TC's generation modules. Because the parts are
 * attached to the posGroups without, which do not have positions.
 * Therefore, the parts need to be re-parented to the intermediate module nodes, which have the correct positions,
 * otherwise it would be hard or impossible to evaluate which parts should be visible in the rendered
 * drawing views.
 *
 * @param posGroupNode Pos-group root that still owns the parts before reparenting.
 * @param currentNode Current module subtree being processed recursively.
 */

function reparentPartsFromPosGroupsToModulesRecursive(posGroupNode: IOrderSceneNode, currentNode: IOrderSceneNode): void {
    if (currentNode !== posGroupNode) {
        const currentNodePartChildren = currentNode.orderLineEntry?.p ?? [];
        currentNodePartChildren?.forEach((partChild: any) => {
            // Only visible leaf parts are reparented to the owning module.
            if (partChild._hidden || partChild._childParts.length) {
                return;
            }
            const partChildNodeId = getPartId(partChild);
            const partChildNode = currentNode.idsMap.get(partChildNodeId);
            if (!partChildNode) {
                logWarning(`Could not find node for part ${partChildNodeId}`);
                return;
            }
            const parent = partChildNode.parent;
            if (!parent) {
                logWarning(`Part node ${partChildNodeId} has no parent, cannot reparent`);
                return;
            }
            if (parent !== posGroupNode) {
                logWarning(`Part node ${partChildNodeId} is not a child of the pos group anymore, cannot reparent`);
            }
            parent.removeChild(partChildNode);
            currentNode.addChild(partChildNode, true);
        });
    }

    const subModules = currentNode.getModuleChildren();
    subModules.forEach(subModule => {
        reparentPartsFromPosGroupsToModulesRecursive(posGroupNode, subModule);
    });

}


/**
 * Computes the world transform of a node by multiplying the transforms of all its ancestors up to the root.
 * The order of multiplication is from the root to the node, so the local transform of the node is applied last.
 * @param node Node for which to compute the world transform.
 * @returns World transform matrix of the node.
 */
function computeWorldTransform(node: IOrderSceneNode): Matrix4 {
    const chain: IOrderSceneNode[] = [];
    let current: IOrderSceneNode | null = node;
    while (current) {
        chain.push(current);
        current = current.parent;
    }
    const world = new Matrix4();
    for (let i = chain.length - 1; i >= 0; i--) {
        world.multiply(chain[i].transform);
    }
    return world;
}

/**
 * Builds a stable part identifier from the fields used by the current order data.
 *
 * The resulting string is readable enough for debugging while still being tied
 * to the source identifiers that distinguish parts within the scene.
 *
 * @param part Order-entry part for which to generate an ID.
 * @returns Stable part ID in the format `part__{partId}__{id}:{parentUniqueId}`.
 */
function getPartId(part: any /* PartBase */): string {
    return `part__${part._partId}__${part._id}:${part._parentUniqueId}`;
}

