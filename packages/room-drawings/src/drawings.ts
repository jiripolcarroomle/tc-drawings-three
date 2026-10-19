import type { DrawingContent } from './content.ts';
import { consoleLogger, type Logger } from './log.ts';
import type { OrderInput, OrderLineGroupInput } from './input/order.ts';
import { resolveSettings, styleOf, type DrawingSettings, type SettingsOverrides } from './settings.ts';
import { dot } from './math.ts';
import { solidOf, type Solid } from './geometry/solids.ts';
import { hiddenLineRender, viewBasis, type HlrResult, type ViewBasis } from './render/hlr.ts';
import { mergeSegments } from './render/lines.ts';
import { drawingArea, linesBox, viewContent, writeSheet, type Extent, type TitleBlock } from './render/svg.ts';
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
    /** The view on its own sheet. */
    svg: string;
    stats: { solids: number; faces: number; lines: number; hiddenLines: number; annotations: number };
}

export interface RoomDrawingsResult {
    /** The SVG sheets (overview first, then one per view) and the Drawings.html preview page. */
    files: OutputFile[];
    views: RenderedView[];
    /** All views on one sheet (settings.sheet.overview). */
    overview?: { scale: number; svg: string };
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
    const { solids, modules } = sceneSolids(scene, settings, logger);

    const definitions = defineViews(scene, solids, content, settings);
    const markers = settings.sheet.elevationMarkers ? definitions.flatMap(v => v.marker ? [v.marker] : []) : [];
    const prepared = definitions.map(view => prepareView(view, solids, modules, content, settings, logger));
    const layerSettings = resolveLayerSettings(content.annotationLayerSettings ?? []);
    const fields = content.titleBlock ?? [];
    const withOverview = settings.sheet.overview && prepared.length > 1;
    const sheetCount = prepared.length + (withOverview ? 1 : 0);
    let sheetNumber = 0;

    let overview: RoomDrawingsResult['overview'];
    if (withOverview) {
        overview = overviewSheet(prepared, settings, layerSettings, markers, { fields, sheet: `${++sheetNumber} / ${sheetCount}` });
    }
    const views = prepared.map(view => singleSheet(view, settings, layerSettings, markers, { fields, sheet: `${++sheetNumber} / ${sheetCount}` }));

    const files: OutputFile[] = [];
    if (overview) files.push({ fileName: 'overview.svg', content: overview.svg, contentType: 'image/svg+xml' });
    files.push(...views.map(view => ({ fileName: `${view.name}.svg`, content: view.svg, contentType: 'image/svg+xml' })));
    files.push({ fileName: 'Drawings.html', content: previewPage(views, overview), contentType: 'text/html' });
    return { files, views, overview, scene };
}

/** One view on its own sheet. */
export function renderView(view: ViewDefinition, solids: Map<SceneNode, Solid>, modules: SceneNode[], content: DrawingContent, settings: DrawingSettings, logger: Logger = consoleLogger): RenderedView {
    const prepared = prepareView(view, solids, modules, content, settings, logger);
    return singleSheet(prepared, settings, resolveLayerSettings(content.annotationLayerSettings ?? []), [], { fields: content.titleBlock ?? [], sheet: '1 / 1' });
}

function sceneSolids(scene: Scene, settings: DrawingSettings, logger: Logger): { solids: Map<SceneNode, Solid>; modules: SceneNode[] } {
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
    return { solids, modules };
}

/** A view with its lines and annotation data, before it is laid out at a scale. */
interface PreparedView {
    view: ViewDefinition;
    basis: ViewBasis;
    drawing: HlrResult;
    /** Face colours per solid index of `drawing` (content colorOf), undefined = class fill. */
    fills: (string | undefined)[];
    annotations: ViewAnnotations;
    bbox: { minX: number; minY: number; width: number; height: number };
    solids: number;
}

/** A prepared view laid out at a scale: content in view coordinates and its size on paper [mm]. */
interface Placement {
    scale: number;
    extent: Extent;
    width: number;
    height: number;
    content: string;
}

type Marker = NonNullable<ViewDefinition['marker']>;

function prepareView(view: ViewDefinition, solids: Map<SceneNode, Solid>, modules: SceneNode[], content: DrawingContent, settings: DrawingSettings, logger: Logger): PreparedView {
    const basis = viewBasis(view.direction);

    // geometry: hidden-line drawing of the solids shown in the view
    const shown = [...solids.entries()].filter(([node]) => view.shows(node));
    const wallClass = view.kind === 'top' ? 'wall' : 'wall-elevation';
    const classes = shown.map(([node]) => node.kind === NodeKind.Wall ? wallClass : content.classifyPart?.(nodeContext(node, view)));
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
    // elevations without a wall behind stand on a floor line
    if (view.ground && drawing.visible.length) {
        const xs = drawing.visible.flatMap(s => [s.x1, s.x2]);
        drawing.visible.push({ cls: 'floor', x1: Math.min(...xs) - 200, y1: 0, x2: Math.max(...xs) + 200, y2: 0 });
    }
    const fills = settings.colors.enabled && content.colorOf
        ? shown.map(([node]) => node.kind === NodeKind.Wall ? undefined : lighten(content.colorOf!(nodeContext(node, view)), settings.colors.lighten))
        : [];
    return { view, basis, drawing, fills, annotations: viewAnnotations(view, modules, content, settings, basis, logger), bbox: linesBox(drawing), solids: shown.length };
}

