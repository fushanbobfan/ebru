// Replaying a marbling: every stroke can be shown part way done, and a
// timeline gives each stroke a share of the playback time.

// The stroke `op` a fraction t (0..1) of the way through. A drop grows
// with its area proportional to t; strokes slide t of their full length.
export function partialOp(op, t) {
  const f = Math.min(1, Math.max(0, t));
  switch (op.type) {
    case 'drop': return { ...op, r: op.r * Math.sqrt(f) };
    case 'rake': return { ...op, z: op.z * f };
    case 'swirl': return { ...op, z: op.z * f };
    case 'wave': return { ...op, A: op.A * f };
    default: throw new Error(`unknown operation ${op.type}`);
  }
}

// Seconds of playback per stroke: drops land quickly, strokes are drawn
// slowly enough to follow.
export const DURATION = { drop: 0.05, rake: 0.9, swirl: 1.2, wave: 0.9 };

export function timeline(ops, maxSeconds = 20) {
  const raw = ops.map((op) => DURATION[op.type]);
  const total = raw.reduce((a, b) => a + b, 0);
  const k = total > maxSeconds ? maxSeconds / total : 1;
  const starts = [];
  let t = 0;
  for (const d of raw) {
    starts.push(t);
    t += d * k;
  }
  return { starts, durations: raw.map((d) => d * k), total: t };
}

// Strokes on the tray at playback time `seconds`: the finished ones and
// the one under way.
export function frameAt(ops, line, seconds) {
  if (seconds >= line.total) return ops.slice();
  const out = [];
  for (let i = 0; i < ops.length; i++) {
    const start = line.starts[i];
    if (seconds <= start) break;
    const t = (seconds - start) / line.durations[i];
    if (t >= 1) {
      out.push(ops[i]);
    } else {
      out.push(partialOp(ops[i], t));
      break;
    }
  }
  return out;
}
