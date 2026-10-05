import { TRAY } from './marble.js';
import { compile, renderRows } from './render.js';
import { PALETTES, PATTERNS, buildPattern } from './patterns.js';
import { encodeState, decodeState } from './share.js';
import { TOOLS, opFromDrag, swirlFromPath, opFromKey, clampToTray } from './tools.js';

const $ = (id) => document.getElementById(id);
const tray = $('tray');
const overlay = $('overlay');
const ctx = tray.getContext('2d');
const octx = overlay.getContext('2d');

const MAX_BACKING = 900;
const PREVIEW = 200;
const FRAME_MS = 14;

const state = decodeState(location.hash);
let base = [];
let redo = [];
let ink = PALETTES[state.palette].inks[0];
let cursor = [TRAY / 2, TRAY / 2];
let showCursor = false;
let gesture = null;
let job = null;

const settings = () => ({
  size: Number($('size').value),
  sharp: Number($('sharp').value),
  spacing: Number($('spacing').value),
  amp: Number($('amp').value),
  dir: Number($('dir').value),
  color: ink,
});

const tool = () => document.querySelector('input[name="tool"]:checked').value;
const allOps = () => base.concat(state.added);
const bath = () => PALETTES[state.palette].bath;

function rebuildBase() {
  base = state.pattern === 'blank' ? [] : buildPattern(state.pattern, state.seed, state.palette);
}

// ---- rendering ---------------------------------------------------------

function sizeCanvases() {
  const rect = tray.getBoundingClientRect();
  const px = Math.max(1, Math.min(MAX_BACKING, Math.round(rect.width * (window.devicePixelRatio || 1))));
  for (const c of [tray, overlay]) {
    if (c.width !== px) {
      c.width = px;
      c.height = px;
    }
  }
}

// Quick low-resolution picture, stretched over the tray.
const scratch = document.createElement('canvas');
function drawPreview(ops) {
  const n = Math.min(PREVIEW, tray.width);
  scratch.width = n;
  scratch.height = n;
  const sctx = scratch.getContext('2d');
  const img = sctx.createImageData(n, n);
  renderRows(ops, compile(ops), { width: n, height: n, background: bath() }, img.data, 0, n);
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(scratch, 0, 0, tray.width, tray.height);
}

// Full-resolution picture, a slice of rows per frame so the page stays live.
function startFull(ops) {
  if (job) cancelAnimationFrame(job.raf);
  const w = tray.width;
  const img = ctx.createImageData(w, w);
  const opts = { width: w, height: w, background: bath() };
  const code = compile(ops);
  const started = performance.now();
  setStatus();
  job = { y: 0, raf: 0 };
  const current = job;
  const step = () => {
    const t0 = performance.now();
    const from = current.y;
    while (current.y < w && performance.now() - t0 < FRAME_MS) {
      const next = Math.min(w, current.y + 8);
      renderRows(ops, code, opts, img.data, current.y, next);
      current.y = next;
    }
    ctx.putImageData(img, 0, 0, 0, from, w, current.y - from);
    if (current.y < w) {
      current.raf = requestAnimationFrame(step);
    } else {
      job = null;
      setStatus(performance.now() - started);
    }
  };
  current.raf = requestAnimationFrame(step);
}

function redraw() {
  const ops = allOps();
  drawPreview(ops);
  startFull(ops);
  drawOverlay();
  syncUndo();
  saveHash();
}

function setStatus(ms) {
  const ops = allOps();
  const drops = ops.filter((o) => o.type === 'drop').length;
  const strokes = ops.length - drops;
  const time = ms === undefined ? ' · drawing…' : ` · drawn in ${Math.round(ms)} ms`;
  $('status').textContent = `${drops} drop${drops === 1 ? '' : 's'}, ${strokes} stroke${strokes === 1 ? '' : 's'}${time}`;
}

// ---- overlay -----------------------------------------------------------

function toCanvas(p) {
  const k = overlay.width / TRAY;
  return [p[0] * k, p[1] * k];
}

