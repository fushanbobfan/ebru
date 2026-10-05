import test from 'node:test';
import assert from 'node:assert/strict';
import { TRAY, sourceAt } from '../src/marble.js';
import { compile, sourceIndex, render, coverage, parseColor } from '../src/render.js';

const OPS = [
  { type: 'drop', x: 350, y: 400, r: 110, color: '#c0392b' },
  { type: 'drop', x: 600, y: 520, r: 140, color: '#2c6fbb' },
  { type: 'drop', x: 480, y: 470, r: 70, color: '#f1c40f' },
  { type: 'rake', x: 500, y: 500, angle: 90, z: 90, half: 20, tines: 4, spacing: 90 },
  { type: 'swirl', x: 500, y: 500, R: 180, z: 120, half: 50 },
  { type: 'wave', x: 0, y: 0, angle: 0, A: 25, L: 200, phase: 0 },
];

test('parseColor reads hex colours with or without the hash', () => {
  assert.deepEqual(parseColor('#ff8000'), [255, 128, 0]);
  assert.deepEqual(parseColor('0a0b0c'), [10, 11, 12]);
  assert.deepEqual(parseColor('nonsense'), [0, 0, 0]);
});

test('compiled lookup agrees with the reference inverse maps', () => {
  const code = compile(OPS);
  let s = 3;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2000; i++) {
    const x = rand() * TRAY;
    const y = rand() * TRAY;
    assert.equal(sourceIndex(code, x, y), sourceAt(OPS, x, y));
  }
});

test('every drop keeps its area through rakes, swirls and waves', () => {
  // all ink stays well inside the tray, so each colour's share of the
  // samples should match its disc area
  const size = 400;
  const counts = coverage(OPS, size);
  const cell = (TRAY / size) ** 2;
  for (const [i, op] of OPS.entries()) {
    if (op.type !== 'drop') continue;
    const area = counts.get(i) * cell;
    const exact = Math.PI * op.r * op.r;
    assert.ok(Math.abs(area / exact - 1) < 0.02, `drop ${i}: ${area} vs ${exact}`);
  }
});

test('render fills an opaque RGBA image with drop and bath colours', () => {
  const ops = [{ type: 'drop', x: 500, y: 500, r: 300, color: '#ff0000' }];
  const data = render(ops, { width: 10, height: 10, background: '#ffffff' });
  assert.equal(data.length, 400);
  const centre = (5 * 10 + 5) * 4;
  assert.deepEqual([...data.slice(centre, centre + 4)], [255, 0, 0, 255]);
  assert.deepEqual([...data.slice(0, 4)], [255, 255, 255, 255]);
});

test('supersampling blends colours along an edge', () => {
  const ops = [{ type: 'drop', x: 500, y: 500, r: 300, color: '#000000' }];
  const plain = render(ops, { width: 8, height: 8, background: '#ffffff', ss: 1 });
  const smooth = render(ops, { width: 8, height: 8, background: '#ffffff', ss: 4 });
  const grey = [];
  for (let i = 0; i < smooth.length; i += 4) if (smooth[i] > 0 && smooth[i] < 255) grey.push(i);
  assert.ok(grey.length > 0);
  for (let i = 0; i < plain.length; i += 4) assert.ok(plain[i] === 0 || plain[i] === 255);
});
