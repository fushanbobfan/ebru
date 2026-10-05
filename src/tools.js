// Turn pointer gestures and key presses into marbling operations.

import { TRAY } from './marble.js';
import { fullRake } from './patterns.js';

export const TOOLS = {
  drop: 'Click to float a drop of ink; drag outward to size it by hand. A new drop pushes the ink around it aside.',
  stylus: 'Drag a single tine through the ink. The ink right under it moves as far as you drag; ink further away moves less.',
  comb: 'Drag to pull a comb of evenly spaced tines across the whole tray, through the point where you start.',
  swirl: 'Press where the centre should be, move out to the circle you want, then circle round. The ink turns along with you.',
  wave: 'Drag to set the direction and the length of one wave. Lines across that direction are bent into waves.',
};

const MIN_DRAG = 4;
const round = (v) => Math.round(v * 10) / 10;
const degrees = (dx, dy) => round((Math.atan2(dy, dx) * 180) / Math.PI);

// Operation for a straight drag from a to b, or null if it is too short
// to mean anything (a click with the drop tool still drops ink).
export function opFromDrag(tool, a, b, s) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  switch (tool) {
    case 'drop':
      return {
        type: 'drop', x: round(a[0]), y: round(a[1]),
        r: round(len >= MIN_DRAG ? len : s.size), color: s.color,
      };
    case 'stylus':
      if (len < MIN_DRAG) return null;
      return {
        type: 'rake', x: round(a[0]), y: round(a[1]), angle: degrees(dx, dy),
        z: round(len), half: s.sharp, tines: 1, spacing: 0,
      };
    case 'comb': {
      if (len < MIN_DRAG) return null;
      const op = fullRake(degrees(dx, dy), s.spacing, round(len), s.sharp);
      // pass the comb through the start point rather than the tray centre
      return { ...op, x: round(a[0]), y: round(a[1]) };
    }
    case 'wave':
      if (len < MIN_DRAG) return null;
      return {
        type: 'wave', x: round(a[0]), y: round(a[1]), angle: degrees(dx, dy),
        A: s.amp, L: round(Math.max(len, 10)), phase: 0,
      };
    default:
      return null;
  }
}

// Swirl gesture: a centre and the path of the pointer. The circle is the
// mean distance of the path from the centre, the stroke is the arc swept
// along it (signed: counter-clockwise on screen is negative because the
// y axis points down).
export function swirlFromPath(centre, path, s) {
  const pts = path.filter((p) => Math.hypot(p[0] - centre[0], p[1] - centre[1]) >= MIN_DRAG);
  if (pts.length < 2) return null;
  let swept = 0;
  let dist = 0;
  let prev = Math.atan2(pts[0][1] - centre[1], pts[0][0] - centre[0]);
  for (const p of pts) {
    const a = Math.atan2(p[1] - centre[1], p[0] - centre[0]);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    swept += d;
    prev = a;
    dist += Math.hypot(p[0] - centre[0], p[1] - centre[1]);
  }
  const R = dist / pts.length;
  if (Math.abs(swept) < 0.02) return null;
  return {
    type: 'swirl', x: round(centre[0]), y: round(centre[1]),
    R: round(R), z: round(R * swept), half: s.sharp * 3,
  };
}

// Operation for the keyboard: the current tool at the cursor, stroking in
// the chosen direction.
export function opFromKey(tool, cursor, s) {
  const a = (s.dir * Math.PI) / 180;
  const reach = 120;
  const end = [cursor[0] + Math.cos(a) * reach, cursor[1] + Math.sin(a) * reach];
  if (tool === 'swirl') {
    return { type: 'swirl', x: round(cursor[0]), y: round(cursor[1]), R: 150, z: round(150 * 1.5), half: s.sharp * 3 };
  }
  if (tool === 'wave') {
    return { type: 'wave', x: round(cursor[0]), y: round(cursor[1]), angle: s.dir, A: s.amp, L: 240, phase: 0 };
  }
  return opFromDrag(tool, cursor, tool === 'drop' ? cursor : end, s);
}

export function clampToTray(p) {
  return [Math.min(TRAY, Math.max(0, p[0])), Math.min(TRAY, Math.max(0, p[1]))];
}
