import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holeFlags, parseSvgPathRings, signedArea } from '../src/geometry/svg-path.ts';

test('outline with an unclosed subpath and a rounded cut-out (countertop with sink)', () => {
    const svg = '<svg><path d="M-20 0 H1876 V574 L0 574 L-20 554 M 106.75 524 H 1056.75 A 15 15 0 0 0 1071.75 509 V 49 A 15 15 0 0 0 1056.75 34 H 106.75 A 15 15 0 0 0 91.75 49 V 509 A 15 15 0 0 0 106.75 524 Z"></path></svg>';
    const rings = parseSvgPathRings(svg);
    assert.equal(rings.length, 2);
    assert.deepEqual(holeFlags(rings), [false, true]);
    // area of the cut-out: rectangle minus the four corners lost to the r=15 arcs
    const cutout = Math.abs(signedArea(rings[1]));
    const expected = 980 * 490 - (4 - Math.PI) * 15 * 15;
    assert.ok(Math.abs(cutout - expected) < 15, `${cutout} vs ${expected}`);
    // arc points stay on the radius around the corner center (1056.75, 509)
    for (const p of rings[1].filter(p => p.x > 1056.75 && p.y > 509)) {
        assert.ok(Math.abs(Math.hypot(p.x - 1056.75, p.y - 509) - 15) < 1e-6);
    }
});

test('relative commands', () => {
    const [ring] = parseSvgPathRings('<path d="m 10 10 h 100 v 50 h -100 z"/>');
    assert.deepEqual(ring, [{ x: 10, y: 10 }, { x: 110, y: 10 }, { x: 110, y: 60 }, { x: 10, y: 60 }]);
});
