// 5x5 grid font
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG (without the controls), F toggles fullscreen, H hides the controls.
//
// A letter is a 5×5 grid of dots inside a container box. The dots always fill
// the box: each dot is (box size − 4 gaps) / 5 wide and tall, so stretching the
// box (drag its handles, or use the Width / Height sliders) stretches the dots.
// Every dot has a fill, an optional stroke (outside / center / inside, with a
// width), and a corner radius. Gaps are set separately for X and Y.
//
// Defaults come from the Figma frame "5×5 / Letters / A" (file cc2026,
// node 19:89984): 252×300 box, 9px gaps, 15px radius, #d2d2d2 fill and a 6px
// inside stroke of the same colour, centred on a #242424 2000×2000 frame.

/* ---------- glyphs ---------- */

// '#' = lit dot, '.' = empty cell. Rows top to bottom. More letters go here.
const GLYPHS = {
  A: [
    '..#..',
    '.#.#.',
    '#...#',
    '#####',
    '#...#',
  ],
};
const COLS = 5;
const ROWS = 5;

/* ---------- settings ---------- */

const BG = '#242424';
const MID = { x: 1000, y: 1000 }; // the letter's centre, as in Figma

const DEFAULTS = {
  w: 252.28,
  h: 300,
  gapX: 9,
  gapY: 9,
  radius: 15,
  fillOn: true,
  fill: '#d2d2d2',
  strokeOn: true,
  stroke: '#d2d2d2',
  strokeAlign: 'inside', // 'outside' | 'center' | 'inside'
  strokeW: 6,
  ghost: false,          // show the empty cells faintly
};

const RANGES = {
  w: [20, 1800],
  h: [20, 1100],
  gapX: [0, 120],
  gapY: [0, 120],
  radius: [0, 200],
  strokeW: [0, 40],
};

const SWATCHES = ['#d2d2d2', '#ffffff', '#ff5a36', '#ffd23f', '#3dd68c', '#3d7bff', '#111111'];

const PREF_KEY = 'cc01.settings';
let S = loadSettings();
let showUI = true;

/* ---------- p5 ---------- */

function setup() {
  stage({ exportKey: null }); // S is handled below so the PNG leaves the controls out
  textFont('sans-serif');
}

function draw() {
  hits = [];
  background(BG);
  drawLetter('A');
  if (showUI) {
    drawFrame();
    drawPanel();
  }
  updateCursor();
}

/* ---------- letter ---------- */

// The box the letter fills, centred on MID.
function letterBox() {
  return { x: MID.x - S.w / 2, y: MID.y - S.h / 2, w: S.w, h: S.h };
}

// Each dot's rectangle. Dots share the box after the gaps are taken out.
function cells() {
  const b = letterBox();
  const dw = Math.max(0, (b.w - S.gapX * (COLS - 1)) / COLS);
  const dh = Math.max(0, (b.h - S.gapY * (ROWS - 1)) / ROWS);
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push({ r, c, x: b.x + c * (dw + S.gapX), y: b.y + r * (dh + S.gapY), w: dw, h: dh });
    }
  }
  return out;
}

function drawLetter(ch) {
  const glyph = GLYPHS[ch];
  for (const d of cells()) {
    if (d.w <= 0 || d.h <= 0) continue;
    if (glyph[d.r][d.c] === '#') drawDot(d);
    else if (S.ghost && showUI) drawGhost(d);
  }
}

function drawDot(d) {
  const ctx = drawingContext;
  const r = Math.min(S.radius, d.w / 2, d.h / 2);
  if (S.fillOn) {
    ctx.fillStyle = S.fill;
    roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
    ctx.fill();
  }
  if (S.strokeOn && S.strokeW > 0) {
    ctx.save();
    ctx.strokeStyle = S.stroke;
    ctx.lineJoin = 'round';
    if (S.strokeAlign === 'center') {
      ctx.lineWidth = S.strokeW;
    } else {
      // Inside / outside: stroke twice as wide along the shape's edge and clip
      // away the half we don't want, like Figma's stroke alignment.
      ctx.lineWidth = S.strokeW * 2;
      ctx.beginPath();
      if (S.strokeAlign === 'outside') {
        const m = S.strokeW + 2;
        ctx.rect(d.x - m, d.y - m, d.w + m * 2, d.h + m * 2);
      }
      roundRectPath(ctx, d.x, d.y, d.w, d.h, r, true);
      ctx.clip('evenodd');
    }
    roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
    ctx.stroke();
    ctx.restore();
  }
}

function drawGhost(d) {
  const ctx = drawingContext;
  const r = Math.min(S.radius, d.w / 2, d.h / 2);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
  ctx.stroke();
  ctx.restore();
}

