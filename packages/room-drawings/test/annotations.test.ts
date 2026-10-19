// Annotation parity: the same content data (tab_Annotations, tab_AnnotationLayerSettings) gives the same
// dimension texts per view as the tc-drawings-three product export (test/fixtures/product-dimensions.json),
// with the original side rule of the annotation lines (annotations.sideSplit: 'lineAverage').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRoomDrawingsFromScene, type IPlanSvgDrawing } from '../src/index.ts';
import { exampleContent, exampleSettings } from '../examples/content.ts';
import { readScene } from '../scripts/files.ts';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const reference: { orders: Record<string, Record<string, string[]>> } = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'product-dimensions.json'), 'utf8'));

// numeric texts of the annotation group (the title block has numbers too)
const paritySettings = { ...exampleSettings, annotations: { sideSplit: 'lineAverage' as const } };

const dimensionTexts = (svg: string) => [...svg.slice(svg.indexOf('<g class="annotations"'), svg.indexOf('<g class="title-block"')).matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
    .map(match => match[1]!.trim())
    .filter(text => /^-?\d+$/.test(text))
    .sort((a, b) => Number(a) - Number(b));

for (const [order, views] of Object.entries(reference.orders)) {
    test(`dimensions of ${order} match the product export`, () => {
        const result = createRoomDrawingsFromScene(readScene(path.join(FIXTURES, `${order}.scene.json.gz`)), { content: exampleContent, settings: paritySettings });
        assert.deepEqual(result.views.map(v => v.name).sort(), Object.keys(views).sort(), 'same views');
        for (const view of result.views) {
            assert.deepEqual(dimensionTexts(view.svg), views[view.name], `${order}/${view.name}`);
        }
    });
}

test('annotationsOf (the content lookup, like filterAnnotationForModule) gives the same drawings as the table', () => {
    const scene = () => readScene(path.join(FIXTURES, '10000130.scene.json.gz'));
    const { annotations: table, ...rest } = exampleContent;
    const filterAnnotationForModule = (moduleId: string, m: any, drawingData: IPlanSvgDrawing) => table!.filter(entry =>
        entry.in_ModuleId.split(',').map(id => id.trim()).includes(moduleId) && (entry.in_Condition ? entry.in_Condition(m, drawingData) : true));
    const viaTable = createRoomDrawingsFromScene(scene(), { content: exampleContent, settings: exampleSettings });
    const viaLookup = createRoomDrawingsFromScene(scene(), { content: { ...rest, annotationsOf: filterAnnotationForModule }, settings: exampleSettings });
    assert.ok(viaTable.views.every(v => v.stats.annotations > 0), 'annotated');
    assert.deepEqual(viaLookup.files, viaTable.files);
});
