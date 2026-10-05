import test from 'node:test';
import assert from 'node:assert/strict';
import { packOps, packedSlot, OPS_PER_ROW, TEXELS_PER_OP, KIND } from '../src/pack.js';
import { sourceAt } from '../src/marble.js';
import { buildPattern } from '../src/patterns.js';

// Walk a pixel back through the packed operations exactly as the fragment
// shader does, in float32 like the GPU.
function packedSource(packed, x, y) {
  const f = Math.fround;
  for (let i = packed.count - 1; i >= 0; i--) {
    const v = packedSlot(packed, i);
    const kind = v[0];
    if (kind === KIND.drop) {
      const dx = f(x - v[1]);
      const dy = f(y - v[2]);
      const d2 = f(dx * dx + dy * dy);
      if (d2 <= v[3]) return i;
      const s = f(Math.sqrt(1 - v[3] / d2));
      x = f(v[1] + dx * s);
      y = f(v[2] + dy * s);
    } else if (kind === KIND.rake) {
      const n = f(-(x - v[1]) * v[4] + (y - v[2]) * v[3]);
      let s = 0;
      for (let j = 0; j < v[9]; j++) s += Math.exp(Math.abs(n - v[7] - j * v[8]) * v[6]);
      s = f(s * v[5]);
      x = f(x - s * v[3]);
      y = f(y - s * v[4]);
    } else if (kind === KIND.swirl) {
      const dx = x - v[1];
      const dy = y - v[2];
      const rho = Math.hypot(dx, dy);
      if (rho > 0) {
        const a = (-v[4] * Math.exp(Math.abs(rho - v[3]) * v[5])) / rho;
        x = f(v[1] + dx * Math.cos(a) - dy * Math.sin(a));
        y = f(v[2] + dx * Math.sin(a) + dy * Math.cos(a));
      }
    } else {
      const t = (x - v[1]) * v[3] + (y - v[2]) * v[4];
      const s = -v[5] * Math.sin(v[6] * t + v[7]);
      x = f(x - s * v[4]);
      y = f(y + s * v[3]);
    }
  }
  return -1;
}

test('texture is laid out in rows of operations', () => {
  const ops = Array.from({ length: OPS_PER_ROW + 1 }, (_, i) => ({ type: 'drop', x: i, y: 0, r: 1, color: '#ffffff' }));
  const packed = packOps(ops);
  assert.equal(packed.width, OPS_PER_ROW * TEXELS_PER_OP);
  assert.equal(packed.rows, 2);
  assert.equal(packed.data.length, packed.width * packed.rows * 4);
  assert.equal(packedSlot(packed, OPS_PER_ROW)[1], OPS_PER_ROW);
});

test('an empty list still makes a one-row texture', () => {
  const packed = packOps([]);
  assert.equal(packed.rows, 1);
  assert.equal(packed.count, 0);
});

test('drop colours are stored as fractions', () => {
  const v = packedSlot(packOps([{ type: 'drop', x: 1, y: 2, r: 3, color: '#ff8000' }]), 0);
  assert.deepEqual(v.slice(0, 7), [0, 1, 2, 9, 1, Math.fround(128 / 255), 0]);
});

test('rake fields include the first tine offset and the count', () => {
  const v = packedSlot(packOps([{ type: 'rake', x: 0, y: 0, angle: 0, z: 10, half: 5, tines: 5, spacing: 20 }]), 0);
  assert.equal(v[0], KIND.rake);
  assert.equal(v[7], -40);
  assert.equal(v[8], 20);
  assert.equal(v[9], 5);
});

test('the packed program finds the same drop as the reference maps', () => {
  for (const name of ['gelgit', 'hearts', 'spiral', 'serpentine']) {
    const ops = buildPattern(name, 11, 'istanbul');
    const packed = packOps(ops);
    let agree = 0;
    const n = 1500;
    for (let i = 0; i < n; i++) {
      const x = ((i * 7919) % 1000) + 0.5;
      const y = ((i * 104729) % 1000) + 0.25;
      if (packedSource(packed, x, y) === sourceAt(ops, x, y)) agree++;
    }
    // float32 may flip a few samples sitting right on an ink boundary
    assert.ok(agree / n > 0.99, `${name}: ${agree}/${n}`);
  }
});

test('unknown operations are rejected', () => {
  assert.throws(() => packOps([{ type: 'spill', x: 0, y: 0 }]));
});
