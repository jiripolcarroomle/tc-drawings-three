import type { IOrderSceneNode, IOrderSceneNodeFilter } from "./scene.interface";
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
    /** Optional material for solid geometry generation. If missing, the a default material will be used. */
    material?: any;
    /** Optional material for wireframe geometry generation. If missing, the wireframe is not rendered. */
    wireframeMaterial?: any;
    /** Optional material for walls geometry generation. If missing, the walls are not rendered. */
    wallsMaterial?: any;
    /** Optional material for walls wireframe generation. If missing, but wallsMaterial is provided, the wireframeMaterial will be used. */
    wallsWireframeMaterial?: any;
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
    /** the rendered data in any format */
    image: any;
    /** the scene that has been rendered; useful for debugging or further processing */
    renderedScene?: any;
    /** the actual width of the rendered image in pixels or another unit */
    imageWidth: number;
    /** the actual height of the rendered image in pixels or another unit */
    imageHeight: number;
    /** additional metadata or information related to the rendered image */
    data?: any;
}

