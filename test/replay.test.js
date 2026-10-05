import test from 'node:test';
import assert from 'node:assert/strict';
import { partialOp, timeline, frameAt, DURATION } from '../src/replay.js';
import { coverage } from '../src/render.js';

const OPS = [
  { type: 'drop', x: 500, y: 500, r: 200, color: '#111111' },
  { type: 'drop', x: 520, y: 480, r: 80, color: '#222222' },
  { type: 'rake', x: 500, y: 500, angle: 90, z: 100, half: 20, tines: 3, spacing: 100 },
  { type: 'swirl', x: 500, y: 500, R: 150, z: 200, half: 40 },
  { type: 'wave', x: 0, y: 0, angle: 0, A: 30, L: 200, phase: 0 },
];

test('a finished stroke is the stroke itself', () => {
  for (const op of OPS) assert.deepEqual(partialOp(op, 1), op);
  for (const op of OPS) assert.deepEqual(partialOp(op, 7), op);
});

test('a stroke not yet started does nothing', () => {
  assert.equal(partialOp(OPS[0], 0).r, 0);
  assert.equal(partialOp(OPS[2], 0).z, 0);
  assert.equal(partialOp(OPS[3], -1).z, 0);
  assert.equal(partialOp(OPS[4], 0).A, 0);
});

test('a growing drop gains area at a steady rate', () => {
  const area = (t) => Math.PI * partialOp(OPS[0], t).r ** 2;
  const full = area(1);
  for (const t of [0.1, 0.25, 0.5, 0.9]) assert.ok(Math.abs(area(t) / full - t) < 1e-12);
});

test('timeline gives each stroke its duration in order', () => {
  const line = timeline(OPS);
  assert.deepEqual(line.durations, OPS.map((op) => DURATION[op.type]));
  assert.equal(line.starts[0], 0);
  for (let i = 1; i < OPS.length; i++) {
    assert.ok(Math.abs(line.starts[i] - (line.starts[i - 1] + line.durations[i - 1])) < 1e-12);
  }
  assert.ok(Math.abs(line.total - line.durations.reduce((a, b) => a + b)) < 1e-12);
});

test('long histories are squeezed into the playback limit', () => {
  const many = Array.from({ length: 200 }, () => OPS[2]);
  const line = timeline(many, 10);
  assert.ok(Math.abs(line.total - 10) < 1e-9);
});

test('frames run from an empty bath to the whole marbling', () => {
  const line = timeline(OPS);
  assert.deepEqual(frameAt(OPS, line, 0), []);
  assert.deepEqual(frameAt(OPS, line, line.total), OPS);
  assert.deepEqual(frameAt(OPS, line, line.total + 5), OPS);
  const mid = frameAt(OPS, line, line.starts[2] + line.durations[2] / 2);
  assert.equal(mid.length, 3);
  assert.deepEqual(mid.slice(0, 2), OPS.slice(0, 2));
  assert.ok(Math.abs(mid[2].z - 50) < 1e-9);
});

test('ink area stays put while a stroke is under way', () => {
  const line = timeline(OPS);
  const at = frameAt(OPS, line, line.starts[3] + line.durations[3] * 0.4);
  const counts = coverage(at, 300);
  const cell = (1000 / 300) ** 2;
  // the first drop has the second one inside it: its ink is the ring
  const ring = counts.get(0) * cell;
  assert.ok(Math.abs(ring / (Math.PI * 200 ** 2) - 1) < 0.02);
});
