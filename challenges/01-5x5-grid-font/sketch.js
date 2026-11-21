// 5x5 grid font
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG (without the controls), F toggles fullscreen, H hides the controls
// (these keys are ignored while you are typing in the Type view).
//
// Three views, picked top left:
//   Letter: one glyph in its container box. Click it to show the box and its
//           handles, drag them to stretch it; click empty space to hide them.
//   All:    every glyph (A–Z, a–z, 0–9). Click one to open it in Letter.
//   Type:   a type tester. Type your own words; Enter makes a new line and long
//           lines wrap at spaces. Font size, letter spacing and line height on top.
//
// A glyph is a 5×5 grid of dots inside a container box. The dots always fill
// the box: each dot is (box size − 4 gaps) / 5 wide and tall. Every dot has a
// fill, an optional stroke (outside / center / inside, with a width), a corner
// radius and a rotation (0–360°, about each dot's centre, counterclockwise like
// Figma). Gaps are set separately for X and Y.
//
// The Letter view is the master: its box size, gaps, radius and stroke are the
// design at 1:1. All and Type draw the same design scaled to the font size
// (font size = glyph height), so a wider box makes a wider font.
//
// Glyphs come from the Figma frame "5×5 masters — Aa–Zz and 0–9" (file cc2026,
// node 9:958). Defaults come from "5×5 / Letters / A": 252.28×300 box, 9px gaps,
// 15px radius, #d2d2d2 fill and a 6px inside stroke of the same colour, on #242424.

/* ---------- glyphs ---------- */

