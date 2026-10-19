// Renders every fixture (product snapshots) with the example content, which matches the output script, once per
// elevation grouping: <out>/walls/<order>/ and, where the result differs, <out>/runs/<order>/.
// usage: node tools/render-review.ts <out dir> [date for the title block]
import fs from 'node:fs';
import path from 'node:path';
import { createRoomDrawingsFromScene, type RoomDrawingsResult } from '../src/index.ts';
import { exampleContent, exampleSettings } from '../examples/content.ts';
import { readScene } from '../scripts/files.ts';

const [out, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!out) {
    console.error('usage: node tools/render-review.ts <out dir> [date]');
    process.exit(1);
}
const NAMES: Record<string, string> = {
    '10000071': 'TestLW', '10000099': 'DKG', '10000108': 'Jiri Drawing Test', '10000108-baseboard-legs': 'Jiri Drawing Test, baseboard + legs',
    '10000113': 'Test Sr', '10000125': 'Hendrik Test', '10000128': 'orderManager order', '10000129': 'Jiri Drawing Test 2',
    '10000130': 'JP Drawing Test 3', '10000130-baseboard-legs': 'JP Drawing Test 3, baseboard + legs',
};
const fixtures = path.join(import.meta.dirname, '../test/fixtures');
for (const [name, title] of Object.entries(NAMES)) {
    const content = { ...exampleContent, titleBlock: [{ label: 'Order', value: name.split('-')[0]! }, { label: 'Description', value: title }, { label: 'Date', value: date }] };
    const results: Partial<Record<'walls' | 'runs', RoomDrawingsResult>> = {};
    for (const grouping of ['walls', 'runs'] as const) {
        const result = createRoomDrawingsFromScene(readScene(path.join(fixtures, `${name}.scene.json.gz`)), { content, settings: { ...exampleSettings, views: { grouping } } });
        results[grouping] = result;
        const dir = path.join(out, grouping, name);
        fs.mkdirSync(dir, { recursive: true });
        for (const f of result.files) fs.writeFileSync(path.join(dir, f.fileName), f.content);
    }
    const walls = results.walls!.files, runs = results.runs!.files;
    const same = walls.length === runs.length && walls.every((f, i) => f.fileName === runs[i]!.fileName && f.content === runs[i]!.content);
    if (same) fs.rmSync(path.join(out, 'runs', name), { recursive: true });
    console.log(name.padEnd(24), results.walls!.views.map(v => `${v.name} 1:${v.scale}`).join(', '), same ? '' : '| runs differ');
}
