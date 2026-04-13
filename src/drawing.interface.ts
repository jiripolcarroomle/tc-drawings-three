import * as TC from "./tc/base";
import type { IRenderOrthoCameraResult } from "./orderdrawingrenderer.interface";

/*
 * Interface for the drawings.
 * This should take a rendered scene image and enhant it with SVG objects.
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

    /** Add an SVG object to the drawing at the specified world position. */
    addSvgObject(worldTransform: TC.Matrix4, svgInjection: SVGElement): void;
    /** Add an annotable point to the drawing */
    addAnnotation(worldTransform: TC.Matrix4, annotation: Annotation): void;
    /** Add an overlay SVG object to the drawing at the specified world position */
    addOverlay(worldTransform: TC.Matrix4, svgInjection: SvgInjectionData): void;

    /**
     * After all SVG objects have been added, render the final SVG element.
     * This has to be a 2-step process (1. feed data, 2. compute and render) because some calculations for the SVG rendering (e.g. annotation line positions) require knowledge of all SVG objects that should be rendered in the drawing.
     * @returns The root node of a full SVG image.
     */
    render: () => SVGElement;

}


export interface AnnotablePoint {
    coordinate: TC.Vector3; // coordinate in the scene, relative to the module pivot
}

/**
 * Represents a length annotation given between two points in the scene.
 * Defined in the module coordinate system.
 */
export interface Annotation {
    /** Scene coordinate where the annotation starts */
    start: TC.Vector3;
    /** Scene coordinate where the annotation ends */
    end: TC.Vector3;
    /** The label the annotation should have. If not provided, the length of the annotation line will be used as the label */
    label?: string;
    /** Whether the annotation line should be at the annotated points (false) or if it will be on a common annotation line on the edge of the drawing (true) */
    shouldGoToAnnotationLine?: boolean;
    /**
     * If !shouldGoToAnnotationLine, this applies. Defines the distance of the annotation line from the annotated points.
     * Distance is given in the SVG drawing units.
     * If distance is given and is long enough, helper lines are drawn.
     * From start to end, positive distance lifts the annotation line to left (e.g. start 9 o'clock, end 3 o'clock, annotation line above if distance positive).
     * The text might be flipped to always be legible (e.g. not upside-down etc.)
     */
    distance?: number;
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
export interface SvgInjectionData {
    fill?: string;
    stroke?: string;
    'stroke-dasharray'?: string;
    'stroke-width'?: string;
    path: SvgPathCommandData[];
}