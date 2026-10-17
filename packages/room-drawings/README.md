# room-drawings

Vector drawings of a furnished room — a top view and an elevation per wall side — made from the order data.
Built for the server: no DOM, no WebGL, no runtime dependencies. The output is a set of SVG sheets at true
scale — an overview sheet with all views, then one sheet per view, each with a frame and title block — plus a
`Drawings.html` preview page.

## Who does what

| Content side (order output script) | This package |
|---|---|
| **What** is drawn and annotated: the annotation tables (`tab_Annotations`, `tab_AnnotationLayerSettings`, unchanged), which parts, their style class, which modules own the generated parts | **How**: scene, views, hidden-line rendering, annotation layout for legibility, scale, output files |
| May use the library's global functions | Uses **no** library content: no module ids, part names, tables or global functions |

## Usage in an order output

The order output imports the package (the only import it needs) and passes the order data and the content:

```ts
import * as RoomDrawings from 'room-drawings';

const drawings = RoomDrawings.createRoomDrawings({ order: o, groups: ol }, {
    content: {
        annotationsOf: filterAnnotationForModule,                     // the content data, as written today
        annotationLayerSettings: tab_AnnotationLayerSettings,         // (or annotations: tab_Annotations)
        includeNode: ctx => GlobalFunc.drawing_IncludeNode(ctx),      // e.g. skip drillings
        classifyPart: ctx => GlobalFunc.drawing_PartClass(ctx),       // 'front' | 'carcass' | 'worktop' | ...
        ownerIds: ctx => ctx.data?.mod_ContourOwnerIds,               // generated parts follow their owners
        titleBlock: [{ label: 'Order', value: String(o.orderNo) }, { label: 'Date', value: today }],
    },
    settings: {
        paper: { width: 420, height: 297, margin: 10 },               // A3 landscape
        styles: { front: { lineWidth: 0.35, fill: '#f5f5f5', pattern: 'solid', hiddenLines: 'none' } },
    },
    logger: { error: logError, warning: logWarning },
});
drawings.files.forEach(f => this.createFileEntry(result, f.fileName, f.content, f.contentType));
```

`examples/content.ts` is a working example of the content callbacks and styles; `examples/annotationstable.ts`
is the current annotation table, unchanged apart from its imports.

**In cabinetlibrary_drawings** the order output `output_RoomDrawings` (branch `v2-room-drawings`) runs next to
`output_DrawingsPlanDEV`. It writes the SVG sheets, `Drawings.html` and `dev_room_drawings_scene.json` (a scene
snapshot; `node scripts/make-fixture.ts` is not needed for it, `readScene` reads it directly). For local
development the library links this folder (`"room-drawings": "link:../tc-drawings-three/packages/room-drawings"`);
run `npm run build` here after a change.

## Content data

The package takes the drawing content data in the format content developers write today
(`src/annotations/types.ts`, exported from the package with the same names):

- **`tab_Annotations`** (`I_tab_Annotation[]`, option `annotations`; or option `annotationsOf`, a lookup with the
  signature of `filterAnnotationForModule`) — per module id (`in_ModuleId`, comma-separated ids allowed) and an
  optional `in_Condition(data, drawing)`:
  - `out_Annotations` — dimension intervals (`Annotation`: points, layer, label, tags, …);
  - `out_SvgPathOverlays` — SVG path overlays (`SvgPathInjectionData`), e.g. the wall-unit cross or the countertop outline in the top view;
  - `out_AnnotablePoints` — extra points the dimension lines may snap to (`AnnotablePoint`).

  All functions get the module's order entry and the drawing (`IPlanSvgDrawing`: `drawingDirection` `'top'` or
  `'elevation'`, view name) and return coordinates in module space; the package transforms them into the view.
  Tables typed against the former drawing API's interfaces are accepted as they are; their functions only get
  these two fields.
- **`tab_AnnotationLayerSettings`** (`I_tab_AnnotationLayerSettings[]`) — per layer: line order, filling gaps, distances
  to the wall corners.

The layout is a port of the tc-drawings-three annotation engine. Given the same content data it prints the
same dimensions as the product export (`test/annotations.test.ts`). The scale is the largest one in `settings.scales`
at which the drawing and its dimension lines fit the sheet.

## Settings

Everything about the look is in `DrawingSettings` (`src/settings.ts`); pass only what differs from `defaultSettings`.

