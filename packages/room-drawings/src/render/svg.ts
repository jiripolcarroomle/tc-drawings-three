import { styleOf, type DrawingSettings } from '../settings.ts';
import type { ClassedSegment, HlrResult } from './hlr.ts';

/**
 * Sheets as SVG strings, no DOM. The sheet is in paper millimeters (width/height in mm, viewBox 0 0 W H); each
 * view is a group in room millimeters scaled by 1/scale, so the drawings are at true scale.
 */

export interface Extent { minX: number; maxX: number; minY: number; maxY: number }

/** One view placed on a sheet. */
export interface SheetView {
    /** Scale denominator (20 = 1:20). */
    scale: number;
    /** What is drawn (drawing + annotations), view coordinates (x right, y down) [room mm]. */
    extent: Extent;
    /** The view in view coordinates (`viewContent`). */
    content: string;
    /** Top left corner of the extent on the sheet [paper mm]. */
    x: number;
    y: number;
    /** Text under the view (overview sheet). */
    caption?: string;
}

export interface TitleBlock {
    title: string;
    scale: string;
    sheet: string;
    /** Content fields (order, position, date, ...). */
    fields: { label: string; value: string }[];
}

/** Space for the views [paper mm]: inside the frame, above the title block. */
export function drawingArea(settings: DrawingSettings): { x: number; y: number; width: number; height: number } {
    const { paper, sheet } = settings;
    const x = paper.margin + sheet.padding, y = paper.margin + sheet.padding;
    return {
        x, y,
        width: paper.width - 2 * x,
        height: paper.height - 2 * y - sheet.titleBlockHeight,
    };
}

/** Bounding box of the drawn lines in view coordinates (x right, y down) [mm]. */
export function linesBox(result: HlrResult): { minX: number; minY: number; width: number; height: number } {
    const segments = [...result.visible, ...result.hidden];
    if (!segments.length) return { minX: 0, minY: 0, width: 0, height: 0 };
    const xs = segments.flatMap(s => [s.x1, s.x2]), ys = segments.flatMap(s => [-s.y1, -s.y2]);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    return { minX, minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY };
}

