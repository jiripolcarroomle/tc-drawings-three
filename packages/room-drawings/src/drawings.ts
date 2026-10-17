import type { DrawingContent } from './content.ts';
import { consoleLogger, type Logger } from './log.ts';
import type { OrderInput, OrderLineGroupInput } from './input/order.ts';
import { resolveSettings, styleOf, type DrawingSettings, type SettingsOverrides } from './settings.ts';
import { solidOf, type Solid } from './geometry/solids.ts';
import { hiddenLineRender, viewBasis } from './render/hlr.ts';
import { mergeSegments } from './render/lines.ts';
import { writeSheet } from './render/svg.ts';
import { buildSceneFromOrder } from './scene/from-order.ts';
import { NodeKind, walk, type Scene, type SceneNode } from './scene/scene.ts';
import { defineViews, nodeContext, type ViewDefinition } from './views.ts';

export interface RoomDrawingOptions {
    /** WHAT is drawn (content callbacks). */
    content?: DrawingContent;
    /** HOW it is drawn. */
    settings?: SettingsOverrides;
    logger?: Logger;
}

/** Same shape as the library's IOutputFileEntry. */
export interface OutputFile {
    fileName: string;
    content: string;
    contentType: string;
}

export interface RenderedView {
    name: string;
    title: string;
    /** Scale denominator. */
    scale: number;
    svg: string;
    stats: { solids: number; faces: number; lines: number; hiddenLines: number };
}

export interface RoomDrawingsResult {
    /** The SVG sheets and the Drawings.html preview page. */
    files: OutputFile[];
    views: RenderedView[];
    scene: Scene;
}

/** Drawings of a furnished room from the order data (production entry point). */
export function createRoomDrawings(input: { order: OrderInput; groups: OrderLineGroupInput[] }, options: RoomDrawingOptions = {}): RoomDrawingsResult {
    const logger = options.logger ?? consoleLogger;
    return createRoomDrawingsFromScene(buildSceneFromOrder(input.order, input.groups, logger), options);
}

/** Drawings of an already built scene (e.g. a snapshot). */
export function createRoomDrawingsFromScene(scene: Scene, options: RoomDrawingOptions = {}): RoomDrawingsResult {
    const settings = resolveSettings(options.settings);
    const content = options.content ?? {};
    const logger = options.logger ?? consoleLogger;

    const solids = new Map<SceneNode, Solid>();
    walk(scene.root, node => {
        try {
            const solid = solidOf(node, settings.smoothAngle);
            if (solid) solids.set(node, solid);
        }
        catch (error) {
            logger.warning(`room-drawings: no geometry for ${node.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    const views = defineViews(scene, solids, content, settings).map(view => renderView(view, solids, content, settings));
    const files: OutputFile[] = views.map(view => ({ fileName: `${view.name}.svg`, content: view.svg, contentType: 'image/svg+xml' }));
    files.push({ fileName: 'Drawings.html', content: previewPage(views), contentType: 'text/html' });
    return { files, views, scene };
}

export function renderView(view: ViewDefinition, solids: Map<SceneNode, Solid>, content: DrawingContent, settings: DrawingSettings): RenderedView {
    const shown = [...solids.entries()].filter(([node]) => view.shows(node));
    const classes = shown.map(([node]) => node.kind === NodeKind.Wall ? 'wall' : content.classifyPart?.(nodeContext(node, view)));
    const result = hiddenLineRender(
        shown.map(([, solid]) => solid),
        classes,
        classes.map(cls => styleOf(settings, cls).hiddenLines === 'dashed'),
        viewBasis(view.direction),
        { depthTolerance: settings.tolerance.depth, boundaryTolerance: settings.tolerance.boundary },
    );
    // one merge for visible and hidden lines: visible ones always win, so a hidden piece that another part
    // draws as visible disappears; among each group the heavier line wins
    const HIDDEN = '\u0000hidden\u0000';
    const isHidden = (cls: string | undefined) => !!cls?.startsWith(HIDDEN);
    const lines = mergeSegments(
        [...result.visible, ...result.hidden.map(s => ({ ...s, cls: HIDDEN + (s.cls ?? '') }))],
        cls => isHidden(cls) ? styleOf(settings, cls!.slice(HIDDEN.length) || undefined).lineWidth - 1000 : styleOf(settings, cls).lineWidth,
    );
    const merged = {
        ...result,
        visible: lines.filter(s => !isHidden(s.cls)),
        hidden: lines.filter(s => isHidden(s.cls)).map(s => ({ ...s, cls: s.cls!.slice(HIDDEN.length) || undefined })),
    };
    const sheet = writeSheet(view.title, merged, settings);
    return {
        name: view.name,
        title: view.title,
        scale: sheet.scale,
        svg: sheet.svg,
        stats: { solids: shown.length, faces: merged.faces.length, lines: merged.visible.length, hiddenLines: merged.hidden.length },
    };
}

function previewPage(views: RenderedView[]): string {
    const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drawings</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:16px;background:#f4f4f4}section{background:#fff;margin:0 0 24px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.15)}h2{font-size:16px;margin:0 0 8px}img{width:100%;height:auto;display:block}</style>
</head>
<body>
${views.map(v => `<section><h2>${escape(v.title)} — 1:${v.scale}</h2><img src="${escape(v.name)}.svg" alt="${escape(v.title)}"></section>`).join('\n')}
</body>
</html>`;
}
