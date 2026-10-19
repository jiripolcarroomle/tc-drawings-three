// Elevation grouping by runs (settings.views.grouping: 'runs').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { defineViews, placedModules, resolveSettings } from '../src/index.ts';
import { solidOf, type Solid } from '../src/geometry/solids.ts';
import { exampleContent } from '../examples/content.ts';
import { readScene } from '../scripts/files.ts';
import type { SceneNode } from '../src/scene/scene.ts';
import { walk } from '../src/scene/scene.ts';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');

function views(name: string, grouping: 'walls' | 'runs') {
    const scene = readScene(path.join(FIXTURES, `${name}.scene.json.gz`));
    const solids = new Map<SceneNode, Solid>();
    walk(scene.root, node => {
        const solid = solidOf(node, 10);
        if (solid) solids.set(node, solid);
    });
    const defined = defineViews(scene, solids, exampleContent, resolveSettings({ views: { grouping } }));
    // top level modules with geometry that are not generated (the cabinets)
    const cabinets = placedModules(scene).filter(m => !m.module?.generationModuleId && [...solids.keys()].some(n => n !== m && isWithin(n, m)));
    const shownIn = (view: (typeof defined)[number], module: SceneNode) => [...solids.keys()].some(n => isWithin(n, module) && view.shows(n));
    return { defined, cabinets, shownIn };
}

const isWithin = (node: SceneNode, ancestor: SceneNode) => {
    for (let current: SceneNode | null = node; current; current = current.parent) if (current === ancestor) return true;
    return false;
};

test('runs: the free leg of the U-kitchen gets an elevation of its fronts, the wall elevations stay', () => {
    const walls = views('10000129', 'walls').defined.map(v => v.name);
    const { defined, cabinets, shownIn } = views('10000129', 'runs');
    assert.deepEqual(defined.filter(v => v.name.startsWith('wall-')).map(v => v.name), walls.filter(n => n.startsWith('wall-')));
    const free = defined.filter(v => v.name.startsWith('run-'));
    assert.equal(free.length, 1);
    assert.ok(free[0]!.ground, 'free-standing elevation stands on a floor line');
    const inFree = cabinets.filter(m => shownIn(free[0]!, m));
    assert.equal(inFree.length, 2, 'the corner unit and the base unit of the leg');
    // with grouping by walls, the base unit of the leg is in no elevation at all (the corner unit only side-on)
    const byWalls = views('10000129', 'walls');
    const unseen = byWalls.cabinets.filter(m => !byWalls.defined.some(v => v.kind === 'elevation' && byWalls.shownIn(v, m)));
    assert.equal(unseen.length, 1);
    assert.ok(inFree.some(m => m.id === unseen[0]!.id), 'the runs show it');
});

test('runs: every cabinet of every order is in some elevation', () => {
    for (const file of fs.readdirSync(FIXTURES).filter(f => f.endsWith('.scene.json.gz'))) {
        const { defined, cabinets, shownIn } = views(file.replace('.scene.json.gz', ''), 'runs');
        const elevations = defined.filter(v => v.kind === 'elevation');
        const missing = cabinets.filter(m => !elevations.some(v => shownIn(v, m))).map(m => m.id);
        assert.deepEqual(missing, [], file);
    }
});

test('runs: kitchens at the walls get no extra elevation', () => {
    for (const name of ['10000071', '10000099', '10000108', '10000113', '10000125', '10000128', '10000130']) {
        const { defined } = views(name, 'runs');
        assert.deepEqual(defined.filter(v => v.name.startsWith('run-')).map(v => v.name), [], name);
        assert.ok(defined.every(v => v.kind === 'top' || v.wall), name);
    }
});
