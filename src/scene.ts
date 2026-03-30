
import { Matrix4, Vector3 } from "./tc/base";
import { createWallsGroupFromOrderData, type IWallSegment } from "./wall";
import { computeWorldTransform, getPartId, reparentPartsFromPosGroupsToModulesRecursive } from "./helpers";
import { IdsMap } from "./idsmap";

/**
 * Optional renderer-specific settings used while converting node geometry into the target technology.
 */
export interface ISceneGeometryConversionSettings {
    /** Optional material hint for solid geometry generation. If missing, the object is not rendered. */
    material?: any;
    /** Optional material hint for wireframe geometry generation. If missing, the wireframe is not rendered. */
    wireframeMaterial?: any;
    /** Optional material hint for walls geometry generation. If missing, the walls are not rendered. */
    wallsMaterial?: any;
    /** Whether not to fetch and use actual meshes or use just their bounding boxes. */
    doNotFetchMeshes?: boolean;
}

/**
 * Generic camera settings that renderer implementations may consume.
 */
export interface ISceneRenderSettings {
    /** The camera position to render the scene from. */
    cameraPosition?: Vector3;
    /** A direction vector indicating where the camera is pointing. */
    cameraDirection?: Vector3;
    /** The size of the camera view. Can be a Vector3, a number, or any other type, based on the actually implemented technology or view type */
    cameraSize?: Vector3 | number | any;
    /**
     * Transformation function to convert world coordinates into 2D coordinates in the renderer's screen space. 
     * @param worldPoint as Vector3
     * @returns Vector3 where x and y represent the 2D screen coordinates and z can be used for depth sorting. If the point is outside the view, the function returns null.
     */
    get2DCoordinateFromWorldPoint?: (worldPoint: Vector3) => Vector3 | null;
}

/**
 * Constructor contract for renderer adapters that consume the custom scene graph.
 */
export interface ISceneRenderer {
    new(rootNode: IObject3DNode, settings: ISceneGeometryConversionSettings): ISceneRenderer;
    /** Root node passed into the renderer instance. */
    rootNode: IObject3DNode;

    // getFilteredCopy(filter: (node: IObject3DNode) => boolean): IScene;
    // render(
    //     nodeFilter: (node: IObject3DNode) => boolean,
    //     cameraPosition: Vector3,
    //     cameraDirection: Vector3,
    //     cameraSize: Vector3,
    //     drawingRenderSettings: any,
    // ): any;
    // getNodeById(id: string): IObject3DNode | null;
}


/**
 * One SVG path command used to describe wall or part outlines.
 */
export interface ISvgPathNode {
    command: 'M' | 'L' | 'Z';
    args: number[];
}

/**
 * Renderer-facing geometry metadata extracted from a scene node.
 */
export interface IGeometryData {
    /** The owner node is the node that this geometry data belongs to. This is useful for accessing any additional data that may be needed for rendering or interaction. */
    ownerNode: IObject3DNode;
    /**
     * The origin represents the local coordinate system of the geometry inside the owner node.
     */
    origin: Matrix4;
    /**
     * Whether the geometry should be rendered or not.
     * This should also hide child entries.
     */
    hidden?: boolean;
    /**
     * The size of the geometry, if it is a box. This is specific to kind part with box geometry. The size is in the local coordinate system of the owner node
     * and is positioned at the origin.
     */
    size?: Vector3;
    /**
     * SVG path nodes. The SVG can be sourced as ISvgPathNode array or as a raw SVG string. 
     */
    svgPath?: ISvgPathNode[];
    /**
     * The axis along which the SVG should be extruded. 
     */
    svgExtrusionDirection?: string;
    /**
     * The SVG as string for the extrustion.
     */
    svgString?: string;
    /**
     * SVG extrusion depth. This is specific to kind part with SVG extrusion geometry. 
     */
    svgDepth?: number;
    /**
     * The URL of the mesh to load for this geometry. OBJ format is supported.
     */
    meshUrl?: string;
    /**
     * Get a mutable copy of the geometry data, where the node reference is preserved but all other properties are copied.
     */
    getCopy(): IGeometryData;
}

