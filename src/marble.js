// Marbling operations as exact maps of the tray onto itself.
//
// Every operation is a bijection that preserves area, the way the thin
// layer of ink on a size bath does. Each one has a forward map (where a
// point of ink ends up) and a closed-form inverse (where the ink now at a
// point came from). Rendering runs the inverses backwards from the newest
// operation, so the picture is exact at any resolution.
//
// Units are tray units; the tray is TRAY units on a side.

export const TRAY = 1000;

const TAU = Math.PI * 2;

// Strength of a tine at normal distance d: z at the tine, halving every
// `half` units away from it. This is Jaffer's u^d falloff with
// u = 2^(-1/half).
export function falloff(d, half) {
  return Math.pow(2, -Math.abs(d) / half);
}

function unit(angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a)];
}

// Offsets of the tines of a rake across its line, centred on the line.
export function tineOffsets(count, spacing) {
  const out = [];
  for (let i = 0; i < count; i++) out.push((i - (count - 1) / 2) * spacing);
  return out;
}

// Displacement profile of a rake at signed normal coordinate n.
function rakeShift(op, n) {
  let s = 0;
  const first = -((op.tines - 1) / 2) * op.spacing;
  for (let i = 0; i < op.tines; i++) s += falloff(n - first - i * op.spacing, op.half);
  return op.z * s;
}

// Drop: new ink of radius r at (x, y) pushes the old ink radially outward
// so that the ring between |P-C| and its image holds exactly the drop's
// area: |P'-C|^2 = |P-C|^2 + r^2.
function dropForward(op, x, y) {
  const dx = x - op.x;
  const dy = y - op.y;
  const d2 = dx * dx + dy * dy;
  if (d2 === 0) return [op.x + op.r, op.y];
  const k = Math.sqrt(1 + (op.r * op.r) / d2);
  return [op.x + dx * k, op.y + dy * k];
}

// Inverse of a drop, or null for a point inside the drop itself.
function dropInverse(op, x, y) {
  const dx = x - op.x;
  const dy = y - op.y;
  const d2 = dx * dx + dy * dy;
  const r2 = op.r * op.r;
  if (d2 <= r2) return null;
  const k = Math.sqrt(1 - r2 / d2);
  return [op.x + dx * k, op.y + dy * k];
}

// Rake: tines pulled along direction `angle`. Each point slides parallel
// to the stroke by an amount that depends only on its distance across
// the stroke, so the map is a shear and keeps area exactly.
function rakeMove(op, x, y, sign) {
  const [mx, my] = unit(op.angle);
  const n = -(x - op.x) * my + (y - op.y) * mx;
  const s = sign * rakeShift(op, n);
  return [x + s * mx, y + s * my];
}

// Swirl: a stylus drawn once around a circle of radius R. A point at
// distance rho from the centre moves along its own circle by an arc of
// z * falloff(rho - R), so the stroke is strongest on the circle and
// fades either side of it. Rotating each circle rigidly keeps area.
function swirlMove(op, x, y, sign) {
  const dx = x - op.x;
  const dy = y - op.y;
  const rho = Math.hypot(dx, dy);
  if (rho === 0) return [x, y];
  const a = (sign * op.z * falloff(rho - op.R, op.half)) / rho;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [op.x + dx * c - dy * s, op.y + dx * s + dy * c];
}

// Wave: lines along `angle` are bent into sine waves. Each point moves
// across the direction by A sin(2 pi t / L + phase), where t is its
// position along it, which is again a shear.
function waveMove(op, x, y, sign) {
  const [mx, my] = unit(op.angle);
  const t = (x - op.x) * mx + (y - op.y) * my;
  const s = sign * op.A * Math.sin((TAU * t) / op.L + (op.phase * Math.PI) / 180);
  return [x - s * my, y + s * mx];
}

export function forward(op, x, y) {
  switch (op.type) {
    case 'drop': return dropForward(op, x, y);
    case 'rake': return rakeMove(op, x, y, 1);
    case 'swirl': return swirlMove(op, x, y, 1);
    case 'wave': return waveMove(op, x, y, 1);
    default: throw new Error(`unknown operation ${op.type}`);
  }
}

// Where the ink now at (x, y) was before `op`; null if `op` is a drop
// that covers (x, y).
export function inverse(op, x, y) {
  switch (op.type) {
    case 'drop': return dropInverse(op, x, y);
    case 'rake': return rakeMove(op, x, y, -1);
    case 'swirl': return swirlMove(op, x, y, -1);
    case 'wave': return waveMove(op, x, y, -1);
    default: throw new Error(`unknown operation ${op.type}`);
  }
}

// Index of the drop whose ink lies at (x, y) after all `ops`, or -1 for
// the bare bath.
export function sourceAt(ops, x, y) {
  let px = x;
  let py = y;
  for (let i = ops.length - 1; i >= 0; i--) {
    const p = inverse(ops[i], px, py);
    if (p === null) return i;
    px = p[0];
    py = p[1];
  }
  return -1;
}

// Apply every operation from `start` on to a point of ink.
export function carry(ops, x, y, start = 0) {
  let p = [x, y];
  for (let i = start; i < ops.length; i++) p = forward(ops[i], p[0], p[1]);
  return p;
}
