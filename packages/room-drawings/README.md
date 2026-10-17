# room-drawings

Vector drawings of a furnished room — a top view and an elevation per wall side — made from the order data.
Built for the server: no DOM, no WebGL, no runtime dependencies. The output is a set of SVG sheets at true
scale plus a `Drawings.html` preview page.

## Who does what

| Content side (order output script) | This package |
|---|---|
| **What** is drawn: which parts, their style class, which modules own the generated parts (later also dimensions and symbols) | **How**: scene, views, hidden-line rendering, layout at true scale, output files |
| May use the library's global functions | Uses **no** library content: no module ids, part names, tables or global functions |

## Usage in an order output

```ts
const drawings = RoomDrawings.createRoomDrawings({ order: o, groups: ol }, {
    content: {
        includeNode: ctx => GlobalFunc.drawing_IncludeNode(ctx),      // e.g. skip drillings
        classifyPart: ctx => GlobalFunc.drawing_PartClass(ctx),       // 'front' | 'carcass' | 'worktop' | ...
        ownerIds: ctx => ctx.data?.mod_ContourOwnerIds,               // generated parts follow their owners
    },
    settings: {
        paper: { width: 420, height: 297, margin: 10 },               // A3 landscape
        styles: { front: { lineWidth: 0.35, fill: '#f5f5f5', pattern: 'solid', hiddenLines: 'none' } },
    },
    logger: { error: logError, warning: logWarning },
});
drawings.files.forEach(f => this.createFileEntry(result, f.fileName, f.content, f.contentType));
```

`examples/content.ts` is a working example of the content callbacks and styles.

## Settings

Everything about the look is in `DrawingSettings` (`src/settings.ts`); pass only what differs from `defaultSettings`.

- **`paper`** — sheet size and margin [mm].
- **`scales`** — allowed scale denominators; the first that fits is used.
- **`styles[class]`** — line width on paper [mm], fill, line pattern, hidden lines (none or dashed).
- **`fills`** — shade faces underneath the lines.
- **`views`** — top view, elevations, rear elevations, and the maximum distance of a module from a wall for that wall to get an elevation.
- **`text`** — font and title height.
- **`smoothAngle`**, **`tolerance`** — geometric tuning.

## How it works

1. **Scene** (`src/scene`) — walls from the room contours, position groups, modules and parts, as the order data describes them. Children of generation modules (countertops, toekicks, legs, …) are moved to the position group and remember their generation module.
2. **Solids** (`src/geometry`) — boxes, extruded SVG profiles (arcs, holes) and walls. 3D models are drawn by their bounding box.
3. **Views** (`src/views.ts`):
   - the top view shows everything;
   - an elevation is made for each wall side that has a regular module close to it. It shows those modules and the generated modules owned by them; generated modules without owner ids fall back to the wall distance.
4. **Hidden-line removal** (`src/render/hlr.ts`) — every edge is split where it crosses the outline of a face in front of it, and each piece is visible unless a face covers it closer to the viewer. The lines are exact, not painted over; collinear duplicates are merged (`render/lines.ts`).
5. **Sheet** (`src/render/svg.ts`) — SVG with the viewBox in room millimeters and the sheet size in paper millimeters, i.e. true scale.

## Development

Requires Node ≥ 22.18. Sources use erasable TypeScript only, so Node runs tests and scripts directly.

```sh
npm install                      # dev dependencies: typescript, @types/node
npm test                         # unit tests + regression suite
npm run typecheck
npm run build                    # dist/ (ESM + .d.ts)
npm run test:update-golden       # after an intended change: review, then rewrite the golden files
node scripts/preview.ts <scene file> <out dir>             # render a scene to SVGs + Drawings.html
node scripts/make-fixture.ts <dev_serialized_scene.json> test/fixtures/<name>.scene.json.gz
```

**Regression suite.**
- `test/fixtures` holds gzipped scene snapshots of real orders, converted from the `dev_serialized_scene.json` the product writes with `output_DrawingsPlanDEV`.
- `test/golden` holds the approved drawings of those orders.

**Snapshots.** `sceneToSnapshot` / `sceneFromSnapshot` store a scene as compact JSON, useful for reproducing an issue outside the host.

## Status

- **Done:**
  - package, scene from order data (same result as tc-drawings-three's scene builder, checked node by node);
  - vector renderer with hidden-line removal;
  - views, true-scale sheets, HTML preview;
  - regression suite over 10 orders.
- **Next:**
  - dimension engine (content requests dimensions, the API lays them out for legibility);
  - symbols and conventions;
  - title block and legend;
  - outlines of 3D models;
  - content documentation;
  - the new output method in the library.