/**
 * The kind of node determines how it should be rendered and interacted with.
 * - SceneRoot: the root node of the scene
 * - PosGroup: order line pos group, this provides coordinate system for the parts
 * - Group: no geometry, only transformation
 * - Wall: created from room data, has an SVG extruded geometry
 * - WallGroup: a group of walls
 * - Part: created from part data, has a box, SVG extrusion or mesh geometry
 * - Module: created from module data, has a bounding box (size, position and transform), but no geometry
 */
export enum Object3DNodeKind {
    SceneRoot = "sceneRoot",
    PosGroup = "posGroup",
    Group = "group",
    Wall = "wall",
    WallGroup = "wallGroup",
    Part = "part",
    Module = "module",
}

/**
 * Default implementation of IGeometryData with getCopy() support.
 */
class GeometryData implements IGeometryData {
    ownerNode: IObject3DNode;
    origin: Matrix4;
    hidden?: boolean;
    size?: Vector3;
    svgPath?: ISvgPathNode[];
    svgExtrusionDirection?: string;
    svgString?: string;
    svgDepth?: number;
    meshUrl?: string;

    constructor(ownerNode: IObject3DNode, origin: Matrix4) {
        this.ownerNode = ownerNode;
        this.origin = origin;
    }

    getCopy(): IGeometryData {
        const copy = new GeometryData(this.ownerNode, this.origin.clone());
        copy.hidden = this.hidden;
        copy.size = this.size ? new Vector3(this.size._x, this.size._y, this.size._z) : undefined;
        copy.svgPath = this.svgPath ? [...this.svgPath] : undefined;
        copy.svgExtrusionDirection = this.svgExtrusionDirection;
        copy.svgString = this.svgString;
        copy.svgDepth = this.svgDepth;
        copy.meshUrl = this.meshUrl;
        return copy;
    }

    evaluateWithRenderSettings(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData {
        // This method mutates the geometry data based on the provided render settings.
        const evaluated = this.getCopy() as GeometryData;
        if (drawingRenderSettings.doNotFetchMeshes) {
            evaluated.meshUrl = undefined;
        }
        if (!drawingRenderSettings.wallsMaterial && this.ownerNode.kind === Object3DNodeKind.Wall) {
            evaluated.hidden = true;
        }
        return evaluated;
    }
}

/**
 * Loose object shape used where the upstream order-data structure is not typed yet.
 */
export interface AnyObject {
    [key: string]: any;
}

/**
 * Untyped order-line payload attached to scene nodes.
 */
export interface IOrderLineEntry extends AnyObject { }

/**
 * Technology-agnostic scene-graph node used as the project's domain model.
 */
export interface IObject3DNode {
    /**
     * The class is used to categorize nodes into types (e.g. wall, part, module).
     */
    readonly kind: Object3DNodeKind;
    /**
     * The ID is used to identify nodes across different scenes 
     * (e.g. original order data, filtered scene, etc.). 
     * It should be stable and unique for each node. 
     * The exact format is not important, as long as it meets these criteria.
     */
    readonly id: string;
    /** Shared node registry for the owning scene tree. */
    readonly idsMap: IdsMap;
    /** Direct child nodes in local transform space. */
    children: IObject3DNode[];
    /**
     * Get all children that are of kind "part". This is a convenience method to avoid having to filter the children array manually.
     */
    getPartChildren(): IObject3DNode[];
    /**
     * Get all children that are of kind "module". This is a convenience method to avoid having to filter the children array manually.
     */
    getModuleChildren(): IObject3DNode[];
    /**
     * Parent node, or `null` when this node is the root of its tree.
     */
    parent: IObject3DNode | null;
    /**
     * Reference to the original order line entry that this node represents. This is useful for accessing any additional data that may be needed for rendering or interaction.
     */
    orderLineEntry: IOrderLineEntry | null;
    /**
     * The transform represents the local transformation of this node relative to its parent.
     * Recommended to get/set, where set will also update the world transform and world transform of all children.
     */
    transform: Matrix4;
    /**
     * Recomputes the cached world transform using the provided parent transform,
     * then propagates the update to all descendants.
     * @param parentWorldTransform World transform of the parent node.
     */
    updateWorldTransform(parentWorldTransform: Matrix4): void;
    /** Cached absolute transform derived from the current parent chain. */
    get worldTransform(): Matrix4;
    /**
     * Adds a child to the node and updates its local/world transform state.
     *
     * When `keepWorldTransform` is `true`, the child's local transform is recomputed
     * so that its world transform stays unchanged after reparenting.
     * 
     * Use `keepWorldTransform = false` when adding a newly created node to the scene, so that its transform is used as a local transform relative to the parent. Use `keepWorldTransform = true` when reparenting an existing node that already has the correct world transform, so that it is not affected by the new parent's transform.
     *
     * @param child Child node to add.
     * @param keepWorldTransform Use `true` when reparenting an existing node.
     */
    addChild(child: IObject3DNode, keepWorldTransform?: boolean): void;
    /**
     * Removes a child from the node while preserving the child's world transform.
     *
     * @param child Child node to remove.
     * @returns Removed child, or `null` when it was not attached to this node.
     */
    removeChild(child: IObject3DNode): IObject3DNode | null;
    /**
     * Exposes renderer-facing geometry metadata for this node.
     * @param drawingRenderSettings Optional renderer-specific conversion settings.
     */
    geometry(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData;
    /**
     * Removes the node and all of its descendants from the tree and unregisters
     * their IDs from the owning IdsMap.
     */
    destroy(): void;

    /**
     * Data for the wall geometry. This is specific to kind wall.
     */
    wallData: IWallSegment | undefined;

}

/**
 * Default implementation of the project's technology-agnostic scene node.
 */
export class OrderSceneNode implements IObject3DNode {
    readonly kind: Object3DNodeKind;
    readonly id: string;
    readonly idsMap: IdsMap;
    children: IObject3DNode[] = [];

