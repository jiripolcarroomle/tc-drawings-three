import type { DrawingContent } from './content.ts';
import { consoleLogger, type Logger } from './log.ts';
import type { OrderInput, OrderLineGroupInput } from './input/order.ts';
import { resolveSettings, styleOf, type DrawingSettings, type SettingsOverrides } from './settings.ts';
import { solidOf, type Solid } from './geometry/solids.ts';
import { hiddenLineRender, viewBasis, type ViewBasis } from './render/hlr.ts';
import { mergeSegments } from './render/lines.ts';
import { drawingArea, linesBox, writeSheet } from './render/svg.ts';
import { buildSceneFromOrder } from './scene/from-order.ts';
import { NodeKind, walk, type Scene, type SceneNode } from './scene/scene.ts';
import { defineViews, nodeContext, type ViewDefinition } from './views.ts';
import { collectAnnotations, entriesForModule, projectPoint, type EntriesOf } from './annotations/collect.ts';
import { layoutAnnotations, type AnnotationLayout, type ViewAnnotations } from './annotations/layout.ts';
import { DrawingDirection, type I_tab_AnnotationLayerSettings, type ILayerSettings } from './annotations/types.ts';

export interface RoomDrawingOptions {
    /** WHAT is drawn: the content data (annotation tables) and the content callbacks. */
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
    stats: { solids: number; faces: number; lines: number; hiddenLines: number; annotations: number };
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
    const modules: SceneNode[] = [];
    walk(scene.root, node => {
        if (node.kind === NodeKind.Module) modules.push(node);
        try {
            const solid = solidOf(node, settings.smoothAngle);
            if (solid) solids.set(node, solid);
        }
        catch (error) {
            logger.warning(`room-drawings: no geometry for ${node.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
    });

    const views = defineViews(scene, solids, content, settings).map(view => renderView(view, solids, modules, content, settings, logger));
    const files: OutputFile[] = views.map(view => ({ fileName: `${view.name}.svg`, content: view.svg, contentType: 'image/svg+xml' }));
    files.push({ fileName: 'Drawings.html', content: previewPage(views), contentType: 'text/html' });
    return { files, views, scene };
}

export function renderView(view: ViewDefinition, solids: Map<SceneNode, Solid>, modules: SceneNode[], content: DrawingContent, settings: DrawingSettings, logger: Logger = consoleLogger): RenderedView {
    const basis = viewBasis(view.direction);

    // geometry: hidden-line drawing of the solids shown in the view
    const shown = [...solids.entries()].filter(([node]) => view.shows(node));
    const classes = shown.map(([node]) => node.kind === NodeKind.Wall ? 'wall' : content.classifyPart?.(nodeContext(node, view)));
    const result = hiddenLineRender(
        shown.map(([, solid]) => solid),
        classes,
        classes.map(cls => styleOf(settings, cls).hiddenLines === 'dashed'),
        basis,
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
    const drawing = {
        ...result,
        visible: lines.filter(s => !isHidden(s.cls)),
        hidden: lines.filter(s => isHidden(s.cls)).map(s => ({ ...s, cls: s.cls!.slice(HIDDEN.length) || undefined })),
    };

    // content annotations of the modules in the view, laid out at the largest scale where everything fits
    const annotations = viewAnnotations(view, modules, content, settings, basis, logger);
    const layerSettings = resolveLayerSettings(content.annotationLayerSettings ?? []);
    const bbox = linesBox(drawing);
    const unit = settings.annotations.textHeight / 24; // paper mm per design pixel of the annotation layout
    const area = drawingArea(settings);
    let chosen: { scale: number; pxPerMm: number; layout: AnnotationLayout } | undefined;
    for (const scale of settings.scales) {
        const pxPerMm = 1 / (unit * scale);
        const layout = layoutAnnotations(annotations, layerSettings, bbox, pxPerMm, {
            disqualify: settings.annotations.disqualify,
            baseMargin: settings.annotations.baseMargin,
            finalMargin: settings.annotations.finalMargin,
            lineSpacing: settings.annotations.lineSpacing,
        });
        chosen = { scale, pxPerMm, layout };
        const width = (bbox.width * pxPerMm + layout.margins.left + layout.margins.right) * unit;
        const height = (bbox.height * pxPerMm + layout.margins.top + layout.margins.bottom) * unit;
        if (width <= area.width && height <= area.height) break;
    }
    const { scale, pxPerMm, layout } = chosen!;
    const mmPerPx = 1 / pxPerMm;
    const svg = writeSheet(view.title, drawing, settings, {
        scale,
        extent: {
            minX: bbox.minX - layout.margins.left * mmPerPx,
            maxX: bbox.minX + bbox.width + layout.margins.right * mmPerPx,
            minY: bbox.minY - layout.margins.top * mmPerPx,
            maxY: bbox.minY + bbox.height + layout.margins.bottom * mmPerPx,
        },
        overlay: `<g transform="translate(${round(bbox.minX)} ${round(bbox.minY)}) scale(${round(mmPerPx, 6)})">${layout.group.toString()}</g>`,
    });
    return {
        name: view.name,
        title: view.title,
        scale,
        svg,
        stats: { solids: shown.length, faces: drawing.faces.length, lines: drawing.visible.length, hiddenLines: drawing.hidden.length, annotations: annotations.annotations.length },
    };
}

function viewAnnotations(view: ViewDefinition, modules: SceneNode[], content: DrawingContent, settings: DrawingSettings, basis: ViewBasis, logger: Logger): ViewAnnotations {
    const drawingInfo = { drawingDirection: view.kind === 'top' ? DrawingDirection.Top : DrawingDirection.Elevation, name: view.name };
    const entriesOf: EntriesOf = content.annotationsOf
        ? (modId, data, drawing) => content.annotationsOf!(modId, data, drawing)
        : (modId, data, drawing) => entriesForModule(content.annotations ?? [], modId, data, drawing);
    const result = collectAnnotations(modules.filter(m => view.shows(m)), entriesOf, drawingInfo, basis, settings.annotations.excludeTags, logger);
    for (const corner of view.wallVertices) {
        result.annotablePoints.push({ point: { coordinate: { x: corner.x, y: corner.y, z: corner.z }, isWallVertex: true }, at: projectPoint(corner, basis) });
    }
    return result;
}

/** Layer settings table -> settings per layer, with the defaults of the original orchestration. */
function resolveLayerSettings(table: I_tab_AnnotationLayerSettings[]): Map<string, ILayerSettings> {
    return new Map(table.map(setting => [setting.in_Layer, {
        fillAnnotationGaps: setting.out_FillAnnotationGaps ?? false,
        addWallCornersToAnnotationLines: setting.out_AnnotateDistanceFromWallCorners ?? false,
        annotationLineSort: setting.out_AnnotationLineSort ?? 0,
    }]));
}

const round = (n: number, digits = 2) => {
    const f = 10 ** digits;
    return Math.round(n * f) / f;
};

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
