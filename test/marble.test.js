import test from 'node:test';
import assert from 'node:assert/strict';
import { forward, inverse, sourceAt, carry, falloff, tineOffsets } from '../src/marble.js';

const OPS = {
  drop: { type: 'drop', x: 500, y: 500, r: 120, color: '#c0392b' },
  rake: { type: 'rake', x: 400, y: 300, angle: 30, z: 80, half: 25, tines: 5, spacing: 60 },
  swirl: { type: 'swirl', x: 520, y: 480, R: 200, z: 150, half: 60 },
  wave: { type: 'wave', x: 0, y: 0, angle: -20, A: 40, L: 180, phase: 15 },
};

function samplePoints(n, seed = 1) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push([rand() * 1000, rand() * 1000]);
  return pts;
}

// Determinant of the Jacobian of the forward map by central differences.
function jacobianDet(op, x, y, h = 1e-3) {
  const [ax, ay] = forward(op, x + h, y);
  const [bx, by] = forward(op, x - h, y);
  const [cx, cy] = forward(op, x, y + h);
  const [dx, dy] = forward(op, x, y - h);
  const j11 = (ax - bx) / (2 * h);
  const j21 = (ay - by) / (2 * h);
  const j12 = (cx - dx) / (2 * h);
  const j22 = (cy - dy) / (2 * h);
  return j11 * j22 - j12 * j21;
}

test('falloff halves every half-distance on either side', () => {
  assert.equal(falloff(0, 10), 1);
  assert.ok(Math.abs(falloff(10, 10) - 0.5) < 1e-12);
  assert.ok(Math.abs(falloff(-20, 10) - 0.25) < 1e-12);
});

test('tine offsets are centred on the rake line', () => {
  assert.deepEqual(tineOffsets(1, 50), [0]);
  assert.deepEqual(tineOffsets(4, 10), [-15, -5, 5, 15]);
});

for (const [name, op] of Object.entries(OPS)) {
  test(`${name}: inverse undoes forward`, () => {
    for (const [x, y] of samplePoints(200)) {
      const [fx, fy] = forward(op, x, y);
      const back = inverse(op, fx, fy);
      assert.ok(back, `inverse lost (${x}, ${y})`);
      assert.ok(Math.hypot(back[0] - x, back[1] - y) < 1e-7, `${name} round trip off at (${x}, ${y})`);
    }
  });

  test(`${name}: preserves area everywhere outside new ink`, () => {
    for (const [x, y] of samplePoints(200, 7)) {
      if (op.type === 'drop' && Math.hypot(x - op.x, y - op.y) < 1) continue;
      const det = jacobianDet(op, x, y);
      assert.ok(Math.abs(det - 1) < 1e-5, `${name} Jacobian ${det} at (${x}, ${y})`);
    }
  });
}

test('drop pushes old ink out so the ring holds the drop area', () => {
  const op = OPS.drop;
  for (const d of [1, 50, 300]) {
    const [x] = forward(op, op.x + d, op.y);
    assert.ok(Math.abs((x - op.x) ** 2 - (d * d + op.r * op.r)) < 1e-6);
  }
});

test('drop inverse reports points inside the new drop', () => {
  const op = OPS.drop;
  assert.equal(inverse(op, op.x, op.y), null);
  assert.equal(inverse(op, op.x + op.r * 0.99, op.y), null);
  assert.ok(inverse(op, op.x + op.r * 1.01, op.y));
});

test('rake moves points on a tine by the full stroke and far points barely', () => {
  const op = { type: 'rake', x: 0, y: 500, angle: 0, z: 100, half: 10, tines: 1, spacing: 0 };
  assert.deepEqual(forward(op, 200, 500), [300, 500]);
  const [fx, fy] = forward(op, 200, 700);
  assert.ok(fx - 200 < 1e-3 && fy === 700);
});

test('swirl turns points on its circle by the stroke length', () => {
  const op = { type: 'swirl', x: 0, y: 0, R: 100, z: 50, half: 20 };
  const [x, y] = forward(op, 100, 0);
  assert.ok(Math.abs(Math.hypot(x, y) - 100) < 1e-9);
  assert.ok(Math.abs(Math.atan2(y, x) * 100 - 50) < 1e-9);
  assert.deepEqual(forward(op, 0, 0), [0, 0]);
});

test('sourceAt follows ink back to the drop that laid it', () => {
  const ops = [
    { type: 'drop', x: 300, y: 500, r: 100, color: '#111111' },
    { type: 'drop', x: 700, y: 500, r: 100, color: '#222222' },
    { type: 'rake', x: 0, y: 500, angle: 90, z: 150, half: 30, tines: 1, spacing: 0 },
  ];
  assert.equal(sourceAt(ops, 50, 50), -1);
  // the centre of the first drop has been pushed out by the second drop
  // and then pulled along the rake
  const [cx, cy] = carry(ops, 300, 500, 1);
  assert.equal(sourceAt(ops, cx, cy), 0);
  const [dx, dy] = carry(ops, 700, 500, 2);
  assert.equal(sourceAt(ops, dx, dy), 1);
});

test('unknown operations are rejected', () => {
  assert.throws(() => forward({ type: 'spill' }, 0, 0));
  assert.throws(() => inverse({ type: 'spill' }, 0, 0));
});
