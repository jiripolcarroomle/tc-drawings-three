import * as TC from "../../tc/base";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer";

/*
 * Interface for the drawings.
 * This should take a rendered scene image and enhance it with SVG objects.
 * All coordinates the content creator should define must be in world coordinate system or in the module coordinate system.
 * All projections to the 2D drawing coordinate system and all SVG related calculations should be handled by the provided app.
 */
export enum DrawingDirection {
    Top = 'top',
    Elevation = 'elevation',
}

/**
 * Interface for the plan view SVG drawing.
 */
export interface IPlanSvgDrawing {


    get worldToViewMatrix(): TC.Matrix4;
    get sceneRender(): IRenderOrthoCameraResult;

    get drawingDirection(): DrawingDirection;

    /** Add an annotable point to the drawing */
    addAnnotation(worldTransform: TC.Matrix4, annotation: Annotation): void;
    /** Add an overlay SVG object to the drawing at the specified world position */
    addOverlay(worldTransform: TC.Matrix4, svgInjection: SvgPathInjectionData): void;
    /**
     * Add an annotable point to the drawing. The point will be rendered as a circle and can be used for example to mark important points in the drawing.
      */
    addAnnotablePoint(worldTransform: TC.Matrix4, point: AnnotablePoint): void;

    /**
     * After all SVG objects have been added, render the final SVG element.
     * This has to be a 2-step process (1. feed data, 2. compute and render) because some calculations for the SVG rendering (e.g. annotation line positions) require knowledge of all SVG objects that should be rendered in the drawing.
     * @returns The root node of a full SVG image.
     */
    render: () => SVGElement;

}


export interface AnnotablePoint {
    /** coordinate in the scene, relative to the module pivot */
    coordinate: TC.Vector3;
    /** whether the point is relevant for the horizontal (X) axis of the drawing. defaults false. if true, annotation won't show on the given annotation line */
    notHorizontal?: boolean;
    /** whether the point is relevant for the vertical (Y) axis of the drawing. defaults false. if true, annotation won't show on the given annotation line */
    notVertical?: boolean;
    /** whether the point is a wall corner */
    isWallVertex?: boolean;
}

/**
 * Represents a length annotation given between two points in the scene.
 * Defined in the module coordinate system.
 */
export interface Annotation {
    start: TC.Vector3;
    end: TC.Vector3;
    /** The ID of the owner of the annotation. This can be used to group annotations by their owner. */
    ownerId?: string;
    /** The main meaning of the annotation. Layered annotation will go to a common line. */
    layer: string;
    /** Whether to show segments, only sum, or both */
    aggregate?: 'segments' | 'sum' | 'segmentsAndSum';
    /** General categorization useful for filtering the annotations for the drawings. */
    tags?: string[];
    /** if true, the dimension stays at its projected position; if false (or undefined), it is dragged to an annotation line */
    displayAtPosition?: boolean;
    /** The text to show on the annotation. If not provided, the real length will be shown. */
    label?: string;
}



export interface SvgPathCommandData {
    /** MoveTo, LineTo, ClosePath, ... further to add if needed */
    command: 'M' | 'L' | 'Z';
    /** World coordinate in the scene, relative to the module pivot. Necessary for M, L commands, ignored for Z */
    coordinate3d?: TC.Vector3;
}

/**
 * Represents an SVG object to be injected in the drawing, defined by the module content creator.
 * The position of the SVG object is defined by a world coordinate in the scene, relative to the module pivot.
 * The app should take care of projecting this coordinate to the correct position in the drawing and apply the given styles to the injected SVG element.
 * The path is defined by a list of commands, where each command has a type (e.g. MoveTo, LineTo, ClosePath) and a world coordinate (for MoveTo and LineTo) in the scene relative to the module pivot.
 * If necessary, add more fields to the SvgInjectionData interface to allow the content creator to define more styles or properties for the injected SVG element.
 */
export interface SvgPathInjectionData {
    id?: string;
    class?: string;
    fill?: string;
    fillOpacity?: string;
    opacity?: string;
    stroke?: string;
    strokeDasharray?: string;
    strokeDashoffset?: string;
    strokeLinecap?: 'butt' | 'round' | 'square';
    strokeLinejoin?: 'arcs' | 'bevel' | 'miter' | 'miter-clip' | 'round';
    strokeMiterlimit?: string;
    strokeOpacity?: string;
    strokeWidth?: string;
    paintOrder?: string;
    vectorEffect?: 'none' | 'non-scaling-stroke' | 'non-scaling-size' | 'non-rotation' | 'fixed-position';
    transform?: string;
    display?: string;
    visibility?: string;
    pointerEvents?: string;
    shapeRendering?: 'auto' | 'crispEdges' | 'geometricPrecision' | 'optimizeSpeed';
    markerStart?: string;
    markerMid?: string;
    markerEnd?: string;
    pathLength?: string;
    d: SvgPathCommandData[];
    tags: string[];
}   