    getPartChildren(): IObject3DNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Part);
    }
    getModuleChildren(): IObject3DNode[] {
        return this.children.filter(child => child.kind === Object3DNodeKind.Module);
    }

    parent: IObject3DNode | null = null;
    orderLineEntry: IOrderLineEntry | null = null;
    transform: Matrix4 = new Matrix4(); // identity by default
    _worldTransform: Matrix4 = new Matrix4(); // identity by default

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

    addChild(child: IObject3DNode, keepWorldTransform?: boolean): void {
        // already containts
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

    removeChild(child: IObject3DNode): IObject3DNode | null {
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

    readonly _geometry: GeometryData;
    geometry(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData {
        return this._geometry.evaluateWithRenderSettings(drawingRenderSettings);
    }

    destroy(): void {
        if (this.parent) {
            this.parent.removeChild(this);
        }

        while (this.children.length > 0) {
            this.children[0].destroy();
        }

        this.idsMap.unregister(this);
    }

    wallData: IWallSegment | undefined;

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
     *
     * @param idsMap Scene ID registry.
     * @param id Optional preferred ID.
     * @returns Group node.
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
        const segmentCenter = wallSegment.segmentStart.add(wallSegment.segmentEnd).scale(0.5);
        node.transform.setPosition(segmentCenter._x, segmentCenter._y, segmentCenter._z);
        node._geometry.svgPath = [
            { command: 'M', args: [wallSegment.segmentStart._x, wallSegment.segmentStart._z] },
            { command: 'L', args: [wallSegment.segmentBackStart._x, wallSegment.segmentBackStart._z] },
            { command: 'L', args: [wallSegment.segmentBackEnd._x, wallSegment.segmentBackEnd._z] },
            { command: 'L', args: [wallSegment.segmentEnd._x, wallSegment.segmentEnd._z] },
            { command: 'L', args: [wallSegment.segmentStart._x, wallSegment.segmentStart._z] },
        ];
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

        //console.log(partNode.id, partNode.orderLineEntry);
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
): OrderSceneNode {
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




