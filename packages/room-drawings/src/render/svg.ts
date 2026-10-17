import { styleOf, type DrawingSettings } from '../settings.ts';
import type { ClassedSegment, HlrResult } from './hlr.ts';

/**
 * Writes one view as an SVG sheet at true scale: the viewBox is in room millimeters, the sheet size in paper
 * millimeters, so 1 unit on paper = 1/scale. Pure string output, no DOM.
 */

export interface SheetPlacement {
    /** Scale denominator (20 = 1:20). */
    scale: number;
    /** What has to fit and is centered in the drawing area (drawing + annotations), sheet coordinates (y down) [mm]. */
    extent: { minX: number; maxX: number; minY: number; maxY: number };
    /** SVG drawn on top of the geometry (annotations), in sheet coordinates. */
    overlay?: string;
}

/** Drawing area of the sheet [paper mm]: sheet minus margins minus the title band. */
export function drawingArea(settings: DrawingSettings): { width: number; height: number } {
    return {
        width: settings.paper.width - 2 * settings.paper.margin,
        height: settings.paper.height - 2 * settings.paper.margin - settings.text.titleHeight * 3,
    };
}

/** Bounding box of the drawn lines in sheet coordinates (x right, y down) [mm]. */
export function linesBox(result: HlrResult): { minX: number; minY: number; width: number; height: number } {
    const segments = [...result.visible, ...result.hidden];
    if (!segments.length) return { minX: 0, minY: 0, width: 0, height: 0 };
    const xs = segments.flatMap(s => [s.x1, s.x2]), ys = segments.flatMap(s => [-s.y1, -s.y2]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

const format = (n: number) => {
    const s = n.toFixed(1);
    return s === '-0.0' ? '0.0' : s;
};
const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function writeSheet(title: string, result: HlrResult, settings: DrawingSettings, placement: SheetPlacement): string {
    const { paper } = settings;
    const { scale } = placement;
    const { minX, maxX, minY, maxY } = placement.extent;
    const { width: areaWidth, height: areaHeight } = drawingArea(settings);

    // sheet in model units, drawing centered in the drawing area
    const width = paper.width * scale, height = paper.height * scale;
    const originX = minX - (paper.margin * scale + (areaWidth * scale - (maxX - minX)) / 2);
    const originY = minY - (paper.margin * scale + (areaHeight * scale - (maxY - minY)) / 2);

    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${paper.width}mm" height="${paper.height}mm" viewBox="${format(originX)} ${format(originY)} ${format(width)} ${format(height)}">`);
    parts.push(`<rect x="${format(originX)}" y="${format(originY)}" width="${format(width)}" height="${format(height)}" fill="#ffffff"/>`);

    if (settings.fills) {
        const fills = result.faces
            .map(face => ({ face, fill: styleOf(settings, face.cls).fill }))
            .filter(({ fill }) => fill !== 'none')
            .map(({ face, fill }) => `<path d="${face.rings.map(ring => 'M' + ring.map(p => format(p.x) + ' ' + format(-p.y)).join('L') + 'Z').join('')}" fill="${fill}"/>`);
        parts.push(`<g id="fills" fill-rule="evenodd">${fills.join('')}</g>`);
    }

    const strokes = (segmentsOfClass: Map<string | undefined, ClassedSegment[]>, hidden: boolean) => [...segmentsOfClass]
        .map(([cls, list]) => {
            const style = styleOf(settings, cls);
            const dashed = hidden || style.pattern === 'dashed';
            const dash = dashed ? ` stroke-dasharray="${format(2 * scale)} ${format(1 * scale)}"` : '';
            const d = list.map(s => `M${format(s.x1)} ${format(-s.y1)}L${format(s.x2)} ${format(-s.y2)}`).join('');
            return `<path${cls ? ` class="${escapeXml(cls)}"` : ''} stroke-width="${format(style.lineWidth * (hidden ? 0.7 : 1) * scale)}"${dash} d="${d}"/>`;
        });
    parts.push(`<g id="hidden-lines" fill="none" stroke="#000000" stroke-linecap="round">${strokes(groupByClass(result.hidden), true).join('')}</g>`);
    parts.push(`<g id="lines" fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">${strokes(groupByClass(result.visible), false).join('')}</g>`);
    if (placement.overlay) parts.push(`<g id="annotations">${placement.overlay}</g>`);

    const textY = originY + height - paper.margin * scale - settings.text.titleHeight * scale * 0.5;
    parts.push(`<text x="${format(originX + paper.margin * scale)}" y="${format(textY)}" font-family="${escapeXml(settings.text.fontFamily)}" font-size="${format(settings.text.titleHeight * scale)}">${escapeXml(title)} — 1:${scale}</text>`);
    parts.push('</svg>');
    return parts.join('\n');
}

function groupByClass(segments: ClassedSegment[]): Map<string | undefined, ClassedSegment[]> {
    const map = new Map<string | undefined, ClassedSegment[]>();
    for (const s of segments) {
        const list = map.get(s.cls);
        if (list) list.push(s); else map.set(s.cls, [s]);
    }
    return map;
}
