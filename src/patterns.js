// Palettes and starting patterns, each built from a seed so a pattern
// can be shared as a name and a number.

import { TRAY } from './marble.js';

export const PALETTES = {
  istanbul: {
    label: 'Istanbul',
    bath: '#efe6d2',
    inks: ['#1f3a68', '#b5302b', '#e0a526', '#2e6b4f', '#f4efe3'],
  },
  indigo: {
    label: 'Indigo',
    bath: '#f3f0e8',
    inks: ['#1b2a4a', '#3d5a8c', '#8aa6cf', '#d8e2f0', '#c96a3a'],
  },
  ember: {
    label: 'Ember',
    bath: '#1d1612',
    inks: ['#e85d2a', '#f2b33d', '#8c1c13', '#f6e7c8', '#3b2a22'],
  },
  lagoon: {
    label: 'Lagoon',
    bath: '#e9f2ef',
    inks: ['#0f5c63', '#21a29a', '#f2c14e', '#f78154', '#1d2d44'],
  },
  ink: {
    label: 'Sumi ink',
    bath: '#f5f1e8',
    inks: ['#141414', '#5a5a5a', '#f5f1e8', '#9b2d20'],
  },
};

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A rake whose tines span the whole tray at the given spacing.
export function fullRake(angle, spacing, z, half, shift = 0) {
  const span = TRAY * Math.SQRT2;
  const tines = Math.ceil(span / spacing) + 1;
  const a = (angle * Math.PI) / 180;
  // move the rake line across its own direction by `shift`
  return {
    type: 'rake',
    x: TRAY / 2 - Math.sin(a) * shift,
    y: TRAY / 2 + Math.cos(a) * shift,
    angle, z, half, tines, spacing,
  };
}

const round = (v) => Math.round(v * 10) / 10;

// Stones: drops scattered over the whole bath, big ones first.
function stones(rand, inks, count, rMax, rMin) {
  const ops = [];
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    ops.push({
      type: 'drop',
      x: round(rand() * TRAY),
      y: round(rand() * TRAY),
      r: round(rMax + (rMin - rMax) * t * (0.7 + 0.6 * rand())),
      color: inks[i % inks.length],
    });
  }
  return ops;
}

// Concentric drops at one centre: each new drop pushes the others into rings.
function bullseye(inks, x, y, rings, r) {
  const ops = [];
  for (let i = 0; i < rings; i++) ops.push({ type: 'drop', x, y, r, color: inks[i % inks.length] });
  return ops;
}

// Back-and-forth combing: one pass, then a pass the other way between the
// first pass's tines.
function gelgit(angle, spacing, z, half) {
  return [
    fullRake(angle, spacing, z, half),
    fullRake(angle + 180, spacing, z, half, spacing / 2),
  ];
}

export const PATTERNS = {
  battal: {
    label: 'Battal (stones)',
    note: 'The plainest marbling: drops of each colour scattered on the bath. Every new drop shoulders the older ink aside, so early drops end up as thin veins between later ones.',
    build: (rand, inks) => stones(rand, inks, 140, 110, 28),
  },
  gelgit: {
    label: 'Gelgit (come and go)',
    note: 'Stones combed one way and then back the other way between the first strokes, which drags every stone into long alternating tongues.',
    build: (rand, inks) => [...stones(rand, inks, 110, 95, 30), ...gelgit(90, 90, 70, 14)],
  },
  nonpareil: {
    label: 'Nonpareil',
    note: 'Gelgit followed by a fine comb across it. The tight tines pull the tongues into rows of small arches.',
    build: (rand, inks) => [
      ...stones(rand, inks, 110, 95, 30),
      ...gelgit(90, 80, 60, 12),
      fullRake(0, 26, 18, 5),
    ],
  },
  hearts: {
    label: 'Hearts',
    note: 'Rows of concentric drops, then a single stylus pulled straight through the middle of each row. Every target is dented into a heart.',
    build: (rand, inks) => {
      const ops = [];
      const n = 4;
      const step = TRAY / n;
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * step + (j % 2 ? step / 2 : 0);
          const k = (i + j) % inks.length;
          const turned = [...inks.slice(k), ...inks.slice(0, k)];
          ops.push(...bullseye(turned, round(x % TRAY), (j + 0.5) * step, 5, round(26 + rand() * 6)));
        }
      }
      for (let j = 0; j < n; j++) {
        ops.push({ type: 'rake', x: 0, y: (j + 0.5) * step, angle: 0, z: 70, half: 10, tines: 1, spacing: 0 });
      }
      return ops;
    },
  },
  spiral: {
    label: 'Spiral',
    note: 'One big target of rings, combed once so it is no longer round, then a swirl that turns the inside much faster than the outside, winding the rings into a spiral.',
    build: (rand, inks) => [
      ...bullseye(inks, 500, 500, 16, 46),
      { type: 'rake', x: 500, y: 500, angle: 90, z: 140, half: 18, tines: 3, spacing: 120 },
      { type: 'swirl', x: 500, y: 500, R: 0, z: 380, half: 160 },
    ],
  },
  serpentine: {
    label: 'Serpentine',
    note: 'Nonpareil rows bent by a wave across the tray, so the straight combing snakes from side to side.',
    build: (rand, inks) => [
      ...stones(rand, inks, 110, 95, 30),
      ...gelgit(90, 80, 60, 12),
      fullRake(0, 26, 18, 5),
      { type: 'wave', x: 0, y: 0, angle: 90, A: 45, L: 260, phase: 0 },
    ],
  },
};

export function buildPattern(name, seed, paletteName) {
  const pattern = PATTERNS[name] || PATTERNS.battal;
  const palette = PALETTES[paletteName] || PALETTES.istanbul;
  return pattern.build(rng(seed), palette.inks);
}