function arrow(a, b) {
  const [ax, ay] = toCanvas(a);
  const [bx, by] = toCanvas(b);
  octx.beginPath();
  octx.moveTo(ax, ay);
  octx.lineTo(bx, by);
  const ang = Math.atan2(by - ay, bx - ax);
  const h = 10 * (window.devicePixelRatio || 1);
  octx.moveTo(bx, by);
  octx.lineTo(bx - h * Math.cos(ang - 0.4), by - h * Math.sin(ang - 0.4));
  octx.moveTo(bx, by);
  octx.lineTo(bx - h * Math.cos(ang + 0.4), by - h * Math.sin(ang + 0.4));
  octx.stroke();
}

function guideStyle() {
  const dpr = window.devicePixelRatio || 1;
  octx.lineWidth = 1.5 * dpr;
  octx.strokeStyle = 'rgba(255,255,255,0.9)';
  octx.shadowColor = 'rgba(0,0,0,0.6)';
  octx.shadowBlur = 3 * dpr;
}

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  guideStyle();
  const k = overlay.width / TRAY;
  if (gesture && gesture.op) {
    const op = gesture.op;
    if (op.type === 'drop') {
      const [x, y] = toCanvas([op.x, op.y]);
      octx.beginPath();
      octx.arc(x, y, op.r * k, 0, 2 * Math.PI);
      octx.stroke();
    } else if (op.type === 'swirl') {
      const [x, y] = toCanvas([op.x, op.y]);
      octx.beginPath();
      octx.arc(x, y, op.R * k, 0, 2 * Math.PI);
      octx.stroke();
    } else {
      arrow(gesture.start, gesture.end);
    }
  }
  if (showCursor && !gesture) {
    const [x, y] = toCanvas(cursor);
    const s = settings();
    octx.beginPath();
    if (tool() === 'drop') {
      octx.arc(x, y, s.size * k, 0, 2 * Math.PI);
    } else {
      octx.moveTo(x - 8, y);
      octx.lineTo(x + 8, y);
      octx.moveTo(x, y - 8);
      octx.lineTo(x, y + 8);
    }
    octx.stroke();
    if (tool() !== 'drop') {
      const a = (s.dir * Math.PI) / 180;
      arrow(cursor, [cursor[0] + Math.cos(a) * 120, cursor[1] + Math.sin(a) * 120]);
    }
  }
}

// ---- editing -----------------------------------------------------------

function addOp(op) {
  if (!op) return;
  state.added.push(op);
  redo = [];
  redraw();
}

function undo() {
  if (!state.added.length) return;
  redo.push(state.added.pop());
  redraw();
}

function redoOp() {
  if (!redo.length) return;
  state.added.push(redo.pop());
  redraw();
}

function syncUndo() {
  $('undo').disabled = state.added.length === 0;
  $('redo').disabled = redo.length === 0;
}

let hashTimer = 0;
function saveHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    history.replaceState(null, '', `#${encodeState(state)}`);
  }, 250);
}

// ---- pointer -----------------------------------------------------------

function trayPoint(e) {
  const rect = tray.getBoundingClientRect();
  return clampToTray([((e.clientX - rect.left) / rect.width) * TRAY, ((e.clientY - rect.top) / rect.height) * TRAY]);
}

let pending = false;
function previewGesture() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (!gesture) return;
    if (job) {
      cancelAnimationFrame(job.raf);
      job = null;
    }
    drawPreview(gesture.op ? allOps().concat([gesture.op]) : allOps());
    drawOverlay();
  });
}

function gestureOp(g) {
  if (g.tool === 'swirl') return swirlFromPath(g.start, g.path, settings());
  return opFromDrag(g.tool, g.start, g.end, settings());
}

tray.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  tray.setPointerCapture(e.pointerId);
  const p = trayPoint(e);
  gesture = { tool: tool(), start: p, end: p, path: [p], op: null };
  showCursor = false;
  previewGesture();
});