// Rounded rectangle path. keepPath = true adds to the current path (for clipping).
function roundRectPath(ctx, x, y, w, h, r, keepPath) {
  if (!keepPath) ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/* ---------- container frame + handles ---------- */

const SELECT = '#0d99ff';
const HANDLE = 22;

// Handles: sx/sy say which way a handle stretches (−1, 0, 1).
function handles() {
  const b = letterBox();
  const out = [];
  for (const sy of [-1, 0, 1]) {
    for (const sx of [-1, 0, 1]) {
      if (!sx && !sy) continue;
      out.push({ sx, sy, x: MID.x + sx * b.w / 2, y: MID.y + sy * b.h / 2 });
    }
  }
  return out;
}

function drawFrame() {
  const b = letterBox();
  noFill();
  stroke(SELECT);
  strokeWeight(2);
  rect(b.x, b.y, b.w, b.h);
  for (const h of handles()) {
    fill(255);
    stroke(SELECT);
    strokeWeight(3);
    rectMode(CENTER);
    rect(h.x, h.y, HANDLE, HANDLE);
    rectMode(CORNER);
    hits.push({ kind: 'handle', sx: h.sx, sy: h.sy, x: h.x - 34, y: h.y - 34, w: 68, h: 68 });
  }
  // Size readout under the box, like Figma's.
  const sizeTxt = `${fmt(S.w)} × ${fmt(S.h)}`;
  textSize(24);
  const tw = textWidth(sizeTxt) + 24;
  noStroke();
  fill(SELECT);
  rect(MID.x - tw / 2, b.y + b.h + 18, tw, 38, 6);
  fill(255);
  textAlign(CENTER, CENTER);
  text(sizeTxt, MID.x, b.y + b.h + 37);
}

/* ---------- control panel (drawn on the canvas) ---------- */

const PANEL = { x: 40, y: 1560, w: 1920, h: 400 };
const INK = '#e8e8e8';
const DIM = '#8a8a8a';
const LINE = '#3a3a3a';

let hits = [];    // clickable areas from the last frame
let drag = null;  // what the pointer is dragging

function drawPanel() {
  const p = PANEL;
  noStroke();
  fill(24, 24, 24, 235);
  rect(p.x, p.y, p.w, p.h, 24);
  stroke(LINE);
  strokeWeight(2);
  noFill();
  rect(p.x, p.y, p.w, p.h, 24);

  const colW = 580;
  const gutter = 60;
  const x0 = p.x + 50;
  const xs = [x0, x0 + colW + gutter, x0 + (colW + gutter) * 2];
  const ys = [p.y + 36, p.y + 120, p.y + 204, p.y + 288];

  // Column 1: fill and stroke
  toggleRow(xs[0], ys[0], colW, 'Fill', 'fillOn');
  swatchRow(xs[0], ys[1] + 8, 'fill', S.fillOn);
  toggleRow(xs[0], ys[2], colW, 'Stroke', 'strokeOn');
  segmented(xs[0], ys[3] + 6, colW, 'strokeAlign', ['outside', 'center', 'inside'], S.strokeOn);

  // Column 2: stroke width + colour, gaps
  slider(xs[1], ys[0], colW, 'Stroke width', 'strokeW', S.strokeOn);
  swatchRow(xs[1], ys[1] + 8, 'stroke', S.strokeOn);
  slider(xs[1], ys[2], colW, 'Gap X', 'gapX', true);
  slider(xs[1], ys[3], colW, 'Gap Y', 'gapY', true);

  // Column 3: radius, size, extras
  slider(xs[2], ys[0], colW, 'Corner radius', 'radius', true);
  slider(xs[2], ys[1], colW, 'Width', 'w', true);
  slider(xs[2], ys[2], colW, 'Height', 'h', true);
  button(xs[2], ys[3] + 6, 270, S.ghost ? 'Grid: on' : 'Grid: off', () => { S.ghost = !S.ghost; persist(); }, S.ghost);
  button(xs[2] + 310, ys[3] + 6, 270, 'Reset', () => { S = { ...DEFAULTS }; persist(); }, false);

  textAlign(RIGHT, BOTTOM);
  textSize(20);
  noStroke();
  fill(DIM);
  text('S save PNG · H hide controls · F fullscreen', p.x + p.w - 30, p.y - 14);
}

function label(x, y, txt, on = true) {
  noStroke();
  fill(on ? INK : DIM);
  textSize(26);
  textAlign(LEFT, CENTER);
  text(txt.toUpperCase(), x, y);
}

function toggleRow(x, y, w, name, key) {
  label(x, y + 22, name);
  const on = S[key];
  const tw = 96, th = 48;
  const tx = x + w - tw, ty = y;
  noStroke();
  fill(on ? SELECT : '#444');
  rect(tx, ty, tw, th, th / 2);
  fill(255);
  circle(on ? tx + tw - th / 2 : tx + th / 2, ty + th / 2, th - 12);
  hits.push({ kind: 'tap', x: x, y: ty - 8, w: w, h: th + 16, fn: () => { S[key] = !S[key]; persist(); } });
}

function swatchRow(x, y, key, enabled) {
  const size = 56, step = 78;
  SWATCHES.forEach((c, i) => {
    const sx = x + i * step;
    const picked = S[key].toLowerCase() === c;
    stroke(picked ? '#ffffff' : LINE);
    strokeWeight(picked ? 4 : 2);
    fill(enabled ? c : dimmed(c));
    rect(sx, y, size, size, 12);
    hits.push({ kind: 'tap', x: sx - 8, y: y - 8, w: size + 16, h: size + 16, fn: () => { S[key] = c; persist(); } });
  });
}

function segmented(x, y, w, key, options, enabled) {
  const h = 56;
  const segW = w / options.length;
  noStroke();
  fill('#333');
  rect(x, y, w, h, 12);
  options.forEach((o, i) => {
    const sx = x + i * segW;
    const on = S[key] === o;
    if (on) {
      fill(enabled ? SELECT : '#555');
      rect(sx + 4, y + 4, segW - 8, h - 8, 9);
    }
    fill(on ? '#fff' : enabled ? INK : DIM);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(o[0].toUpperCase() + o.slice(1), sx + segW / 2, y + h / 2 + 1);
    hits.push({ kind: 'tap', x: sx, y, w: segW, h, fn: () => { S[key] = o; persist(); } });
  });
}

function slider(x, y, w, name, key, enabled) {
  const [lo, hi] = RANGES[key];
  label(x, y + 14, name, enabled);
  textAlign(RIGHT, CENTER);
  fill(enabled ? INK : DIM);
  text(fmt(S[key]), x + w, y + 14);

  const ty = y + 56;
  const t = constrain((S[key] - lo) / (hi - lo), 0, 1);
  stroke('#444');
  strokeWeight(8);
  line(x, ty, x + w, ty);
  stroke(enabled ? SELECT : '#666');
  line(x, ty, x + w * t, ty);
  noStroke();
  fill(enabled ? '#fff' : '#888');
  circle(x + w * t, ty, 34);
  hits.push({ kind: 'slider', key, trackX: x, trackW: w, x: x - 20, y: y - 6, w: w + 40, h: 84 });
}

function button(x, y, w, txt, fn, on) {
  const h = 56;
  noStroke();
  fill(on ? SELECT : '#333');
  rect(x, y, w, h, 12);
  fill(on ? '#fff' : INK);
  textSize(24);
  textAlign(CENTER, CENTER);
  text(txt, x + w / 2, y + h / 2 + 1);
  hits.push({ kind: 'tap', x, y, w, h, fn });
}

function dimmed(c) {
  const col = color(c);
  return color(red(col), green(col), blue(col), 70);
}

function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}

