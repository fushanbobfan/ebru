// Share links: the starting pattern by name, seed and palette, plus the
// strokes added by hand in a compact text form.

import { PATTERNS, PALETTES } from './patterns.js';
import { TRAY } from './marble.js';

export const MAX_OPS = 4000;

const FIELDS = {
  drop: { tag: 'd', keys: ['x', 'y', 'r'], color: true },
  rake: { tag: 'r', keys: ['x', 'y', 'angle', 'z', 'half', 'tines', 'spacing'] },
  swirl: { tag: 's', keys: ['x', 'y', 'R', 'z', 'half'] },
  wave: { tag: 'w', keys: ['x', 'y', 'angle', 'A', 'L', 'phase'] },
};
const BY_TAG = Object.fromEntries(Object.entries(FIELDS).map(([type, f]) => [f.tag, { type, ...f }]));

// Allowed range of each field; values outside are clamped.
const LIMITS = {
  x: [-TRAY, 2 * TRAY],
  y: [-TRAY, 2 * TRAY],
  r: [1, TRAY],
  angle: [-360, 360],
  z: [-2000, 2000],
  half: [0.5, TRAY],
  tines: [1, 200],
  spacing: [0, TRAY],
  R: [0, 2 * TRAY],
  A: [-TRAY, TRAY],
  L: [5, 4 * TRAY],
  phase: [-360, 360],
};

const num = (v) => String(Math.round(v * 10) / 10);

export function encodeOps(ops) {
  return ops
    .map((op) => {
      const f = FIELDS[op.type];
      const parts = f.keys.map((k) => num(op[k]));
      if (f.color) parts.push(op.color.replace('#', ''));
      return f.tag + parts.join(',');
    })
    .join(';');
}

export function decodeOps(text) {
  const ops = [];
  if (!text) return ops;
  for (const item of String(text).split(';')) {
    if (ops.length >= MAX_OPS) break;
    const f = BY_TAG[item[0]];
    if (!f) continue;
    const parts = item.slice(1).split(',');
    if (parts.length !== f.keys.length + (f.color ? 1 : 0)) continue;
    const op = { type: f.type };
    let ok = true;
    f.keys.forEach((k, i) => {
      const v = Number(parts[i]);
      if (!Number.isFinite(v) || parts[i] === '') ok = false;
      const [lo, hi] = LIMITS[k];
      op[k] = Math.min(hi, Math.max(lo, v));
    });
    if (f.type === 'rake') op.tines = Math.round(op.tines);
    if (f.color) {
      const c = parts[f.keys.length];
      if (!/^[0-9a-f]{6}$/i.test(c)) ok = false;
      op.color = `#${c.toLowerCase()}`;
    }
    if (ok) ops.push(op);
  }
  return ops;
}

export const DEFAULT_STATE = { pattern: 'gelgit', seed: 1, palette: 'istanbul', added: [] };

export function encodeState(state) {
  const q = new URLSearchParams();
  q.set('p', state.pattern);
  q.set('seed', String(state.seed));
  q.set('ink', state.palette);
  if (state.added.length) q.set('ops', encodeOps(state.added));
  return q.toString();
}

export function decodeState(query) {
  const q = new URLSearchParams(String(query).replace(/^[#?]/, ''));
  const pattern = q.get('p');
  const palette = q.get('ink');
  const seed = Number.parseInt(q.get('seed'), 10);
  return {
    pattern: pattern === 'blank' || PATTERNS[pattern] ? pattern : DEFAULT_STATE.pattern,
    seed: Number.isFinite(seed) ? Math.abs(seed) % 1000000 : DEFAULT_STATE.seed,
    palette: PALETTES[palette] ? palette : DEFAULT_STATE.palette,
    added: decodeOps(q.get('ops')),
  };
}
