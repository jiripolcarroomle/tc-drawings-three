import type { SceneNode } from './scene/scene.ts';
import type { I_tab_Annotation, I_tab_AnnotationLayerSettings, IPlanSvgDrawing } from './annotations/types.ts';

/**
 * WHAT is drawn is decided by the content side (the order output script, which may call the library's
 * global functions). The API itself knows nothing about module ids, part names or library attributes;
 * it only calls these callbacks with the scene node and its order entry (`data`).
 */

export type ViewKind = 'top' | 'elevation';

export interface ViewInfo {
    name: string;
    kind: ViewKind;
}

export interface NodeContext {
    node: SceneNode;
    /** The order entry of the node (module or part), as given in the order data. */
    data: unknown;
    /** Order entry of the closest module containing the node (the node itself for modules). */
    module: unknown;
    view: ViewInfo;
}

export interface DrawingContent {
    /**
     * The drawing content data as content developers write it (tab_Annotations): per module id, functions that
     * return annotations, SVG path overlays and annotable points in module coordinates. The API lays them out.
     */
    annotations?: I_tab_Annotation[];
    /**
     * Instead of `annotations`: the entries that apply to a module in a drawing, conditions evaluated - e.g. the
     * content's `filterAnnotationForModule`.
     */
    annotationsOf?(modId: string, data: unknown, drawing: IPlanSvgDrawing): I_tab_Annotation[];
    /** Settings of the annotation layers (tab_AnnotationLayerSettings): line order, gaps, wall corner distances. */
    annotationLayerSettings?: I_tab_AnnotationLayerSettings[];
    /** Whether a part or module is drawn in a view (e.g. skip drillings or fittings). Default: everything. */
    includeNode?(context: NodeContext): boolean;
    /** Style class of a part (a key of `settings.styles`, e.g. 'front', 'carcass', 'worktop'). Default: none. */
    classifyPart?(context: NodeContext): string | undefined;
    /**
     * Ids (order `_id`) of the modules whose contours a generated module was created from. A generated module
     * is drawn in an elevation only when one of its owners is in it. Without owner ids it falls back to the
     * distance from the wall.
     */
    ownerIds?(context: { node: SceneNode; data: unknown }): string[] | undefined;
}