// '#' = lit dot, '.' = empty cell. Rows top to bottom.
const GLYPHS = {
  A: ['..#..', '.#.#.', '#...#', '#####', '#...#'],
  a: ['.##..', '...#.', '.###.', '#..##', '.##.#'],
  B: ['####.', '#...#', '####.', '#...#', '####.'],
  b: ['.#...', '#....', '####.', '#...#', '####.'],
  C: ['.####', '#...#', '#....', '#...#', '.###.'],
  c: ['..##.', '.#..#', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '####.'],
  d: ['....#', '....#', '.####', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#####'],
  e: ['..###', '.#..#', '#.##.', '#....', '.###.'],
  F: ['#####', '#....', '####.', '#....', '#....'],
  f: ['..###', '..#..', '#####', '..#..', '##...'],
  G: ['.####', '#....', '#.###', '#...#', '.###.'],
  g: ['..##.', '.#..#', '..###', '#...#', '.###.'],
  H: ['#...#', '#...#', '#####', '#...#', '#...#'],
  h: ['.#...', '#....', '###..', '#..#.', '#..##'],
  I: ['#####', '..#..', '..#..', '..#..', '#####'],
  i: ['..#..', '.....', '.##..', '..#..', '..##.'],
  J: ['#####', '...#.', '...#.', '#..#.', '.##..'],
  j: ['..#..', '..##.', '..#..', '#.#..', '.##..'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#'],
  k: ['#....', '#.##.', '##...', '#.#..', '#..##'],
  L: ['#....', '#....', '#....', '#...#', '####.'],
  l: ['..#..', '..#..', '.##..', '#.#.#', '..##.'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  m: ['#....', '.#.#.', '#.#.#', '#.#.#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#'],
  n: ['#....', '.##..', '#..#.', '#..#.', '#..##'],
  O: ['.###.', '#...#', '#...#', '#...#', '.###.'],
  o: ['..##.', '.#..#', '#...#', '#..#.', '.##..'],
  P: ['####.', '#...#', '####.', '#....', '#....'],
  p: ['..##.', '.#..#', '.###.', '.#...', '##...'],
  Q: ['.###.', '#...#', '#...#', '#..#.', '.##.#'],
  q: ['.##..', '#..#.', '.###.', '...#.', '...##'],
  R: ['####.', '#...#', '####.', '#..#.', '#...#'],
  r: ['#.##.', '.##.#', '..#..', '..#..', '..#..'],
  S: ['.####', '#....', '#####', '....#', '####.'],
  s: ['.##..', '#....', '.###.', '....#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..'],
  t: ['..#..', '.####', '#.#..', '..#.#', '..##.'],
  U: ['#...#', '#...#', '#...#', '#...#', '.###.'],
  u: ['#..#.', '.#.#.', '.#.#.', '.#.#.', '.##.#'],
  V: ['#...#', '#...#', '#...#', '.#.#.', '..#..'],
  v: ['#..#.', '.#..#', '.#.#.', '.#.#.', '.##..'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  w: ['...#.', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  X: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  x: ['.#..#', '#.##.', '..#..', '.##.#', '#..#.'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..'],
  y: ['#..#.', '.#.#.', '.###.', '....#', '..##.'],
  Z: ['#####', '...#.', '..#..', '.#...', '#####'],
  z: ['.###.', '#..#.', '..#..', '.#..#', '####.'],
  '0': ['.###.', '#..##', '#.#.#', '##..#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '#####'],
  '2': ['.###.', '#...#', '..##.', '.#...', '#####'],
  '3': ['####.', '....#', '.###.', '....#', '####.'],
  '4': ['#..#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '####.'],
  '6': ['.####', '#....', '####.', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..'],
  '8': ['.###.', '#...#', '.###.', '#...#', '.###.'],
  '9': ['.###.', '#...#', '.####', '....#', '####.'],};

// The order used by the All view: one row per line below.
const ALL_ROWS = ['ABCDEFGHIJKLM', 'NOPQRSTUVWXYZ', 'abcdefghijklm', 'nopqrstuvwxyz', '0123456789'];
const COLS = 5;
const ROWS = 5;

/* ---------- settings ---------- */

const BG = '#242424';
const MID = { x: 1000, y: 1000 }; // the Letter view's centre, as in Figma

const DEFAULTS = {
  // dot design (master, at 1:1 in the Letter view)
  w: 252.28,
  h: 300,
  gapX: 9,
  gapY: 9,
  radius: 15,
  rotation: 0,           // degrees, Figma-style: positive turns counterclockwise
  fillOn: true,
  fill: '#d2d2d2',
  strokeOn: true,
  stroke: '#d2d2d2',
  strokeAlign: 'inside', // 'outside' | 'center' | 'inside'
  strokeW: 6,
  ghost: false,          // show the empty cells faintly
  // views
  view: 'letter',        // 'letter' | 'all' | 'type'
  letter: 'A',
  panel: true,           // show the dot style panel at the bottom
  // type tester
  size: 160,             // font size = glyph height in canvas px
  tracking: 32,          // letter spacing in master px (Figma's pairs sit 32px apart)
  leading: 1.3,          // line height, × font size
};

// [min, max, step]
const RANGES = {
  w: [20, 1800, 1],
  h: [20, 1100, 1],
  gapX: [0, 120, 1],
  gapY: [0, 120, 1],
  radius: [0, 200, 1],
  rotation: [0, 360, 1],
  strokeW: [0, 40, 1],
  size: [20, 600, 1],
  tracking: [-100, 300, 1],
  leading: [0.8, 3, 0.05],
};

const DEFAULT_TEXT = 'Lateralus\nthe quick brown fox jumps over the lazy dog 0123456789';

const SWATCHES = ['#d2d2d2', '#ffffff', '#ff5a36', '#ffd23f', '#3dd68c', '#3d7bff', '#111111'];

const PREF_KEY = 'cc01.settings';
const TEXT_KEY = 'cc01.text';
let S = loadSettings();
let TEXT = loadText();
let showUI = true;
let selected = false; // the Letter view's bounding box + handles show only while selected
let ta;               // hidden textarea that takes the typing (works with phone keyboards too)

/* ---------- p5 ---------- */

function setup() {
  stage({ exportKey: null }); // S is handled below so the PNG leaves the controls out
  textFont('sans-serif');
  frameRate(30);
  try { document.fonts.load(`21px "${MONO}"`); } catch (e) { /* falls back to the default font */ }
  setupTextarea();
}

function draw() {
  hits = [];
  background(BG);
  if (S.view === 'letter') drawLetterView();
  else if (S.view === 'all') drawAllView(contentArea());
  else drawTypeView(contentArea());
  if (showUI) {
    if (S.view === 'letter' && selected) drawFrame();
    drawTopBar();
    if (S.panel) drawPanel();
  }
  updateCursor();
}

// Where All and Type draw: under the top bar, above the style panel if it's open.
function contentArea() {
  const top = TOP.y + TOP.h + 50;
  const bottom = S.panel ? PANEL.y - 40 : 1950;
  return { x: 80, y: top, w: 1840, h: bottom - top };
}

/* ---------- glyph drawing ---------- */

// The dot design at a scale (1 = the Letter view's master size).
function styleAt(scale) {
  return {
    w: S.w * scale, h: S.h * scale,
    gx: S.gapX * scale, gy: S.gapY * scale,
    r: S.radius * scale, sw: S.strokeW * scale,
  };
}

// Each dot's rectangle in a glyph box at (x, y). Dots share the box after the gaps are taken out.
function cellsAt(x, y, st) {
  const dw = Math.max(0, (st.w - st.gx * (COLS - 1)) / COLS);
  const dh = Math.max(0, (st.h - st.gy * (ROWS - 1)) / ROWS);
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push({ r, c, x: x + c * (dw + st.gx), y: y + r * (dh + st.gy), w: dw, h: dh });
    }
  }
  return out;
}

function drawGlyph(ch, x, y, scale, ghostEmpty) {
  const st = styleAt(scale);
  const glyph = GLYPHS[ch];
  if (!glyph) return drawMissing(x, y, st);
  for (const d of cellsAt(x, y, st)) {
    if (d.w <= 0 || d.h <= 0) continue;
    if (glyph[d.r][d.c] === '#') drawDot(d, st);
    else if (ghostEmpty) drawGhost(d, st);
  }
}

function drawDot(d, st) {
  const ctx = drawingContext;
  const r = Math.min(st.r, d.w / 2, d.h / 2);
  ctx.save();
  rotateAboutCentre(ctx, d);
  if (S.fillOn) {
    ctx.fillStyle = S.fill;
    roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
    ctx.fill();
  }
  if (S.strokeOn && st.sw > 0) {
    ctx.save();
    ctx.strokeStyle = S.stroke;
    ctx.lineJoin = 'round';
    if (S.strokeAlign === 'center') {
      ctx.lineWidth = st.sw;
    } else {
      // Inside / outside: stroke twice as wide along the shape's edge and clip
      // away the half we don't want, like Figma's stroke alignment.
      ctx.lineWidth = st.sw * 2;
      ctx.beginPath();
      if (S.strokeAlign === 'outside') {
        const m = st.sw + 2;
        ctx.rect(d.x - m, d.y - m, d.w + m * 2, d.h + m * 2);
      }
      roundRectPath(ctx, d.x, d.y, d.w, d.h, r, true);
      ctx.clip('evenodd');
    }
    roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Rotation as in Figma: each dot turns about its own centre, and a positive
// angle turns it counterclockwise. The dot keeps its size; only its corners move.
function rotateAboutCentre(ctx, d) {
  if (!S.rotation) return;
  const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate(-S.rotation * Math.PI / 180);
  ctx.translate(-cx, -cy);
}

function drawGhost(d, st) {
  const ctx = drawingContext;
  const r = Math.min(st.r, d.w / 2, d.h / 2);
  ctx.save();
  rotateAboutCentre(ctx, d);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  roundRectPath(ctx, d.x, d.y, d.w, d.h, r);
  ctx.stroke();
  ctx.restore();
}

// A character the font doesn't have yet (punctuation etc.): a dashed box.
function drawMissing(x, y, st) {
  if (!showUI) return;
  const ctx = drawingContext;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = Math.max(1, st.h / 100);
  ctx.setLineDash([st.h / 30, st.h / 30]);
  roundRectPath(ctx, x, y, st.w, st.h, Math.min(st.r, st.w / 2));
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

/* ---------- Letter view ---------- */

// The box the letter fills, centred on MID.
function letterBox() {
  return { x: MID.x - S.w / 2, y: MID.y - S.h / 2, w: S.w, h: S.h };
}

function drawLetterView() {
  const b = letterBox();
  drawGlyph(S.letter, b.x, b.y, 1, S.ghost && showUI);
}

/* ---------- All view ---------- */

function drawAllView(area) {
  const cols = Math.max(...ALL_ROWS.map((r) => r.length));
  const pitchX = area.w / cols;
  const pitchY = area.h / ALL_ROWS.length;
  const aspect = S.w / S.h;
  const labelH = 34;
  const gh = Math.min((pitchY - labelH) * 0.82, (pitchX * 0.78) / aspect);
  const scale = gh / S.h;
  const gw = S.w * scale;
  const hover = showUI ? hitAt(mouseX, mouseY) : null;

  ALL_ROWS.forEach((row, ri) => {
    [...row].forEach((ch, ci) => {
      const cx = area.x + ci * pitchX + pitchX / 2;
      const top = area.y + ri * pitchY + (pitchY - gh - labelH) / 2;
      const cell = { kind: 'glyph', ch, x: area.x + ci * pitchX, y: area.y + ri * pitchY, w: pitchX, h: pitchY };
      if (hover && hover.kind === 'glyph' && hover.ch === ch) {
        noStroke();
        fill(255, 14);
        rect(cell.x + 6, cell.y + 6, cell.w - 12, cell.h - 12);
      }
      drawGlyph(ch, cx - gw / 2, top, scale, S.ghost && showUI);
      if (showUI) {
        noStroke();
        fill(S.letter === ch ? ACTIVE : DIM);
        textSize(22);
        textAlign(CENTER, TOP);
        text(ch, cx, top + gh + 10);
      }
      hits.push(cell);
    });
  });
}

/* ---------- Type view ---------- */

// Lays the text out like a text box: Enter starts a new line, and words wrap
// at spaces when they would run past the right edge (a word longer than the
// whole line breaks between letters). caret[i] is where the caret sits before
// character i; caret[text.length] is the end.
function layoutText(txt, width, scale) {
  const gw = S.w * scale;
  const gh = S.h * scale;
  const tr = S.tracking * scale;
  const adv = gw + tr;
  const space = gw * 0.6 + tr;
  const lh = gh * S.leading;
  const glyphs = [];
  const caret = new Array(txt.length + 1);
  let x = 0, y = 0, i = 0;
  while (i < txt.length) {
    const ch = txt[i];
    if (ch === '\n') { caret[i] = { x, y }; x = 0; y += lh; i++; continue; }
    if (ch === ' ') { caret[i] = { x, y }; x += space; i++; continue; }
    let j = i;
    while (j < txt.length && txt[j] !== ' ' && txt[j] !== '\n') j++;
    const wordW = (j - i) * adv - tr;
    if (x > 0 && x + wordW > width) { x = 0; y += lh; }
    for (let k = i; k < j; k++) {
      if (x > 0 && x + gw > width) { x = 0; y += lh; }
      caret[k] = { x, y };
      glyphs.push({ ch: txt[k], x, y });
      x += adv;
    }
    i = j;
  }
  caret[txt.length] = { x, y };
  return { glyphs, caret, gw, gh, tr, lh };
}

function drawTypeView(area) {
  const scale = S.size / S.h;
  const L = layoutText(TEXT, area.w, scale);
  const typing = isTyping();
  const at = typing ? ta.selectionEnd : TEXT.length;
  const c = L.caret[Math.min(at, TEXT.length)];
  // Scroll so the caret's line stays in view.
  const scrollY = Math.max(0, c.y + L.gh - area.h);

  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x - 40, area.y - 20, area.w + 80, area.h + 40);
  ctx.clip();
  for (const g of L.glyphs) {
    const y = area.y + g.y - scrollY;
    if (y > area.y + area.h || y + L.gh < area.y) continue;
    drawGlyph(g.ch, area.x + g.x, y, scale, false);
  }
  if (showUI && typing && Math.floor(millis() / 530) % 2 === 0) {
    const cx = area.x + c.x - (c.x > 0 ? Math.max(L.tr, 0) / 2 : 0) - 2;
    noStroke();
    fill('#ffffff');
    rect(cx, area.y + c.y - scrollY - L.gh * 0.08, 4, L.gh * 1.16);
  }
  ctx.restore();

  hits.push({ kind: 'type', x: area.x - 40, y: area.y - 20, w: area.w + 80, h: area.h + 40, layout: L, area, scrollY });
}

// Click in the text: focus the typing and put the caret at the nearest spot.
function placeCaret(h) {
  const { layout: L, area, scrollY } = h;
  const px = mouseX - area.x;
  const py = mouseY - area.y + scrollY;
  let best = TEXT.length, bestD = Infinity;
  L.caret.forEach((c, i) => {
    if (!c) return;
    const dy = py < c.y ? c.y - py : py > c.y + L.lh ? py - c.y - L.lh : 0;
    const d = dy * 1000 + Math.abs(px - c.x);
    if (d < bestD) { bestD = d; best = i; }
  });
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(best, best);
}

function setupTextarea() {
  ta = document.createElement('textarea');
  ta.value = TEXT;
  ta.setAttribute('aria-label', 'Type to test the font');
  ta.setAttribute('autocapitalize', 'off');
  ta.setAttribute('autocomplete', 'off');
  ta.setAttribute('autocorrect', 'off');
  ta.spellcheck = false;
  // Invisible but focusable; 16px stops iOS zooming in when it gets focus.
  Object.assign(ta.style, {
    position: 'fixed', left: '0', top: '0', width: '1px', height: '1px',
    opacity: '0', border: '0', padding: '0', resize: 'none', fontSize: '16px',
  });
  document.body.appendChild(ta);
  ta.addEventListener('input', () => { TEXT = ta.value; saveText(); });
}

function isTyping() {
  return ta && document.activeElement === ta;
}

/* ---------- container frame + handles (Letter view) ---------- */

// Interface tokens (from the Figma components, 2026-11-21: everything square,
// white as the active colour). Change ACTIVE to recolour every active state.
const ACTIVE = '#ffffff';    // selected segment, on button, toggle on, slider fill, selection box
const ON_ACTIVE = '#333333'; // text drawn on ACTIVE
const MONO = 'JetBrains Mono'; // toggle ON / OFF labels
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
  stroke(ACTIVE);
  strokeWeight(2);
  rect(b.x, b.y, b.w, b.h);
  for (const h of handles()) {
    fill(BG);
    stroke(ACTIVE);
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
  fill(ACTIVE);
  rect(MID.x - tw / 2, b.y + b.h + 18, tw, 38);
  fill(ON_ACTIVE);
  textAlign(CENTER, CENTER);
  text(sizeTxt, MID.x, b.y + b.h + 37);
}

/* ---------- top bar (drawn on the canvas) ---------- */

const TOP = { y: 40, h: 250 };
const INK = '#e8e8e8';
const DIM = '#8a8a8a';
const LINE = '#3a3a3a';

function drawTopBar() {
  const y = TOP.y;
  segmented(60, y + 16, 460, 'view', ['letter', 'all', 'type'], true);

  const mx = 600, mw = 900;
  if (S.view === 'type') {
    slider(mx, y, mw, 'Letter spacing', 'tracking', true);
    slider(mx, y + 80, mw, 'Line height', 'leading', true);
    slider(mx, y + 160, mw, 'Font size', 'size', true);
    note(60, y + 120, isTyping() ? 'Typing… Enter for a new line' : 'Click the text to type');
  } else if (S.view === 'all') {
    note(mx, y + 46, 'Click a glyph to edit it in Letter view.');
  } else {
    note(mx, y + 46, `Editing “${S.letter}”. Click it to stretch the box; pick another letter in All.`);
  }

  button(1580, y + 16, 360, S.panel ? 'Dot style: shown' : 'Dot style: hidden', () => { S.panel = !S.panel; persist(); }, S.panel);

  stroke(LINE);
  strokeWeight(2);
  line(60, y + TOP.h, 1940, y + TOP.h);

  textAlign(RIGHT, TOP);
  textSize(20);
  noStroke();
  fill(DIM);
  text('S save PNG · H hide controls · F fullscreen', 1940, y + 96);
}

function note(x, y, txt) {
  noStroke();
  fill(DIM);
  textSize(24);
  textAlign(LEFT, CENTER);
  text(txt, x, y);
}

/* ---------- dot style panel (drawn on the canvas) ---------- */

const PANEL = { x: 40, y: 1476, w: 1920, h: 484 };

let hits = [];    // clickable areas from the last frame
let drag = null;  // what the pointer is dragging

function drawPanel() {
  const p = PANEL;
  noStroke();
  fill(24, 24, 24, 235);
  rect(p.x, p.y, p.w, p.h);
  stroke(LINE);
  strokeWeight(2);
  noFill();
  rect(p.x, p.y, p.w, p.h);
  // Swallow clicks on the panel's empty space.
  hits.push({ kind: 'panel', x: p.x, y: p.y, w: p.w, h: p.h });

  const colW = 580;
  const gutter = 60;
  const x0 = p.x + 50;
  const xs = [x0, x0 + colW + gutter, x0 + (colW + gutter) * 2];
  const ys = [p.y + 36, p.y + 120, p.y + 204, p.y + 288, p.y + 372];

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

  // Column 3: radius, size, rotation, extras
  slider(xs[2], ys[0], colW, 'Corner radius', 'radius', true);
  slider(xs[2], ys[1], colW, 'Width', 'w', true);
  slider(xs[2], ys[2], colW, 'Height', 'h', true);
  slider(xs[2], ys[3], colW, 'Rotation', 'rotation', true);
  button(xs[2], ys[4] + 6, 270, S.ghost ? 'Grid: on' : 'Grid: off', () => { S.ghost = !S.ghost; persist(); }, S.ghost);
  button(xs[2] + 310, ys[4] + 6, 270, 'Reset', resetDesign, false);
}

// Reset puts the dot design back to the Figma defaults and keeps the view and type settings.
function resetDesign() {
  const keep = { view: S.view, letter: S.letter, panel: S.panel, size: S.size, tracking: S.tracking, leading: S.leading };
  S = { ...DEFAULTS, ...keep };
  persist();
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
  fill(on ? ACTIVE : '#444');
  rect(tx, ty, tw, th);
  // Square knob, with ON / OFF in the free side (as in Figma's UI / Toggle).
  fill(on ? '#444' : '#ffffff');
  rect(on ? tx + 54 : tx + 6, ty + 6, 36, 36);
  fill(on ? '#000000' : '#ffffff');
  textFont(MONO);
  textSize(21);
  textAlign(LEFT, CENTER);
  text(on ? 'ON' : 'OFF', on ? tx + 16 : tx + 48, ty + th / 2);
  textFont('sans-serif');
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
    // Lifts 12px while hovered. The hit area stays put so the swatch doesn't flicker.
    const area = { x: sx - 8, y: y - 8, w: size + 16, h: size + 16 };
    const hot = showUI && !drag && inside(mouseX, mouseY, area, 0);
    const lift = ease(`swatch:${key}:${c}`, hot ? SWATCH_HOVER_LIFT : 0);
    rect(sx, y - lift, size, size);
    hits.push({ kind: 'tap', ...area, fn: () => { S[key] = c; persist(); } });
  });
}

function segmented(x, y, w, key, options, enabled) {
  const h = 56;
  const segW = w / options.length;
  noStroke();
  fill('#333');
  rect(x, y, w, h);
  options.forEach((o, i) => {
    const sx = x + i * segW;
    const on = S[key] === o;
    if (on) {
      fill(enabled ? ACTIVE : '#555');
      rect(sx + 4, y + 4, segW - 8, h - 8);
    }
    fill(on ? (enabled ? ON_ACTIVE : INK) : enabled ? INK : DIM);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(o[0].toUpperCase() + o.slice(1), sx + segW / 2, y + h / 2 + 1);
    hits.push({ kind: 'tap', x: sx, y, w: segW, h, fn: () => setChoice(key, o) });
  });
}

function setChoice(key, value) {
  S[key] = value;
  if (key === 'view') {
    selected = false;
    // Open the keyboard straight away when switching to Type (this runs inside the tap).
    if (value === 'type') { ta.focus({ preventScroll: true }); ta.setSelectionRange(TEXT.length, TEXT.length); }
    else ta.blur();
  }
  persist();
}

function slider(x, y, w, name, key, enabled) {
  const [lo, hi] = RANGES[key];
  label(x, y + 14, name, enabled);
  textAlign(RIGHT, CENTER);
  fill(enabled ? INK : DIM);
  const unit = key === 'rotation' ? '°' : key === 'leading' ? '×' : key === 'size' ? ' px' : '';
  text(fmt(S[key]) + unit, x + w, y + 14);

  const ty = y + 56;
  const t = constrain((S[key] - lo) / (hi - lo), 0, 1);
  noStroke();
  fill('#444');
  rect(x, ty - 4, w, 8);
  fill(enabled ? ACTIVE : '#666');
  rect(x, ty - 4, w * t, 8);
  // Square knob that turns 135° into a diamond while the slider is hovered or dragged.
  const area = { x: x - 20, y: y - 6, w: w + 40, h: 84 };
  const hot = enabled && ((drag && drag.key === key) || (!drag && inside(mouseX, mouseY, area, 0)));
  const a = knobAngle(key, hot ? KNOB_HOVER_TURN : 0);
  fill(enabled ? '#ffffff' : '#888');
  push();
  translate(x + w * t, ty);
  rotate(radians(a));
  rect(-18, -18, 36, 36);
  pop();
  hits.push({ kind: 'slider', key, trackX: x, trackW: w, ...area });
}

// Each slider knob eases towards its target angle (instantly with reduced motion).
const KNOB_HOVER_TURN = 135; // degrees
const SWATCH_HOVER_LIFT = 12; // px
const knobAngles = {};
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function knobAngle(key, target) {
  return ease('knob:' + key, target, knobAngles, key);
}

// Hover animations: each value eases towards its target (instantly with reduced motion).
const eased = {};
function ease(id, target, store, storeKey) {
  const cur = eased[id] || 0;
  let next = reduceMotion ? target : cur + (target - cur) * 0.35;
  if (Math.abs(next - target) < 0.05) next = target;
  eased[id] = next;
  if (store) store[storeKey] = next;
  return next;
}

function button(x, y, w, txt, fn, on) {
  const h = 56;
  noStroke();
  fill(on ? ACTIVE : '#333');
  rect(x, y, w, h);
  fill(on ? ON_ACTIVE : INK);
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
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/* ---------- pointer ---------- */

function inside(x, y, r, pad) {
  return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
}

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
  if (!h) {
    ta.blur(); // a click on empty space stops typing
    // Letter view: click the letter to select it (shows the box), click empty space to deselect.
    if (S.view === 'letter') selected = inside(mouseX, mouseY, letterBox(), S.strokeOn ? S.strokeW : 0);
    return false;
  }
  if (h.kind === 'tap') {
    h.fn();
  } else if (h.kind === 'slider') {
    drag = { kind: 'slider', key: h.key, trackX: h.trackX, trackW: h.trackW };
    dragSlider();
  } else if (h.kind === 'handle') {
    drag = { kind: 'handle', sx: h.sx, sy: h.sy };
    dragHandle();
  } else if (h.kind === 'glyph') {
    S.letter = h.ch;
    setChoice('view', 'letter');
  } else if (h.kind === 'type') {
    placeCaret(h);
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
  const [lo, hi, step] = RANGES[drag.key];
  const t = constrain((mouseX - drag.trackX) / drag.trackW, 0, 1);
  S[drag.key] = Number((Math.round((lo + t * (hi - lo)) / step) * step).toFixed(2));
}

// The box stays centred, so a handle sets half the width / height.
function dragHandle() {
  if (drag.sx) S.w = Math.round(constrain(Math.abs(mouseX - MID.x) * 2, RANGES.w[0], RANGES.w[1]));
  if (drag.sy) S.h = Math.round(constrain(Math.abs(mouseY - MID.y) * 2, RANGES.h[0], RANGES.h[1]));
}

function updateCursor() {
  const target = drag || (showUI ? hitAt(mouseX, mouseY) : null);
  let c = 'default';
  if (target) {
    if (target.kind === 'handle') {
      c = target.sx && target.sy ? (target.sx === target.sy ? 'nwse-resize' : 'nesw-resize')
        : target.sx ? 'ew-resize' : 'ns-resize';
    } else if (target.kind === 'slider') c = 'ew-resize';
    else if (target.kind === 'type') c = 'text';
    else if (target.kind === 'panel') c = 'default';
    else c = 'pointer';
  }
  cursor(c);
}

// Keep the page from scrolling or zooming while dragging on the canvas.
function touchMoved(e) {
  if (e && e.target && e.target.tagName === 'CANVAS') return false;
}

function keyPressed() {
  if (isTyping()) return; // keys go to the text while typing
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
    const s = { ...DEFAULTS, ...saved };
    if (!GLYPHS[s.letter]) s.letter = 'A';
    return s;
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function persist() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}

function loadText() {
  try {
    const t = localStorage.getItem(TEXT_KEY);
    return t == null ? DEFAULT_TEXT : t;
  } catch (e) {
    return DEFAULT_TEXT;
  }
}

function saveText() {
  try { localStorage.setItem(TEXT_KEY, TEXT); } catch (e) { /* ignore */ }
}