const format = (n: number, digits = 1) => {
    const s = n.toFixed(digits);
    return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const escapeXml = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Fills and lines of one view in view coordinates; line widths and dashes are on paper at `scale`. `solidFills`
 * (per solid index) override the class fills, e.g. with the colours of the parts.
 */
export function viewContent(result: HlrResult, settings: DrawingSettings, scale: number, extra: string[] = [], solidFills: (string | undefined)[] = []): string {
    const parts: string[] = [];
    if (settings.fills) {
        const fills = result.faces
            .map(face => ({ face, fill: solidFills[face.solid] ?? styleOf(settings, face.cls).fill }))
            .filter(({ fill }) => fill !== 'none')
            .map(({ face, fill }) => `<path d="${face.rings.map(ring => 'M' + ring.map(p => format(p.x) + ' ' + format(-p.y)).join('L') + 'Z').join('')}" fill="${fill}"/>`);
        parts.push(`<g class="fills" fill-rule="evenodd">${fills.join('')}</g>`);
    }
    const strokes = (segmentsOfClass: Map<string | undefined, ClassedSegment[]>, hidden: boolean) => [...segmentsOfClass]
        .map(([cls, list]) => {
            const style = styleOf(settings, cls);
            const dashed = hidden || style.pattern === 'dashed';
            const dash = dashed ? ` stroke-dasharray="${format(2 * scale)} ${format(1 * scale)}"` : '';
            const d = list.map(s => `M${format(s.x1)} ${format(-s.y1)}L${format(s.x2)} ${format(-s.y2)}`).join('');
            return `<path${cls ? ` class="${escapeXml(cls)}"` : ''} stroke-width="${format(style.lineWidth * (hidden ? 0.7 : 1) * scale)}"${dash} d="${d}"/>`;
        });
    parts.push(`<g class="hidden-lines" fill="none" stroke="#000000" stroke-linecap="round">${strokes(groupByClass(result.hidden), true).join('')}</g>`);
    parts.push(`<g class="lines" fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">${strokes(groupByClass(result.visible), false).join('')}</g>`);
    parts.push(...extra);
    return parts.join('\n');
}

export function writeSheet(settings: DrawingSettings, views: SheetView[], titleBlock: TitleBlock): string {
    const { paper, text } = settings;
    const parts: string[] = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${paper.width}mm" height="${paper.height}mm" viewBox="0 0 ${paper.width} ${paper.height}" font-family="${escapeXml(text.fontFamily)}">`);
    parts.push(`<rect width="${paper.width}" height="${paper.height}" fill="#ffffff"/>`);
    for (const view of views) {
        const k = 1 / view.scale;
        parts.push(`<g class="view" transform="translate(${format(view.x, 3)} ${format(view.y, 3)}) scale(${format(k, 6)}) translate(${format(-view.extent.minX, 2)} ${format(-view.extent.minY, 2)})">`);
        parts.push(view.content);
        parts.push('</g>');
        if (view.caption) {
            const width = (view.extent.maxX - view.extent.minX) * k, height = (view.extent.maxY - view.extent.minY) * k;
            parts.push(`<text x="${format(view.x + width / 2, 2)}" y="${format(view.y + height + settings.sheet.captionHeight * 1.6, 2)}" font-size="${format(settings.sheet.captionHeight, 2)}" text-anchor="middle">${escapeXml(view.caption)}</text>`);
        }
    }
    parts.push(frameAndTitleBlock(settings, titleBlock));
    parts.push('</svg>');
    return parts.join('\n');
}

/** Frame at the margin and the title block band at its bottom: title | content fields | scale | sheet. */
function frameAndTitleBlock(settings: DrawingSettings, block: TitleBlock): string {
    const { paper, sheet, text } = settings;
    const m = paper.margin, width = paper.width - 2 * m, height = sheet.titleBlockHeight;
    const top = paper.height - m - height;
    const parts: string[] = [];
    parts.push(`<g class="title-block" fill="none" stroke="#000000">`);
    if (sheet.frame) parts.push(`<rect x="${format(m, 2)}" y="${format(m, 2)}" width="${format(width, 2)}" height="${format(paper.height - 2 * m, 2)}" stroke-width="0.5"/>`);
    parts.push(`<path d="M${format(m, 2)} ${format(top, 2)}h${format(width, 2)}" stroke-width="0.5"/>`);

    // cells: title (wide), one per content field, scale, sheet
    const titleWidth = Math.min(width * 0.32, 130), scaleWidth = 28, sheetWidth = 24;
    const fieldsWidth = width - titleWidth - scaleWidth - sheetWidth;
    const cells: { label?: string; value: string; width: number; size: number }[] = [
        { value: block.title, width: titleWidth, size: text.titleHeight * 1.4 },
        ...block.fields.map(field => ({ label: field.label, value: field.value, width: fieldsWidth / block.fields.length, size: text.titleHeight })),
        ...(block.fields.length ? [] : [{ value: '', width: fieldsWidth, size: text.titleHeight }]),
        { label: 'Scale', value: block.scale, width: scaleWidth, size: text.titleHeight },
        { label: 'Sheet', value: block.sheet, width: sheetWidth, size: text.titleHeight },
    ];
    const labels: string[] = [], values: string[] = [];
    let x = m;
    cells.forEach((cell, index) => {
        if (index > 0) parts.push(`<path d="M${format(x, 2)} ${format(top, 2)}v${format(height, 2)}" stroke-width="0.25"/>`);
        const pad = 2, room = cell.width - 2 * pad, em = 0.62; // average glyph width [em], generous for capitals
        // long values: smaller text, down to 2 mm, then cut with an ellipsis
        const size = Math.max(2, Math.min(cell.size, room / Math.max(1, cell.value.length * em)));
        const fit = Math.floor(room / (size * em));
        const value = cell.value.length > fit ? cell.value.slice(0, Math.max(1, fit - 1)) + '…' : cell.value;
        if (cell.label) {
            labels.push(`<text x="${format(x + pad, 2)}" y="${format(top + pad + 1.6, 2)}">${escapeXml(cell.label)}</text>`);
            values.push(`<text x="${format(x + pad, 2)}" y="${format(top + height - pad - 0.5, 2)}" font-size="${format(size, 2)}">${escapeXml(value)}</text>`);
        }
        else {
            values.push(`<text x="${format(x + pad, 2)}" y="${format(top + height / 2 + size * 0.36, 2)}" font-size="${format(size, 2)}" font-weight="bold">${escapeXml(value)}</text>`);
        }
        x += cell.width;
    });
    parts.push('</g>');
    parts.push(`<g class="title-block-text" fill="#000000">`);
    parts.push(`<g font-size="1.8" fill="#666666">${labels.join('')}</g>`);
    parts.push(values.join(''));
    parts.push('</g>');
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
