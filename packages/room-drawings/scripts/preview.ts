// Renders a scene file (snapshot or product dev export) to a folder: one SVG per view + Drawings.html.
// usage: node scripts/preview.ts <scene file> <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { createRoomDrawingsFromScene } from '../src/index.ts';
import { exampleContentFor, exampleSettings } from '../examples/content.ts';
import { readScene } from './files.ts';

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
    console.error('usage: node scripts/preview.ts <scene file> <out dir>');
    process.exit(1);
}
const start = performance.now();
const scene = readScene(file);
const loaded = performance.now();
const result = createRoomDrawingsFromScene(scene, { content: exampleContentFor(path.basename(file).split('.')[0]!), settings: exampleSettings });
const rendered = performance.now();
fs.mkdirSync(outDir, { recursive: true });
for (const f of result.files) fs.writeFileSync(path.join(outDir, f.fileName), f.content);
console.log(`${path.basename(file)}: load ${(loaded - start).toFixed(0)} ms, drawings ${(rendered - loaded).toFixed(0)} ms`);
for (const v of result.views) console.log(`  ${v.name}: 1:${v.scale}, ${v.stats.solids} solids, ${v.stats.lines} lines, ${(v.svg.length / 1024).toFixed(0)} KB`);
