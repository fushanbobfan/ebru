import test from 'node:test';
import assert from 'node:assert/strict';
import { opFromDrag, swirlFromPath, opFromKey, clampToTray, TOOLS } from '../src/tools.js';
import { forward } from '../src/marble.js';

const S = { size: 50, color: '#123456', sharp: 14, spacing: 80, amp: 30, dir: 0 };

test('a click with the drop tool floats a drop of the chosen size', () => {
  assert.deepEqual(opFromDrag('drop', [100, 200], [101, 200], S), {
    type: 'drop', x: 100, y: 200, r: 50, color: '#123456',
  });
});

test('dragging the drop tool sizes the drop by hand', () => {
  assert.equal(opFromDrag('drop', [100, 200], [130, 240], S).r, 50);
  assert.equal(opFromDrag('drop', [100, 200], [100, 290], S).r, 90);
});

test('stylus moves ink under its start point to its end point', () => {
  const op = opFromDrag('stylus', [300, 300], [300, 450], S);
  assert.equal(op.tines, 1);
  const [x, y] = forward(op, 300, 300);
  assert.ok(Math.abs(x - 300) < 1e-9 && Math.abs(y - 450) < 1e-9);
});

test('comb passes a tine through its start point', () => {
  const op = opFromDrag('comb', [333, 120], [333, 200], S);
  assert.ok(op.tines > 10);
  const [x, y] = forward(op, 333, 120);
  assert.ok(Math.abs(x - 333) < 1e-9);
  assert.ok(y - 120 >= 80);
});

test('short drags with stroke tools do nothing', () => {
  for (const tool of ['stylus', 'comb', 'wave']) assert.equal(opFromDrag(tool, [10, 10], [11, 11], S), null);
});

test('wave length follows the drag', () => {
  const op = opFromDrag('wave', [0, 0], [0, 200], S);
  assert.equal(op.L, 200);
  assert.equal(op.angle, 90);
  assert.equal(op.A, 30);
});

test('swirl follows the swept angle and the circle drawn', () => {
  const path = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI;
    path.push([500 + 100 * Math.cos(a), 500 + 100 * Math.sin(a)]);
  }
  const op = swirlFromPath([500, 500], path, S);
  assert.equal(op.R, 100);
  assert.ok(Math.abs(op.z - 100 * Math.PI) < 0.1);
  const back = swirlFromPath([500, 500], [...path].reverse(), S);
  assert.ok(back.z < 0);
});

test('swirl ignores jitter around the centre and paths that do not turn', () => {
  assert.equal(swirlFromPath([0, 0], [[1, 1], [2, 0]], S), null);
  assert.equal(swirlFromPath([0, 0], [[10, 0], [20, 0], [30, 0]], S), null);
});

test('swirl copes with crossing the angle seam', () => {
  const path = [[-100, 1], [-100, -1], [-100, -3]];
  const op = swirlFromPath([0, 0], path, S);
  assert.ok(Math.abs(op.z) < 10);
});

test('keyboard gives every tool an operation at the cursor', () => {
  for (const tool of Object.keys(TOOLS)) {
    const op = opFromKey(tool, [400, 400], { ...S, dir: 90 });
    assert.ok(op, tool);
    assert.equal(op.x, 400);
  }
  assert.equal(opFromKey('stylus', [400, 400], { ...S, dir: 90 }).angle, 90);
});

test('clampToTray keeps points on the tray', () => {
  assert.deepEqual(clampToTray([-5, 1200]), [0, 1000]);
});
