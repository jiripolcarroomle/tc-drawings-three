import { Vector3 } from './vector3.ts';

/**
 * The drawing content data, exactly as content developers write it today (tc-drawings-three
 * interfaces/drawing.ts and utils/annotationstable.ts): annotation tables with per-module functions that
 * return annotations, SVG path overlays and annotable points in module coordinates, plus layer settings.
 * Points are the order data's Vector3 (fields _x, _y, _z); plain {x, y, z} objects are accepted too.
 */

/** Point as content creates it (the order data's Vector3). */
export type ContentPoint = { _x: number; _y: number; _z: number } | { x: number; y: number; z: number };

export const DrawingDirection = {
    Top: 'top',
    Elevation: 'elevation',
} as const;
export type DrawingDirection = typeof DrawingDirection[keyof typeof DrawingDirection];

/** What the content functions receive as `drawingData` (the content reads `drawingDirection`). */
export interface IPlanSvgDrawing {
    readonly drawingDirection: DrawingDirection;
    /** Name of the view, e.g. 'topview' or 'wall-2-front-elevation'. */
    readonly name: string;
}

export interface AnnotablePoint {
    /** coordinate in the scene, relative to the module pivot */
    coordinate: ContentPoint;
    /** whether the point is relevant for the horizontal (X) axis of the drawing. defaults false */
    notHorizontal?: boolean;
    /** whether the point is relevant for the vertical (Y) axis of the drawing. defaults false */
    notVertical?: boolean;
    /** whether the point is a wall corner */
    isWallVertex?: boolean;
}

/** A length annotation between two points, in the module coordinate system. */
export interface Annotation {
    start: ContentPoint;
    end: ContentPoint;
    /** The ID of the owner of the annotation. */
    ownerId?: string;
    /** The main meaning of the annotation. Layered annotations go to common lines. */
    layer: string;
    /** Whether to show segments, only sum, or both */
    aggregate?: 'segments' | 'sum' | 'segmentsAndSum';
    /** General categorization useful for filtering the annotations for the drawings. */
    tags?: string[];
    /** if true, the dimension stays at its projected position; otherwise it goes to an annotation line */
    displayAtPosition?: boolean;
    /** The text to show; the real length if not provided. */
    label?: string;
}

export interface SvgPathCommandData {
    command: 'M' | 'L' | 'Z';
    /** Coordinate relative to the module pivot; required for M and L. */
    coordinate3d?: ContentPoint;
}

/** SVG path overlay defined in module coordinates (e.g. a countertop outline in the top view). */
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

/** One entry of the annotation table (tab_Annotations). */
export interface I_tab_Annotation {
    /** Comma separated module ids (modId) the entry applies to. */
    in_ModuleId: string;
    in_Condition?: (m: any, drawingData: IPlanSvgDrawing) => boolean;
    out_AnnotablePoints?: (m: any, drawingData: IPlanSvgDrawing) => AnnotablePoint[];
    out_SvgPathOverlays?: (m: any, drawingData: IPlanSvgDrawing) => SvgPathInjectionData[];
    out_Annotations?: (m: any, drawingData: IPlanSvgDrawing) => Annotation[];
}

/** One entry of the annotation layer settings table (tab_AnnotationLayerSettings). */
export interface I_tab_AnnotationLayerSettings {
    in_Layer: string;
    out_AnnotationLineSort?: number;
    out_AnnotateDistanceFromWallCorners?: boolean;
    out_FillAnnotationGaps?: boolean;
}

/** Resolved layer settings (as the orchestration derives them from the table). */
export interface ILayerSettings {
    annotationLineSort?: number;
    addWallCornersToAnnotationLines?: boolean;
    fillAnnotationGaps: boolean;
}

// ---------- internal: projected data of the layout ----------

/**
 * A point in the three coordinate systems the layout needs:
 * world (real distances), camera space (x right, y up, z towards the viewer) and pixel space
 * (the layout's paper-based frame: x right, y down).
 */
export interface TransformedPoint {
    worldCoordinate: Vector3;
    cameraSpaceCoordinate: Vector3;
    pixelCoordinate: Vector3;
}

export interface AnnotationTransformed {
    annotation: Annotation;
    startPoint: TransformedPoint;
    endPoint: TransformedPoint;
    realLength: number;
    projectedLength: number;
    pixelLength: number;
}

export interface AnnotablePointTransformed {
    point: AnnotablePoint;
    transformedPoint: TransformedPoint;
}