- **`paper`** — sheet size and margin [mm].
- **`scales`** — allowed scale denominators; the first that fits is used.
- **`styles[class]`** — line width on paper [mm], fill, line pattern, hidden lines (none or dashed). Walls use `wall` in the top view (cut walls) and `wall-elevation` behind an elevation.
- **`fills`** — shade faces underneath the lines.
- **`views`** — top view, elevations, rear elevations, and the maximum distance of a module from a wall for that wall to get an elevation.
- **`text`** — font and title height.
- **`sheet`** — frame, padding, title block height, the overview sheet (on/off, gap between views, caption height), elevation markers in the top view (on/off, radius).
- **`annotations`** — text height on paper [mm] (sets the size of the whole annotation layout), spacing of the dimension lines, margins, which single-interval lines are dropped (`disqualify`), and annotation tags that are skipped (`excludeTags`, default `inside`).
- **`smoothAngle`**, **`tolerance`** — geometric tuning.

## How it works

1. **Scene** (`src/scene`) — walls from the room contours, position groups, modules and parts, as the order data describes them. Children of generation modules (countertops, toekicks, legs, …) are moved to the position group and remember their generation module.
2. **Solids** (`src/geometry`) — boxes, extruded SVG profiles (arcs, holes) and walls. 3D models are drawn by their bounding box.
3. **Views** (`src/views.ts`):
   - the top view shows everything;
   - an elevation is made for each wall side that has a regular module close to it. It shows those modules and the generated modules owned by them; generated modules without owner ids fall back to the wall distance.
4. **Hidden-line removal** (`src/render/hlr.ts`) — every edge is split where it crosses the outline of a face in front of it, and each piece is visible unless a face covers it closer to the viewer. The lines are exact, not painted over; collinear duplicates are merged (`render/lines.ts`).
5. **Annotations** (`src/annotations`) — the content tables are evaluated for each module in the view; points are projected into the view; the wall corners are added as snap points. The dimension lines are laid out per scale until everything fits; the result is a string-built SVG group (no DOM).
6. **Sheets** (`src/render/svg.ts`) — SVG in paper millimeters; each view is a group in room millimeters scaled by 1/scale, i.e. true scale, with the annotation group on top.
   - one sheet per view, at the largest scale in `settings.scales` where the view and its dimension lines fit;
   - an overview sheet with all views packed in rows, at the largest common scale where they fit;
   - elevations are lettered A, B, C, …; the top view shows a marker per elevation (letter, view direction) at the middle of its wall, in front of the furniture standing there;
   - frame and title block: view title, the content's `titleBlock` fields, scale, sheet n / N.

## Development

Requires Node ≥ 22.18. Sources use erasable TypeScript only, so Node runs tests and scripts directly.

```sh
npm install                      # dev dependencies: typescript, @types/node
npm test                         # unit tests, annotation parity, regression suite
npm run typecheck
npm run build                    # dist/ (ESM + .d.ts)
npm run test:update-golden       # after an intended change: review, then rewrite the golden files
node scripts/preview.ts <scene file> <out dir>             # render a scene to SVGs + Drawings.html
node scripts/make-fixture.ts <dev_serialized_scene.json> test/fixtures/<name>.scene.json.gz
```

**Regression suite.**
- `test/fixtures` holds gzipped scene snapshots of real orders, converted from the `dev_serialized_scene.json` the product writes with `output_DrawingsPlanDEV`.
- `test/golden` holds the approved drawings of those orders.
- `test/fixtures/product-dimensions.json` holds the dimension texts of each view of the product export; `test/annotations.test.ts` checks the package prints the same.

**Snapshots.** `sceneToSnapshot` / `sceneFromSnapshot` store a scene as compact JSON, useful for reproducing an issue outside the host.

## Status

- **Done:**
  - package, scene from order data (same result as tc-drawings-three's scene builder, checked node by node);
  - vector renderer with hidden-line removal;
  - views, true-scale sheets with frame and title block, overview sheet, elevation markers, HTML preview;
  - annotations from the unchanged content data (same dimensions as the product export);
  - output method `output_RoomDrawings` in cabinetlibrary_drawings (same files as the golden files, 0.1–0.3 s per order);
  - regression suite over 10 orders.
- **Next:**
  - legend;
  - outlines of 3D models;
  - content documentation.
