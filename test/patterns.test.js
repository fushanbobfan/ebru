import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, PATTERNS, buildPattern, fullRake, rng } from '../src/patterns.js';
import { TRAY, forward } from '../src/marble.js';
import { render } from '../src/render.js';

test('rng is deterministic per seed and stays in [0, 1)', () => {
  const a = rng(42);
  const b = rng(42);
  const c = rng(43);
  const xs = Array.from({ length: 100 }, a);
  assert.deepEqual(xs, Array.from({ length: 100 }, b));
  assert.notDeepEqual(xs, Array.from({ length: 100 }, c));
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('palettes hold valid hex colours', () => {
  for (const p of Object.values(PALETTES)) {
    for (const c of [p.bath, ...p.inks]) assert.match(c, /^#[0-9a-f]{6}$/);
  }
});

test('full rake tines cover the whole tray', () => {
  for (const angle of [0, 45, 90, 135]) {
    const op = fullRake(angle, 50, 30, 8);
    for (const [x, y] of [[0, 0], [TRAY, 0], [0, TRAY], [TRAY, TRAY], [500, 500]]) {
      const [fx, fy] = forward(op, x, y);
      // every point of the tray lies within half a spacing of some tine
      assert.ok(Math.hypot(fx - x, fy - y) >= 30 * 2 ** (-25 / 8) - 1e-9);
    }
  }
});

test('shifted pass lands halfway between the tines of the first', () => {
  const a = fullRake(90, 80, 60, 10);
  const b = fullRake(270, 80, 60, 10, 40);
  // a point on a tine of the first pass moves fully on the first pass and
  // only slightly on the second
  const [x1] = [a.x];
  const moveA = forward(a, x1, 500)[1] - 500;
  const moveB = 500 - forward(b, x1, 500)[1];
  assert.ok(moveA > 59);
  assert.ok(moveB < 60 * 2 * 2 ** (-40 / 10) + 1);
});

for (const name of Object.keys(PATTERNS)) {
  test(`${name}: same seed builds the same valid operations`, () => {
    const ops = buildPattern(name, 7, 'istanbul');
    assert.deepEqual(ops, buildPattern(name, 7, 'istanbul'));
    assert.ok(ops.length > 0);
    for (const op of ops) {
      for (const [k, v] of Object.entries(op)) {
        if (k === 'type' || k === 'color') continue;
        assert.ok(Number.isFinite(v), `${name} ${op.type}.${k} = ${v}`);
      }
      if (op.type === 'drop') assert.ok(op.r > 0 && PALETTES.istanbul.inks.includes(op.color));
    }
  });

  test(`${name}: renders a small preview quickly`, () => {
    const ops = buildPattern(name, 7, 'indigo');
    const t0 = performance.now();
    const data = render(ops, { width: 120, height: 120, background: PALETTES.indigo.bath });
    const ms = performance.now() - t0;
    assert.ok(ms < 3000, `${name} took ${ms} ms`);
    // more than one colour shows up
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    assert.ok(seen.size > 2);
  });
}

test('unknown names fall back to stones and the default palette', () => {
  assert.deepEqual(buildPattern('nope', 3, 'nope'), buildPattern('battal', 3, 'istanbul'));
});
