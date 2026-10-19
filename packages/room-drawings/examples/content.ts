// Example content: what a content developer provides in the order output script (there it would call the
// library's global functions). Used by the regression suite and the preview script. The package itself knows
// none of these names.
import type { DrawingContent, SettingsOverrides } from '../src/index.ts';
import { tab_AnnotationLayerSettings, tab_Annotations } from './annotationstable.ts';

type Entry = Record<string, unknown> | undefined;

/**
 * Colours of the materials used by the test orders. APPROXIMATIONS of the decors (Egger codes, closest RAL/NCS
 * where published) for the example only; content developers take the real values from the material catalog.
 */
export const materialColors: Record<string, string> = {
    'egger:u708_st9': '#c9cac6', // Light Grey (RAL 7047)
    'egger:h3190_st19': '#4b4c4e', // Anthracite Fineline Metallic
    'egger:f800_st9': '#e4e1db', // Crystal Marble
    'egger:f186_st9': '#b9b6af', // Light Grey Chicago Concrete
    'egger:f235_st76': '#4e4f4d', // Scivaro Slate
    'egger:f765_st20': '#a9acad', // brushed silver grey
    'egger:u999_st7': '#2b2b2b', // Black
    'egger:w980_st7': '#efeeea', // Platinum White
    'cabinetlibrary:stainless_steel': '#b5b8ba',
};

/** Colour of a part: the material of its front face (else the default / first face material), see materialColors. */
function partColor(data: unknown): string | undefined {
    const faces = (data as Entry)?.['_faceMaterial'];
    if (!Array.isArray(faces) || !faces.length) return undefined;
    const face = faces.find(f => f?.faceKey === 'front') ?? faces.find(f => !f?.faceKey || f.faceKey === 'default') ?? faces[0];
    return materialColors[String(face?.materialId)];
}

export const exampleContent: DrawingContent = {
    annotations: tab_Annotations,
    annotationLayerSettings: tab_AnnotationLayerSettings,
    includeNode: ({ node }) => !(node.kind === 'part' && /drill|hanger|hinge/i.test(node.id)),
    classifyPart: ({ node }) => {
        const id = node.id;
        if (node.geometry?.type === 'mesh' || /Leg|Handle/i.test(id)) return 'hardware';
        if (/Countertop|Backsplash|Paneltop/i.test(id)) return 'worktop';
        if (/Toekick|Baseboard|Plinth/i.test(id)) return 'plinth';
        if (/Door|Front|Drawer|Fliplift/i.test(id)) return 'front';
        return 'carcass';
    },
    colorOf: ({ data }) => partColor(data),
    ownerIds: ({ data }) => {
        const ids = (data as Entry)?.['mod_ContourOwnerIds'];
        return Array.isArray(ids) ? ids.map(String) : undefined;
    },
};

/** The example content with title block fields, as an order output would fill them from the order data. */
export function exampleContentFor(order: string): DrawingContent {
    return {
        ...exampleContent,
        titleBlock: [
            { label: 'Order', value: order },
            { label: 'Position', value: '1' },
            { label: 'Description', value: 'Kitchen' },
            { label: 'Date', value: '2026-10-17' },
        ],
    };
}

export const exampleSettings: SettingsOverrides = {
    styles: {
        carcass: { lineWidth: 0.25, fill: '#ffffff', pattern: 'solid', hiddenLines: 'none' },
        front: { lineWidth: 0.35, fill: '#f5f5f5', pattern: 'solid', hiddenLines: 'none' },
        worktop: { lineWidth: 0.35, fill: '#ebebeb', pattern: 'solid', hiddenLines: 'none' },
        plinth: { lineWidth: 0.25, fill: '#f0f0f0', pattern: 'solid', hiddenLines: 'none' },
        hardware: { lineWidth: 0.18, fill: '#c8c8c8', pattern: 'solid', hiddenLines: 'none' },
    },
};
