// Raster rendering of a marbling by inverse mapping: for every sample,
// undo the operations from newest to oldest until a drop claims it.

import { TRAY } from './marble.js';

const DEG = Math.PI / 180;
const LN2 = Math.LN2;

export function parseColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// Precompute the per-operation constants the inner loop needs.
export function compile(ops) {
  return ops.map((op) => {
    switch (op.type) {
      case 'drop':
        return { kind: 0, x: op.x, y: op.y, r2: op.r * op.r };
      case 'rake': {
        const first = -((op.tines - 1) / 2) * op.spacing;
        const offsets = [];
        for (let i = 0; i < op.tines; i++) offsets.push(first + i * op.spacing);
        return {
          kind: 1, x: op.x, y: op.y,
          mx: Math.cos(op.angle * DEG), my: Math.sin(op.angle * DEG),
          z: op.z, k: -LN2 / op.half, offsets,
        };
      }
      case 'swirl':
        return { kind: 2, x: op.x, y: op.y, R: op.R, z: op.z, k: -LN2 / op.half };
      case 'wave':
        return {
          kind: 3, x: op.x, y: op.y,
          mx: Math.cos(op.angle * DEG), my: Math.sin(op.angle * DEG),
          A: op.A, w: (2 * Math.PI) / op.L, phase: op.phase * DEG,
        };
      default:
        throw new Error(`unknown operation ${op.type}`);
    }
  });
}

// Index of the drop covering tray point (x, y), or -1, using compiled ops.
export function sourceIndex(code, x, y) {
  for (let i = code.length - 1; i >= 0; i--) {
    const c = code[i];
    switch (c.kind) {
      case 0: {
        const dx = x - c.x;
        const dy = y - c.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= c.r2) return i;
        const s = Math.sqrt(1 - c.r2 / d2);
        x = c.x + dx * s;
        y = c.y + dy * s;
        break;
      }
      case 1: {
        const n = -(x - c.x) * c.my + (y - c.y) * c.mx;
        let s = 0;
        for (let j = 0; j < c.offsets.length; j++) s += Math.exp(Math.abs(n - c.offsets[j]) * c.k);
        s *= c.z;
        x -= s * c.mx;
        y -= s * c.my;
        break;
      }
      case 2: {
        const dx = x - c.x;
        const dy = y - c.y;
        const rho = Math.sqrt(dx * dx + dy * dy);
        if (rho === 0) break;
        const a = (-c.z * Math.exp(Math.abs(rho - c.R) * c.k)) / rho;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        x = c.x + dx * ca - dy * sa;
        y = c.y + dx * sa + dy * ca;
        break;
      }
      case 3: {
        const t = (x - c.x) * c.mx + (y - c.y) * c.my;
        const s = -c.A * Math.sin(c.w * t + c.phase);
        x -= s * c.my;
        y += s * c.mx;
        break;
      }
    }
  }
  return -1;
}

// Render rows [y0, y1) of a width x height image of the whole tray into
// `data` (RGBA, width*height*4). `ss` samples per pixel side are averaged.
export function renderRows(ops, code, opts, data, y0, y1) {
  const { width, height, background, ss = 1 } = opts;
  const colors = ops.map((op) => (op.type === 'drop' ? parseColor(op.color) : null));
  const bg = parseColor(background);
  const sx = TRAY / width;
  const sy = TRAY / height;
  const n = ss * ss;
  for (let py = y0; py < y1; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const idx = sourceIndex(code, (px + (i + 0.5) / ss) * sx, (py + (j + 0.5) / ss) * sy);
          const col = idx < 0 ? bg : colors[idx];
          r += col[0];
          g += col[1];
          b += col[2];
        }
      }
      const o = (py * width + px) * 4;
      data[o] = r / n;
      data[o + 1] = g / n;
      data[o + 2] = b / n;
      data[o + 3] = 255;
    }
  }
}

export function render(ops, opts) {
  const data = new Uint8ClampedArray(opts.width * opts.height * 4);
  renderRows(ops, compile(ops), opts, data, 0, opts.height);
  return data;
}

// Count samples on a size x size grid claimed by each drop (-1 = bath).
export function coverage(ops, size) {
  const code = compile(ops);
  const counts = new Map();
  const step = TRAY / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const idx = sourceIndex(code, (i + 0.5) * step, (j + 0.5) * step);
      counts.set(idx, (counts.get(idx) || 0) + 1);
    }
  }
  return counts;
}
