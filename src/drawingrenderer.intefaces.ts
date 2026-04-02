import type { IOrderSceneNode, IOrderSceneNodeFilter } from "./scene.interfaces";
import * as TC from "./tc/base";

/**
 * A renderer function that takes a scene root node, an optional filter function, render settings, and returns a promise that resolves to the rendered result.
 * The result is then intended to be enhanced with annotations.
 */
export type IRenderDrawing = (
    sceneRoot: IOrderSceneNode,
    filter: IOrderSceneNodeFilter | undefined,
    drawingSettings: ISceneGeometryConversionSettings,
    renderSettings: IRenderOrthoCameraParams
) => Promise<IRenderOrthoCameraResult>;

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
    /** Whether to fetch and use actual meshes or use just their bounding boxes. */
    doNotFetchMeshes?: boolean;
}

export interface IRenderOrthoCameraParams {
    /** direction of the camera, if unprovided, down direction will be used */
    direction?: TC.Vector3;
    /** Output maximum image width in pixels. The actual size will depend on the content. */
    drawingMaxWidth?: number;
    /** Output maximum image height in pixels. The actual size will depend on the content. */
    drawingMaxHeight?: number;
    
    /*
     * optional orthographic view volume parameters; if not provided, the camera will automatically fit the scene bounding box
     */
    near?: number;
    far?: number;
    left?: number;
    right?: number;
    top?: number;
    bottom?: number;
}

/**
 * Result of the rendered drawing.
 */
export interface IRenderOrthoCameraResult {
    /** the matrix transforming world coordinates to output image pixel coordinates */
    worldToViewMatrix: TC.Matrix4;
    /** the rendered data */
    renderedResult: any;
    /** the rendered scene */
    renderedScene: any;
    imageWidth: number;
    imageHeight: number;
}

