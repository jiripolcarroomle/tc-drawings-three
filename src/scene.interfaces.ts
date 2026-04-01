import { IdsMap } from "./idsmap";
import { type ISceneGeometryConversionSettings } from "./drawingrenderer.intefaces";
import { Matrix4, Vector3 } from "./tc/base";
import { type IWallSegment } from "./wall";


/**
 * Technology-agnostic scene-graph node used as the project's domain model.
 * This is a node-graph constructed from the order data and used as a source for rendering and interaction logic.
 * It is not tied to any specific rendering technology and should not contain any renderer-specific data or logic.
 */
export interface IOrderSceneNode {
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
    children: IOrderSceneNode[];
    /**
     * Get all children that are of kind "part". This is a convenience method to avoid having to filter the children array manually.
     */
    getPartChildren(): IOrderSceneNode[];
    /**
     * Get all children that are of kind "module". This is a convenience method to avoid having to filter the children array manually.
     */
    getModuleChildren(): IOrderSceneNode[];
    /**
     * Parent node, or `null` when this node is the root of its tree.
     */
    parent: IOrderSceneNode | null;
    /**
     * Reference to the original order line entry that this node represents. This is useful for accessing any additional data that may be needed for rendering or interaction.
     */
    orderLineEntry: IOrderLineEntry | null;
    /**
     * The transform represents the local transformation of this node relative to its parent.
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
    addChild(child: IOrderSceneNode, keepWorldTransform?: boolean): void;
    /**
     * Removes a child from the node while preserving the child's world transform.
     *
     * @param child Child node to remove.
     * @returns Removed child, or `null` when it was not attached to this node.
     */
    removeChild(child: IOrderSceneNode): IOrderSceneNode | null;
    /**
     * Exposes renderer-facing geometry metadata for this node.
     * @param drawingRenderSettings renderer-specific conversion settings.
     */
    geometry(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData;
    /**
     * Data for the wall geometry. This is specific to kind wall.
     */
    wallData: IWallSegment | undefined;
    /**
     * Returns a list of all corners of bounding boxes of all descendands in world coordinates.
     * This is useful to determining whether a node is close to a wall.
     */
    getAllBBoxCornersInWorld(): Vector3[];
}

/**
 * Untyped order-line payload attached to scene nodes. This is a loose object shape since the structure comes from another project.
 */
export interface IOrderLineEntry extends AnyObject { }
/**
 * Loose object shape used where the upstream order-data structure is not typed yet.
 */

export interface AnyObject {
    [key: string]: any;
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
    Module = "module"
}
/**
 * Renderer-facing geometry metadata extracted from a scene node.
 */

export interface IGeometryData {
    /** The owner node is the node that this geometry data belongs to. This is useful for accessing any additional data that may be needed for rendering or interaction. */
    ownerNode: IOrderSceneNode;
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
    getMutableCopy(): IGeometryData;

    /**
     * Get a copy of the geometry data with mutations applied according to the provided render settings.
     * This is useful for applying any renderer-specific optimizations or fallbacks based on the capabilities of the target technology.
     * Geometry can also be marked as hidden based on it.
     * @param drawingRenderSettings The render settings to apply to the geometry data.
     */
    evaluateWithRenderSettings(drawingRenderSettings: ISceneGeometryConversionSettings): IGeometryData;
}
/**
 * A filter function that takes a scene node and returns a boolean indicating whether the node should be included in the rendering or interaction logic.
 */
export type IOrderSceneNodeFilter = (node: IOrderSceneNode) => boolean;