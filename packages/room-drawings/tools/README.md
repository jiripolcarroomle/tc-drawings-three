# tools

Viewing and review helpers used while developing the package. They are not part of the package and are not
needed by its tests. The `.mjs` scripts drive a local Google Chrome through `playwright-core`
(`npm install` in this folder; set `CHROME_PATH` if Chrome is elsewhere).

| Script | What it does |
|---|---|
| `cl_run.mjs` | Drives the cabinetlibrary_drawings product (`npx vite --port 4200` there): selects a test order, runs an order output (`OUTPUT=output_RoomDrawings`), saves and unzips the result, screenshots the SVGs, logs library errors and 3D model requests. An optional test-orders JSON replaces the product's test orders (variants). |
| `render-review.ts` | Renders all fixtures with both elevation groupings (`walls`, `runs`) for a review (plain Node, no Chrome). |
| `build_sheets_pdf.mjs` | Review PDFs: every sheet at true A3 size, and old output (`output_DrawingsPlanDEV` export) vs new per view. |
| `svg2png.mjs` | PNG next to every SVG of the given folders. |
| `svgcrop.mjs` | High-resolution PNG of a region of a sheet (fractions of the sheet). |
| `bbox.mjs` | Bounding box of the drawn views on each sheet, in sheet millimetres (for cropping). |
| `shot.mjs` | Full-page screenshot of a local HTML page at a given width. |

Review of 2026-10-19 (all orders, both groupings):

```sh
node tools/render-review.ts /tmp/review
cd tools && node build_sheets_pdf.mjs /tmp/review/walls <old export dir> ~/Downloads/review
```
