import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDENTITY, invert, multiply, rotationYTranslation, transformDirection, transformPoint, vec3 } from '../src/math.ts';

const close = (a: readonly number[], b: readonly number[], eps = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < eps);

test('invert(m) * m is the identity', () => {
    const m = multiply(rotationYTranslation(33, vec3(100, 20, -400)), rotationYTranslation(-90, vec3(5, 0, 7)));
    assert.ok(close(multiply(invert(m), m), IDENTITY));
    assert.ok(close(multiply(m, invert(m)), IDENTITY));
});

test('rotationYTranslation matches the order data convention (degrees, +90 turns +x into -z)', () => {
    const m = rotationYTranslation(90, vec3(10, 0, 0));
    const p = transformPoint(m, vec3(1, 0, 0));
    assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.z + 1) < 1e-9);
    const d = transformDirection(m, vec3(0, 0, 1));
    assert.ok(Math.abs(d.x - 1) < 1e-9);
});