/* ---------- pointer ---------- */

function hitAt(x, y) {
  // Last drawn is on top.
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h;
  }
  return null;
}

function mousePressed() {
  if (!showUI) return;
  const h = hitAt(mouseX, mouseY);
  if (!h) return;
  if (h.kind === 'tap') {
    h.fn();
  } else if (h.kind === 'slider') {
    drag = { kind: 'slider', key: h.key, trackX: h.trackX, trackW: h.trackW };
    dragSlider();
  } else if (h.kind === 'handle') {
    drag = { kind: 'handle', sx: h.sx, sy: h.sy };
    dragHandle();
  }
  return false;
}

function mouseDragged() {
  if (!drag) return;
  if (drag.kind === 'slider') dragSlider();
  if (drag.kind === 'handle') dragHandle();
  return false;
}

function mouseReleased() {
  if (drag) persist();
  drag = null;
}

function dragSlider() {
  const [lo, hi] = RANGES[drag.key];
  const t = constrain((mouseX - drag.trackX) / drag.trackW, 0, 1);
  S[drag.key] = Math.round(lo + t * (hi - lo));
}

// The box stays centred, so a handle sets half the width / height.
function dragHandle() {
  if (drag.sx) S.w = Math.round(constrain(Math.abs(mouseX - MID.x) * 2, ...RANGES.w));
  if (drag.sy) S.h = Math.round(constrain(Math.abs(mouseY - MID.y) * 2, ...RANGES.h));
}

function updateCursor() {
  const target = drag || (showUI ? hitAt(mouseX, mouseY) : null);
  let c = 'default';
  if (target) {
    if (target.kind === 'handle') {
      c = target.sx && target.sy ? (target.sx === target.sy ? 'nwse-resize' : 'nesw-resize')
        : target.sx ? 'ew-resize' : 'ns-resize';
    } else if (target.kind === 'slider') c = 'ew-resize';
    else c = 'pointer';
  }
  cursor(c);
}

// Keep the page from scrolling or zooming while dragging on the canvas.
function touchMoved(e) {
  if (e && e.target && e.target.tagName === 'CANVAS') return false;
}

function keyPressed() {
  if (key === 'h' || key === 'H') showUI = !showUI;
  if (key === 's' || key === 'S') {
    // Draw once without the controls, save that, then carry on.
    const was = showUI;
    showUI = false;
    redraw();
    saveStage();
    showUI = was;
  }
}

/* ---------- saved settings ---------- */

// localStorage can throw (private mode, blocked storage): never let that break the sketch.
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function persist() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}
