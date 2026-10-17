import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildSceneFromOrder, NodeKind, sceneFromSnapshot, sceneToSnapshot, walk, type OrderInput, type OrderLineGroupInput, type SceneNode } from '../src/index.ts';
import { readFlattedOrder } from './helpers/flatted.ts';

const ASSETS = path.resolve(import.meta.dirname, '../../../assets');
const silent = { error: () => { }, warning: () => { } };

const nodesById = (root: SceneNode) => {
    const map = new Map<string, SceneNode>();
    walk(root, node => map.set(node.id, node));
    return map;
};

test('scene from the order data matches the tc-drawings-three scene of the same order (ids, hierarchy, world transforms)', () => {
    const order = readFlattedOrder<{ o: OrderInput; ol: OrderLineGroupInput[] }>(path.join(ASSETS, 'simpleorder.flatted.json'));
    const scene = buildSceneFromOrder(order.o, order.ol, silent);

    // reference: the scene tc-drawings-three built for this order (its dev serialization)
    interface RefNode { id: string; kind: string; _worldTransform: { elements: number[] }; children: RefNode[] }
    const reference = JSON.parse(fs.readFileSync(path.join(ASSETS, 'simpleorder.serializedscene.json'), 'utf8')) as RefNode;
    const references: RefNode[] = [];
    const collect = (node: RefNode) => { references.push(node); node.children.forEach(collect); };
    collect(reference);

    const ours = nodesById(scene.root);
    let compared = 0;
    for (const ref of references) {
        if (ref.kind === 'sceneRoot') continue;
        const node = ours.get(ref.id);
        assert.ok(node, `node ${ref.id} (${ref.kind}) exists`);
        assert.equal(node.kind, ref.kind);
        const refParent = references.find(r => r.children.includes(ref));
        if (refParent && refParent.kind !== 'sceneRoot') assert.equal(node.parent?.id, refParent.id, `parent of ${ref.id}`);
        node.world.forEach((value, i) => assert.ok(Math.abs(value - ref._worldTransform.elements[i]) < 1e-6, `world[${i}] of ${ref.id}: ${value} vs ${ref._worldTransform.elements[i]}`));
        compared++;
    }
    let count = 0;
    walk(scene.root, () => count++);
    assert.equal(count, references.length, 'same number of nodes');
    assert.ok(compared > 50, `compared ${compared} nodes`);
});

test('generation children are moved to the position group and remember their generation module', () => {
    const order = readFlattedOrder<{ o: OrderInput; ol: OrderLineGroupInput[] }>(path.join(ASSETS, 'cornersorder.flatted.json'));
    const scene = buildSceneFromOrder(order.o, order.ol, silent);
    const generated: SceneNode[] = [];
    walk(scene.root, node => { if (node.module?.generationModuleId) generated.push(node); });
    assert.ok(generated.length > 0);
    for (const node of generated) {
        assert.equal(node.parent?.kind, NodeKind.PosGroup);
        const generationModule = nodesById(scene.root).get(node.module!.generationModuleId!);
        assert.ok(generationModule?.module?.isGenerated);
        assert.equal(generationModule.children.length, 0, 'generation module is emptied');
    }
});

test('snapshot round trip keeps hierarchy, geometry and world transforms', () => {
    const order = readFlattedOrder<{ o: OrderInput; ol: OrderLineGroupInput[] }>(path.join(ASSETS, 'cornersorder.flatted.json'));
    const scene = buildSceneFromOrder(order.o, order.ol, silent);
    const copy = sceneFromSnapshot(JSON.parse(JSON.stringify(sceneToSnapshot(scene))));
    const original = nodesById(scene.root), restored = nodesById(copy.root);
    assert.equal(restored.size, original.size);
    for (const [id, node] of original) {
        const other = restored.get(id)!;
        assert.equal(other.parent?.id, node.parent?.id);
        assert.deepEqual(other.geometry, node.geometry);
        node.world.forEach((value, i) => assert.ok(Math.abs(value - other.world[i]) < 1e-9));
    }
});
