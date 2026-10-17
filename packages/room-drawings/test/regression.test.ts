// Regression suite: every scene in test/fixtures (product exports of real orders) is rendered with the example
// content and compared to test/golden/<fixture>/. After an intended change, review the new drawings and
// rewrite the golden files with `npm run test:update-golden`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRoomDrawingsFromScene } from '../src/index.ts';
import { exampleContentFor, exampleSettings } from '../examples/content.ts';
import { readScene } from '../scripts/files.ts';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const GOLDEN = path.join(import.meta.dirname, 'golden');
const update = process.env.UPDATE_GOLDEN === '1';

for (const fixture of fs.readdirSync(FIXTURES).filter(f => f.endsWith('.scene.json.gz')).sort()) {
    const name = fixture.replace('.scene.json.gz', '');
    test(`drawings of ${name}`, () => {
        const result = createRoomDrawingsFromScene(readScene(path.join(FIXTURES, fixture)), { content: exampleContentFor(name), settings: exampleSettings });

        assert.ok(result.views.some(v => v.name === 'topview'), 'has a top view');
        assert.ok(result.views.length < 2 || result.files[0]?.fileName === 'overview.svg', 'overview sheet first');
        for (const view of result.views) {
            assert.ok(view.stats.solids > 0 && view.stats.lines > 0, `${view.name} is not empty`);
            assert.ok(!/NaN|Infinity/.test(view.svg), `${view.name} has only finite coordinates`);
        }

        const dir = path.join(GOLDEN, name);
        if (update) {
            fs.rmSync(dir, { recursive: true, force: true });
            fs.mkdirSync(dir, { recursive: true });
            for (const file of result.files) fs.writeFileSync(path.join(dir, file.fileName), file.content);
            return;
        }
        assert.ok(fs.existsSync(dir), `golden files of ${name} exist (run npm run test:update-golden)`);
        assert.deepEqual(result.files.map(f => f.fileName).sort(), fs.readdirSync(dir).sort(), 'same files');
        for (const file of result.files) {
            assert.ok(file.content === fs.readFileSync(path.join(dir, file.fileName), 'utf8'), `${name}/${file.fileName} is unchanged`);
        }
    });
}
