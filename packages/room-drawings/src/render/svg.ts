import { styleOf, type DrawingSettings } from '../settings.ts';
import type { ClassedSegment, HlrResult } from './hlr.ts';

/**
 * Writes one view as an SVG sheet at true scale: the viewBox is in room millimeters, the sheet size in paper
 * millimeters, so 1 unit on paper = 1/scale. The first allowed scale that fits the drawing area is used.
 * Pure string output, no DOM.
 */

export interface SheetResult {
    svg: string;
    /** Scale denominator (20 = 1:20). */
    scale: number;
}

const format = (n: number) => {
    const s = n.toFixed(1);
    return s === '-0.0' ? '0.0' : s;
};
const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function writeSheet(title: string, result: HlrResult, settings: DrawingSettings): SheetResult {
    const { paper } = settings;
    const segments = [...result.visible, ...result.hidden];
    const xs = segments.flatMap(s => [s.x1, s.x2]);
    const ys = segments.flatMap(s => [-s.y1, -s.y2]);
    const minX = xs.length ? Math.min(...xs) : 0, maxX = xs.length ? Math.max(...xs) : 1;
    const minY = ys.length ? Math.min(...ys) : 0, maxY = ys.length ? Math.max(...ys) : 1;
    const titleBand = settings.text.titleHeight * 3;
    const areaWidth = paper.width - 2 * paper.margin, areaHeight = paper.height - 2 * paper.margin - titleBand;
    const scale = settings.scales.find(s => (maxX - minX) / s <= areaWidth && (maxY - minY) / s <= areaHeight)
        ?? Math.ceil(Math.max((maxX - minX) / areaWidth, (maxY - minY) / areaHeight));

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

    const textY = originY + height - paper.margin * scale - settings.text.titleHeight * scale * 0.5;
    parts.push(`<text x="${format(originX + paper.margin * scale)}" y="${format(textY)}" font-family="${escapeXml(settings.text.fontFamily)}" font-size="${format(settings.text.titleHeight * scale)}">${escapeXml(title)} — 1:${scale}</text>`);
    parts.push('</svg>');
    return { svg: parts.join('\n'), scale };
}

function groupByClass(segments: ClassedSegment[]): Map<string | undefined, ClassedSegment[]> {
    const map = new Map<string | undefined, ClassedSegment[]>();
    for (const s of segments) {
        const list = map.get(s.cls);
        if (list) list.push(s); else map.set(s.cls, [s]);
    }
    return map;
}
