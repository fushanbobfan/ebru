// Pack marbling operations into a float texture for the GPU renderer.
//
// Each operation takes TEXELS_PER_OP RGBA texels (12 floats), laid out
// OPS_PER_ROW operations to a row:
//
//   texel 0: kind, x, y, a
//   texel 1: b, c, d, e
//   texel 2: f, g, h, unused
//
// drop   a = r^2                     b, c, d = colour (0..1)
// rake   a = mx  b = my  c = z  d = k  e = first offset  f = spacing  g = tines
// swirl  a = R   b = z   c = k
// wave   a = mx  b = my  c = A  d = w  e = phase
//
// k is the falloff exponent -ln 2 / half, so a stroke's weight at distance
// d is exp(k |d|).

import { parseColor } from './render.js';

export const TEXELS_PER_OP = 3;
export const OPS_PER_ROW = 64;
export const KIND = { drop: 0, rake: 1, swirl: 2, wave: 3 };

const DEG = Math.PI / 180;

export function packOps(ops) {
  const rows = Math.max(1, Math.ceil(ops.length / OPS_PER_ROW));
  const width = OPS_PER_ROW * TEXELS_PER_OP;
  const data = new Float32Array(width * rows * 4);
  ops.forEach((op, i) => {
    const o = i * TEXELS_PER_OP * 4;
    const v = new Array(12).fill(0);
    v[0] = KIND[op.type];
    v[1] = op.x;
    v[2] = op.y;
    switch (op.type) {
      case 'drop': {
        const [r, g, b] = parseColor(op.color);
        v[3] = op.r * op.r;
        v[4] = r / 255;
        v[5] = g / 255;
        v[6] = b / 255;
        break;
      }
      case 'rake':
        v[3] = Math.cos(op.angle * DEG);
        v[4] = Math.sin(op.angle * DEG);
        v[5] = op.z;
        v[6] = -Math.LN2 / op.half;
        v[7] = -((op.tines - 1) / 2) * op.spacing;
        v[8] = op.spacing;
        v[9] = op.tines;
        break;
      case 'swirl':
        v[3] = op.R;
        v[4] = op.z;
        v[5] = -Math.LN2 / op.half;
        break;
      case 'wave':
        v[3] = Math.cos(op.angle * DEG);
        v[4] = Math.sin(op.angle * DEG);
        v[5] = op.A;
        v[6] = (2 * Math.PI) / op.L;
        v[7] = op.phase * DEG;
        break;
      default:
        throw new Error(`unknown operation ${op.type}`);
    }
    data.set(v, o);
  });
  return { data, width, rows, count: ops.length };
}

// Read operation i back out of a packed texture as the 12 raw floats.
export function packedSlot(packed, i) {
  const o = i * TEXELS_PER_OP * 4;
  return Array.from(packed.data.subarray(o, o + 12));
}