/** Lays out the annotations at the scale and writes the view content (lines, markers, annotations). */
function placeAt(prepared: PreparedView, scale: number, settings: DrawingSettings, layerSettings: Map<string, ILayerSettings>, markers: Marker[]): Placement {
    const { bbox } = prepared;
    const unit = settings.annotations.textHeight / 24; // paper mm per design pixel of the annotation layout
    const pxPerMm = 1 / (unit * scale);
    const layout: AnnotationLayout = layoutAnnotations(prepared.annotations, layerSettings, bbox, pxPerMm, {
        disqualify: settings.annotations.disqualify,
        baseMargin: settings.annotations.baseMargin,
        finalMargin: settings.annotations.finalMargin,
        lineSpacing: settings.annotations.lineSpacing,
        sideSplit: settings.annotations.sideSplit,
    });
    const mmPerPx = 1 / pxPerMm;
    const extent: Extent = {
        minX: bbox.minX - layout.margins.left * mmPerPx,
        maxX: bbox.minX + bbox.width + layout.margins.right * mmPerPx,
        minY: bbox.minY - layout.margins.top * mmPerPx,
        maxY: bbox.minY + bbox.height + layout.margins.bottom * mmPerPx,
    };
    const extra: string[] = [];
    if (prepared.view.kind === 'top') extra.push(...markers.map(marker => markerSvg(marker, prepared.basis, scale, settings)));
    extra.push(`<g class="annotations" transform="translate(${round(bbox.minX)} ${round(bbox.minY)}) scale(${round(mmPerPx, 6)})">${layout.group.toString()}</g>`);
    return {
        scale,
        extent,
        width: (extent.maxX - extent.minX) / scale,
        height: (extent.maxY - extent.minY) / scale,
        content: viewContent(prepared.drawing, settings, scale, extra, prepared.fills),
    };
}

/** The view alone on a sheet, at the largest scale where it fits. */
function singleSheet(prepared: PreparedView, settings: DrawingSettings, layerSettings: Map<string, ILayerSettings>, markers: Marker[], sheet: { fields: TitleBlock['fields']; sheet: string }): RenderedView {
    const area = drawingArea(settings);
    let placement: Placement | undefined;
    for (const scale of settings.scales) {
        placement = placeAt(prepared, scale, settings, layerSettings, markers);
        if (placement.width <= area.width && placement.height <= area.height) break;
    }
    const p = placement!;
    const svg = writeSheet(settings, [{
        scale: p.scale,
        extent: p.extent,
        content: p.content,
        x: area.x + (area.width - p.width) / 2,
        y: area.y + (area.height - p.height) / 2,
    }], { title: prepared.view.title, scale: `1:${p.scale}`, sheet: sheet.sheet, fields: sheet.fields });
    const { drawing, view } = prepared;
    return {
        name: view.name,
        title: view.title,
        scale: p.scale,
        svg,
        stats: { solids: prepared.solids, faces: drawing.faces.length, lines: drawing.visible.length, hiddenLines: drawing.hidden.length, annotations: prepared.annotations.annotations.length },
    };
}

/** All views on one sheet at the largest common scale where they fit, packed in rows with captions. */
function overviewSheet(prepared: PreparedView[], settings: DrawingSettings, layerSettings: Map<string, ILayerSettings>, markers: Marker[], sheet: { fields: TitleBlock['fields']; sheet: string }): { scale: number; svg: string } {
    const area = drawingArea(settings);
    const captionSpace = settings.sheet.captionHeight * 2.4;
    let chosen: { placements: Placement[]; positions: { x: number; y: number }[] } | undefined;
    for (const scale of settings.scales) {
        const placements = prepared.map(p => placeAt(p, scale, settings, layerSettings, markers));
        const positions = packRows(placements.map(p => ({ width: p.width, height: p.height + captionSpace })), area, settings.sheet.viewGap);
        chosen = { placements, positions: positions ?? packRows(placements.map(p => ({ width: p.width, height: p.height + captionSpace })), area, settings.sheet.viewGap, true)! };
        if (positions) break;
    }
    const { placements, positions } = chosen!;
    const scale = placements[0]!.scale;
    const svg = writeSheet(settings, placements.map((p, i) => ({
        scale: p.scale,
        extent: p.extent,
        content: p.content,
        x: positions[i]!.x,
        y: positions[i]!.y,
        caption: prepared[i]!.view.title,
    })), { title: 'Overview', scale: `1:${scale}`, sheet: sheet.sheet, fields: sheet.fields });
    return { scale, svg };
}