tray.addEventListener('pointermove', (e) => {
  if (!gesture) return;
  const p = trayPoint(e);
  gesture.end = p;
  gesture.path.push(p);
  gesture.op = gestureOp(gesture);
  previewGesture();
});

function finishGesture(commit) {
  if (!gesture) return;
  const op = commit ? gestureOp(gesture) : null;
  gesture = null;
  if (op) addOp(op);
  else redraw();
}

tray.addEventListener('pointerup', () => finishGesture(true));
tray.addEventListener('pointercancel', () => finishGesture(false));

// ---- keyboard ----------------------------------------------------------

const TOOL_KEYS = ['drop', 'stylus', 'comb', 'swirl', 'wave'];

tray.addEventListener('focus', () => {
  showCursor = tray.matches(':focus-visible');
  drawOverlay();
});
tray.addEventListener('blur', () => {
  showCursor = false;
  drawOverlay();
});

tray.addEventListener('keydown', (e) => {
  const step = e.shiftKey ? 50 : 10;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[e.key]) {
    cursor = clampToTray([cursor[0] + moves[e.key][0], cursor[1] + moves[e.key][1]]);
    showCursor = true;
    drawOverlay();
  } else if (e.key === 'Enter' || e.key === ' ') {
    addOp(opFromKey(tool(), cursor, settings()));
  } else if (/^[1-5]$/.test(e.key)) {
    setTool(TOOL_KEYS[Number(e.key) - 1]);
  } else if (e.key === '[' || e.key === ']') {
    nudge($('size'), e.key === ']' ? 5 : -5);
  } else if (e.key === ',' || e.key === '.') {
    nudge($('dir'), e.key === '.' ? 15 : -15, true);
  } else if (e.key === 'c' || e.key === 'C') {
    const inks = PALETTES[state.palette].inks;
    setInk(inks[(inks.indexOf(ink) + 1) % inks.length]);
  } else if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
    undo();
  } else if (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
    redoOp();
  } else {
    return;
  }
  e.preventDefault();
});

function nudge(input, delta, wrap = false) {
  const min = Number(input.min);
  const max = Number(input.max);
  let v = Number(input.value) + delta;
  if (wrap) v = ((v % 360) + 360) % 360;
  input.value = String(Math.min(max, Math.max(min, v)));
  input.dispatchEvent(new Event('input'));
}

// ---- controls ----------------------------------------------------------

const SLIDERS = {
  size: (v) => `${v}`,
  sharp: (v) => `${v}`,
  spacing: (v) => `${v}`,
  amp: (v) => `${v}`,
  dir: (v) => `${v}°`,
};

for (const [id, fmt] of Object.entries(SLIDERS)) {
  const input = $(id);
  const out = $(`${id}-out`);
  const sync = () => {
    out.textContent = fmt(input.value);
    drawOverlay();
  };
  input.addEventListener('input', sync);
  sync();
}

const ROWS = {
  drop: ['size'],
  stylus: ['sharp', 'dir'],
  comb: ['sharp', 'spacing', 'dir'],
  swirl: ['sharp'],
  wave: ['amp', 'dir'],
};

function setTool(name) {
  const input = document.querySelector(`input[name="tool"][value="${name}"]`);
  input.checked = true;
  syncTool();
}

function syncTool() {
  const t = tool();
  $('tool-note').textContent = TOOLS[t];
  for (const id of Object.keys(SLIDERS)) $(`${id}-row`).hidden = !ROWS[t].includes(id);
  drawOverlay();
}

for (const input of document.querySelectorAll('input[name="tool"]')) input.addEventListener('change', syncTool);

function setInk(color) {
  ink = color;
  for (const b of $('swatches').children) b.setAttribute('aria-checked', String(b.dataset.color === color));
}

