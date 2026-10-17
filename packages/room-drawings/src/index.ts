/**
 * room-drawings: vector drawings (top view, elevations) of a furnished room from order data.
 * Runs anywhere (server included): no DOM, no WebGL, no runtime dependencies.
 *
 * Responsibilities:
 * - content side (order output script): WHAT is drawn, via the `content` callbacks,
 * - this package: HOW - scene, views, hidden-line rendering, layout at true scale, output files.
 */

export { createRoomDrawings, createRoomDrawingsFromScene, renderView } from './drawings.ts';
export type { OutputFile, RenderedView, RoomDrawingOptions, RoomDrawingsResult } from './drawings.ts';
export type { DrawingContent, NodeContext, ViewInfo, ViewKind } from './content.ts';
// the drawing content data, unchanged from how content developers write it
export { DrawingDirection } from './annotations/types.ts';
export type { AnnotablePoint, Annotation, ContentPoint, I_tab_Annotation, I_tab_AnnotationLayerSettings, IPlanSvgDrawing, SvgPathCommandData, SvgPathInjectionData } from './annotations/types.ts';
export { defaultSettings, resolveSettings } from './settings.ts';
export type { ClassStyle, DrawingSettings, SettingsOverrides } from './settings.ts';
export type { Logger } from './log.ts';
export type { ModuleInput, OrderInput, OrderLineGroupInput, OrderLineInput, PartInput, RoomContourInput, RoomContourSegmentInput } from './input/order.ts';
export { buildSceneFromOrder } from './scene/from-order.ts';
export { NodeKind, walk, walls, placedModules } from './scene/scene.ts';
export type { Geometry, ModuleInfo, Scene, SceneNode, WallData } from './scene/scene.ts';
export { sceneFromSnapshot, sceneToSnapshot, SNAPSHOT_FORMAT } from './scene/snapshot.ts';
export type { SceneSnapshot, SnapshotNode } from './scene/snapshot.ts';
export { defineViews } from './views.ts';
export type { ViewDefinition } from './views.ts';
