// Annotation parity: the same content data (tab_Annotations, tab_AnnotationLayerSettings) gives the same
// dimension texts per view as the tc-drawings-three product export (test/fixtures/product-dimensions.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRoomDrawingsFromScene } from '../src/index.ts';
import { exampleContent, exampleSettings } from '../examples/content.ts';
import { readScene } from '../scripts/files.ts';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const reference: { orders: Record<string, Record<string, string[]>> } = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'product-dimensions.json'), 'utf8'));

const dimensionTexts = (svg: string) => [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map(match => match[1]!.trim())
    .filter(text => /^-?\d+$/.test(text))
    .sort((a, b) => Number(a) - Number(b));

for (const [order, views] of Object.entries(reference.orders)) {
    test(`dimensions of ${order} match the product export`, () => {
        const result = createRoomDrawingsFromScene(readScene(path.join(FIXTURES, `${order}.scene.json.gz`)), { content: exampleContent, settings: exampleSettings });
        assert.deepEqual(result.views.map(v => v.name).sort(), Object.keys(views).sort(), 'same views');
        for (const view of result.views) {
            assert.deepEqual(dimensionTexts(view.svg), views[view.name], `${order}/${view.name}`);
        }
    });
}
