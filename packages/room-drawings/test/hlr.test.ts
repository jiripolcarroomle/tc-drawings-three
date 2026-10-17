import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vec3 } from '../src/math.ts';
import { boxSolid } from '../src/geometry/solids.ts';
import { hiddenLineRender, viewBasis } from '../src/render/hlr.ts';
import { mergeSegments } from '../src/render/lines.ts';
import { createNode, NodeKind } from '../src/scene/scene.ts';

const options = { depthTolerance: 0.5, boundaryTolerance: 0.05 };
const box = (id: string, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const node = createNode(NodeKind.Part, id);
    return boxSolid(node, node.world, vec3(x, y, z), vec3(sx, sy, sz));
};
const totalLength = (segments: { x1: number; y1: number; x2: number; y2: number }[]) => segments.reduce((sum, s) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);
// looking along -z: viewer at +z
const front = viewBasis(vec3(0, 0, -1));

test('a single box seen from the front shows its 4 outline edges', () => {
    const r = hiddenLineRender([box('a', 0, 0, 0, 100, 50, 30)], ['x'], [false], front, options);
    assert.equal(r.faces.length, 1);
    assert.ok(Math.abs(totalLength(mergeSegments(r.visible, () => 1)) - 300) < 1e-6);
});

test('a box in front hides the covered part of the box behind; hidden pieces are reported on request', () => {
    const back = box('back', 0, 0, 0, 100, 100, 10);
    const near = box('near', 25, 25, 50, 50, 50, 10);
    const r = hiddenLineRender([back, near], ['back', 'near'], [true, false], front, options);
    const visibleBack = mergeSegments(r.visible.filter(s => s.cls === 'back'), () => 1);
    const visibleNear = mergeSegments(r.visible.filter(s => s.cls === 'near'), () => 1);
    assert.ok(Math.abs(totalLength(visibleBack) - 400) < 1e-6, 'outline of the back box is not covered');
    assert.ok(Math.abs(totalLength(visibleNear) - 200) < 1e-6);
    assert.equal(r.hidden.length, 0, 'nothing of the back box is behind the near box outline');

    // now the near box covers an edge of the back box
    const covering = box('cover', -10, 40, 50, 30, 20, 10);
    const r2 = hiddenLineRender([back, covering], ['back', 'cover'], [true, false], front, options);
    const hidden = mergeSegments(r2.hidden, () => 1);
    assert.equal(hidden.length, 1);
    assert.ok(Math.abs(totalLength(hidden) - 20) < 1e-6, 'the 20 mm of the left edge behind the covering box');
});

test('flush neighbours do not hide each other and their shared edge is drawn once', () => {
    const left = box('left', 0, 0, 0, 50, 50, 50);
    const right = box('right', 50, 0, 0, 50, 50, 50);
    const r = hiddenLineRender([left, right], ['p', 'p'], [false, false], front, options);
    const merged = mergeSegments(r.visible, () => 1);
    assert.ok(Math.abs(totalLength(merged) - (100 + 100 + 50 + 50 + 50)) < 1e-6);
});
