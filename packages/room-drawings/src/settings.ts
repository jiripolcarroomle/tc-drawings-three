/**
 * Everything about HOW the drawings look. WHAT is drawn comes from the content callbacks (see content.ts).
 * All sizes on paper are in millimeters of the printed sheet; model sizes are millimeters of the room.
 */

export interface ClassStyle {
    /** Line width on paper [mm]. */
    lineWidth: number;
    /** Face fill color, or 'none'. */
    fill: string;
    /** Line pattern of the visible edges. */
    pattern: 'solid' | 'dashed';
    /** How hidden edges of this class are drawn: not at all, or dashed (e.g. wall units in the top view). */
    hiddenLines: 'none' | 'dashed';
}

export interface DrawingSettings {
    /** Sheet size and margin [mm]. Default A3 landscape. */
    paper: { width: number; height: number; margin: number };
    /** Allowed scale denominators, the first one that fits the sheet is used (1:10, 1:20, ...). */
    scales: number[];
    /** Styles per part class. Classes are defined by the content (classifyPart); 'wall' is used for walls. */
    styles: Record<string, ClassStyle>;
    /** Style of parts without a class or with a class missing in `styles`. */
    defaultStyle: ClassStyle;
    /** Paint faces underneath the lines (light shading). */
    fills: boolean;
    views: {
        top: boolean;
        elevations: boolean;
        rearElevations: boolean;
        /** A wall side gets an elevation when a (non-generated) module is closer than this to its face [mm]. */
        maxDistanceFromWall: number;
    };
    text: { fontFamily: string; titleHeight: number };
    /** Layout of the content annotations (dimensions, overlays). */
    annotations: {
        /**
         * Height of the dimension texts on paper [mm]. All other annotation sizes keep the proportions of the
         * original design, in units of textHeight / 24: line spacing 40, margins 20, tick length 25, ...
         */
        textHeight: number;
        /** Distance of the annotation lines [textHeight / 24 units]. */
        lineSpacing: number;
        /** Space before the first and after the last annotation line [textHeight / 24 units]. */
        baseMargin: number;
        finalMargin: number;
        /** Which annotations leave the annotation lines and are drawn at their position instead. */
        disqualify: 'onlyNonperpendicular' | 'looseIntervals' | 'withSingleInterval';
        /** Annotations and overlays with one of these tags are not drawn. */
        excludeTags: string[];
    };
    /** Edges between faces meeting under a smaller angle are not drawn (smooth arcs) [degrees]. */
    smoothAngle: number;
    /** Geometric tolerances [mm]. */
    tolerance: { depth: number; boundary: number };
}

export const defaultSettings: DrawingSettings = {
    paper: { width: 420, height: 297, margin: 10 },
    scales: [10, 20, 25, 50, 100, 200],
    styles: {
        wall: { lineWidth: 0.5, fill: '#d9d9d9', pattern: 'solid', hiddenLines: 'none' },
    },
    defaultStyle: { lineWidth: 0.25, fill: '#ffffff', pattern: 'solid', hiddenLines: 'none' },
    fills: true,
    views: { top: true, elevations: true, rearElevations: true, maxDistanceFromWall: 300 },
    text: { fontFamily: 'Arial, Helvetica, sans-serif', titleHeight: 3.5 },
    annotations: { textHeight: 2.5, lineSpacing: 40, baseMargin: 20, finalMargin: 20, disqualify: 'withSingleInterval', excludeTags: ['inside'] },
    smoothAngle: 10,
    tolerance: { depth: 0.5, boundary: 0.05 },
};

export type SettingsOverrides = {
    [K in keyof DrawingSettings]?: DrawingSettings[K] extends unknown[] ? DrawingSettings[K]
    : DrawingSettings[K] extends object ? Partial<DrawingSettings[K]> : DrawingSettings[K];
};

/** Defaults + overrides (one level deep; `styles` entries are merged per class). */
export function resolveSettings(overrides: SettingsOverrides = {}): DrawingSettings {
    const merged = { ...defaultSettings } as Record<string, unknown>;
    for (const [key, value] of Object.entries(overrides)) {
        const base = (defaultSettings as unknown as Record<string, unknown>)[key];
        merged[key] = value && typeof value === 'object' && !Array.isArray(value) && base && typeof base === 'object'
            ? { ...base, ...value }
            : value;
    }
    return merged as unknown as DrawingSettings;
}

export const styleOf = (settings: DrawingSettings, cls: string | undefined): ClassStyle =>
    (cls !== undefined ? settings.styles[cls] : undefined) ?? settings.defaultStyle;