function buildSwatches() {
  const box = $('swatches');
  box.textContent = '';
  for (const color of PALETTES[state.palette].inks) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `Ink ${color}`);
    b.dataset.color = color;
    b.style.background = color;
    b.addEventListener('click', () => setInk(color));
    box.append(b);
  }
  setInk(PALETTES[state.palette].inks[0]);
}

$('custom').addEventListener('input', (e) => setInk(e.target.value));

for (const [key, p] of Object.entries(PALETTES)) $('palette').append(new Option(p.label, key));
$('palette').value = state.palette;
$('palette').addEventListener('change', (e) => {
  state.palette = e.target.value;
  buildSwatches();
  rebuildBase();
  redraw();
});

$('pattern').append(new Option('Clean bath', 'blank'));
for (const [key, p] of Object.entries(PATTERNS)) $('pattern').append(new Option(p.label, key));

function syncPattern() {
  $('pattern').value = state.pattern;
  $('seed').value = String(state.seed);
  $('seed').disabled = state.pattern === 'blank';
  $('reseed').disabled = state.pattern === 'blank';
  $('pattern-note').textContent = state.pattern === 'blank'
    ? 'A clean bath with no ink on it yet.'
    : PATTERNS[state.pattern].note;
}

function startOver() {
  state.added = [];
  redo = [];
  rebuildBase();
  syncPattern();
  redraw();
}

$('pattern').addEventListener('change', (e) => {
  state.pattern = e.target.value;
  startOver();
});
$('seed').addEventListener('change', (e) => {
  const v = Number.parseInt(e.target.value, 10);
  state.seed = Number.isFinite(v) ? Math.abs(v) % 1000000 : 1;
  startOver();
});
$('reseed').addEventListener('click', () => {
  state.seed = Math.floor(Math.random() * 1000000);
  startOver();
});
$('restart').addEventListener('click', startOver);
$('blank').addEventListener('click', () => {
  state.pattern = 'blank';
  startOver();
});
$('undo').addEventListener('click', undo);
$('redo').addEventListener('click', redoOp);

$('share').addEventListener('click', async () => {
  const url = `${location.origin}${location.pathname}#${encodeState(state)}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    $('print-note').textContent = 'Link copied.';
  } catch {
    $('print-note').textContent = 'Copy the address bar to share this marbling.';
  }
});

// ---- print -------------------------------------------------------------

let printing = false;
$('png').addEventListener('click', () => {
  if (printing) return;
  printing = true;
  $('png').disabled = true;
  const size = Number($('print-size').value);
  const ss = size <= 1000 ? 2 : 1;
  const ops = allOps();
  const code = compile(ops);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const pctx = canvas.getContext('2d');
  const img = pctx.createImageData(size, size);
  const opts = { width: size, height: size, background: bath(), ss };
  let y = 0;
  const step = () => {
    const t0 = performance.now();
    while (y < size && performance.now() - t0 < FRAME_MS) {
      const next = Math.min(size, y + 4);
      renderRows(ops, code, opts, img.data, y, next);
      y = next;
    }
    $('print-note').textContent = `Printing… ${Math.round((100 * y) / size)}%`;
    if (y < size) {
      requestAnimationFrame(step);
      return;
    }
    pctx.putImageData(img, 0, 0);
    canvas.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ebru-${state.pattern}-${state.seed}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      $('print-note').textContent = `Saved a ${size} × ${size} print.`;
      printing = false;
      $('png').disabled = false;
    });
  };
  requestAnimationFrame(step);
});

// ---- start -------------------------------------------------------------

window.addEventListener('hashchange', () => {
  const next = decodeState(location.hash);
  if (encodeState(next) === encodeState(state)) return;
  Object.assign(state, next);
  redo = [];
  buildSwatches();
  $('palette').value = state.palette;
  rebuildBase();
  syncPattern();
  redraw();
});

new ResizeObserver(() => {
  const before = tray.width;
  sizeCanvases();
  if (tray.width !== before) redraw();
}).observe(tray);

buildSwatches();
syncTool();
rebuildBase();
syncPattern();
sizeCanvases();
redraw();
