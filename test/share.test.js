import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeOps, decodeOps, encodeState, decodeState, DEFAULT_STATE, MAX_OPS } from '../src/share.js';

const ADDED = [
  { type: 'drop', x: 120.5, y: 300, r: 42, color: '#a1b2c3' },
  { type: 'rake', x: 500, y: 500, angle: -90, z: 60, half: 12, tines: 9, spacing: 80 },
  { type: 'swirl', x: 400, y: 410.3, R: 150, z: -90, half: 40 },
  { type: 'wave', x: 0, y: 0, angle: 30, A: 25, L: 300, phase: 90 },
];

test('operations survive an encode and decode round trip', () => {
  assert.deepEqual(decodeOps(encodeOps(ADDED)), ADDED);
});

test('encoding is compact text', () => {
  assert.equal(encodeOps([ADDED[0]]), 'd120.5,300,42,a1b2c3');
});

test('broken items are skipped and the rest kept', () => {
  const text = `${encodeOps([ADDED[0]])};x1,2;d1,2;dfoo,1,2,ffffff;d1,2,3,zzzzzz;${encodeOps([ADDED[2]])}`;
  assert.deepEqual(decodeOps(text), [ADDED[0], ADDED[2]]);
});

test('out-of-range values are clamped', () => {
  const [op] = decodeOps('r0,0,0,99999,0,1000,0');
  assert.equal(op.z, 2000);
  assert.equal(op.half, 0.5);
  assert.equal(op.tines, 200);
});

test('decoding stops at the operation cap', () => {
  const text = Array.from({ length: MAX_OPS + 50 }, () => 'd1,1,1,000000').join(';');
  assert.equal(decodeOps(text).length, MAX_OPS);
});

test('state round trips through a query string', () => {
  const state = { pattern: 'hearts', seed: 99, palette: 'ember', added: ADDED };
  assert.deepEqual(decodeState(encodeState(state)), state);
  assert.deepEqual(decodeState(`#${encodeState(state)}`), state);
});

test('blank tray is a valid starting pattern', () => {
  assert.equal(decodeState('p=blank').pattern, 'blank');
});

test('unknown or missing values fall back to defaults', () => {
  assert.deepEqual(decodeState(''), DEFAULT_STATE);
  const s = decodeState('p=nope&seed=abc&ink=nope');
  assert.deepEqual(s, DEFAULT_STATE);
});