/**
 * Packs boxes in rows (in the given order, else tallest first) into the area: rows centered horizontally, the
 * block centered vertically. Returns the top left corners, or undefined when they do not fit (unless `force`).
 */
function packRows(boxes: { width: number; height: number }[], area: { x: number; y: number; width: number; height: number }, gap: number, force = false): { x: number; y: number }[] | undefined {
    const orders = [boxes.map((_, i) => i), boxes.map((_, i) => i).sort((a, b) => boxes[b]!.height - boxes[a]!.height)];
    let best: { rows: number[][]; height: number } | undefined;
    for (const order of orders) {
        const rows: number[][] = [];
        let rowWidth = 0;
        for (const i of order) {
            const width = boxes[i]!.width;
            if (rows.length && rowWidth + gap + width <= area.width) {
                rows[rows.length - 1]!.push(i);
                rowWidth += gap + width;
            }
            else {
                rows.push([i]);
                rowWidth = width;
            }
        }
        const widest = Math.max(...rows.map(row => row.reduce((sum, i) => sum + boxes[i]!.width, 0) + gap * (row.length - 1)));
        const height = rows.reduce((sum, row) => sum + Math.max(...row.map(i => boxes[i]!.height)), 0) + gap * (rows.length - 1);
        const fits = widest <= area.width && height <= area.height;
        if (fits || (force && (!best || height < best.height))) best = { rows, height };
        if (fits) break;
    }
    if (!best) return undefined;
    const positions: { x: number; y: number }[] = [];
    let y = area.y + Math.max(0, (area.height - best.height) / 2);
    for (const row of best.rows) {
        const rowWidth = row.reduce((sum, i) => sum + boxes[i]!.width, 0) + gap * (row.length - 1);
        let x = area.x + (area.width - rowWidth) / 2;
        for (const i of row) {
            positions[i] = { x, y };
            x += boxes[i]!.width + gap;
        }
        y += Math.max(...row.map(i => boxes[i]!.height)) + gap;
    }
    return positions;
}

/** Elevation marker in the top view: circle with the letter, pointer in the view direction; sizes on paper. */
function markerSvg(marker: Marker, basis: ViewBasis, scale: number, settings: DrawingSettings): string {
    const at = projectPoint(marker.at, basis).view;
    let dx = dot(marker.direction, basis.right), dy = -dot(marker.direction, basis.up);
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return '';
    dx /= len; dy /= len;
    const r = settings.sheet.markerRadius * scale;
    const offset = 2 * r + 2 * scale; // the pointer ends 2 mm in front of the furniture
    const cx = at._x - dx * offset, cy = -at._y - dy * offset;
    const px = -dy, py = dx;
    const tip = [cx + dx * 1.9 * r, cy + dy * 1.9 * r];
    const pointer = `M${round(cx + px * r)} ${round(cy + py * r)}L${round(tip[0]!)} ${round(tip[1]!)}L${round(cx - px * r)} ${round(cy - py * r)}Z`;
    const fontSize = settings.sheet.captionHeight * scale;
    return `<g class="elevation-marker"><path d="${pointer}" fill="#000000"/>`
        + `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="#ffffff" stroke="#000000" stroke-width="${round(0.35 * scale)}"/>`
        + `<text x="${round(cx)}" y="${round(cy + fontSize * 0.36)}" font-size="${round(fontSize)}" font-weight="bold" text-anchor="middle">${marker.label}</text></g>`;
}

/** Mixes a #rgb / #rrggbb colour with white; other colour notations are returned as they are. */
function lighten(color: string | undefined, amount: number): string | undefined {
    if (!color || amount <= 0) return color;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim())?.[1];
    if (!hex) return color;
    const full = hex.length === 3 ? [...hex].map(c => c + c).join('') : hex;
    const channels = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16)).map(c => Math.round(c + (255 - c) * Math.min(1, amount)));
    return '#' + channels.map(c => c.toString(16).padStart(2, '0')).join('');
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

function previewPage(views: RenderedView[], overview?: { scale: number }): string {
    const escape = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
    const sections = [
        ...(overview ? [{ title: 'Overview', scale: overview.scale, file: 'overview.svg' }] : []),
        ...views.map(v => ({ title: v.title, scale: v.scale, file: `${v.name}.svg` })),
    ];
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Drawings</title>
<style>body{font-family:Arial,Helvetica,sans-serif;margin:16px;background:#f4f4f4}section{background:#fff;margin:0 0 24px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.15)}h2{font-size:16px;margin:0 0 8px}img{width:100%;height:auto;display:block}</style>
</head>
<body>
${sections.map(s => `<section><h2>${escape(s.title)} — 1:${s.scale}</h2><img src="${escape(s.file)}" alt="${escape(s.title)}"></section>`).join('\n')}
</body>
</html>`;
}
