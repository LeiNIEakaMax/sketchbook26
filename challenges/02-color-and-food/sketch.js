// Color and food
// Canvas is 2048×2048. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG (without the controls), F toggles fullscreen, H hides the
// controls, P switches Words / Percent.
//
// The upper line follows X, the lower line follows Y. The interactive area is
// the canvas minus a margin on every side (256px by default), split into 12
// equal bands each way. Outside the margin values clamp to the ends.
//
// Display: "Words" shows a zodiac sign (X) and a food (Y); "Percent" shows how
// far across the interactive area the pointer is, e.g. "X - 36%" / "Y - 74%".
// The 12×12 cell under the pointer sets the whole background colour, and the
// text is black or white, whichever has the higher WCAG contrast ratio.
// Colours fade from one cell to the next.
//
// Controls are built like Lateralus (challenge 01): the name on the left of
// the header, the Words / Percent switch in the middle, and a Control toggle on
// the right that shows or hides the square control panel at the bottom. While
// the pointer is over the header or the panel, the words and colour hold still.
//
// Input (touch devices only): "Drag" follows your finger; "Tilt" uses the
// phone's orientation (left/right tilt → X, forward/back tilt → Y), centred on
// however you were holding it when you switched Tilt on. Needs https.

// The 12 zodiac signs, in calendar order from the spring equinox.
const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const FOODS = [
  'Asparagus', 'Dumpling', 'Pistachio', 'Croissant', 'Mango', 'Ramen',
  'Artichoke', 'Tiramisu', 'Kimchi', 'Pretzel', 'Fig', 'Cornbread',
];

// 12×12 palette sampled from Max's color-grid-12x12.png: GRID[row][col].
// Column = X band, row = Y band (the same bands as the words).
const GRID = [
  ['#06155d', '#081964', '#092273', '#0b2877', '#0a2a7e', '#304772', '#485e74', '#063a83', '#5c3c67', '#4a5489', '#2f4a83', '#7f6181'],
  ['#041e41', '#576a98', '#443165', '#2c2761', '#43516c', '#f5e13e', '#deac42', '#13418c', '#83324d', '#c47ca1', '#d8a7c3', '#b57192'],
  ['#011604', '#d3ab94', '#8a4525', '#5b3a4b', '#314579', '#fde115', '#bd873c', '#093e81', '#a6394b', '#ce7c91', '#d499b5', '#cd7d96'],
  ['#878e21', '#cf9526', '#d98b41', '#e5961d', '#d3952d', '#613b41', '#3b3449', '#053b7d', '#072d80', '#18397c', '#10337a', '#09357f'],
  ['#95b889', '#e79f46', '#faa667', '#fb7e36', '#88542c', '#957c71', '#3c222c', '#868a58', '#fae21d', '#e2be2e', '#c8a93d', '#c19645'],
  ['#e4c777', '#daae1b', '#e56118', '#db6726', '#806a61', '#533c3b', '#8f8379', '#e4cf2d', '#fcdd26', '#f7d129', '#d3a144', '#987a4c'],
  ['#edd72a', '#d9cdba', '#ccad9e', '#a17861', '#795a49', '#63453d', '#4a2a2f', '#ddc03a', '#7a904e', '#aaa844', '#c39b43', '#91754d'],
  ['#ecae61', '#611a11', '#fd8651', '#f5bfad', '#7d4933', '#150915', '#3d1a24', '#6a674f', '#8a9a65', '#739164', '#5c8061', '#9f7948'],
  ['#b99243', '#bf6f57', '#f7a388', '#ee9a8a', '#dd5f42', '#32191a', '#1d1222', '#5a4b40', '#55694a', '#5a664e', '#5a6c56', '#677565'],
  ['#e5c714', '#c4c505', '#f73932', '#f1917d', '#fe704f', '#aa4c3b', '#58383b', '#883434', '#f15941', '#a8354c', '#752952', '#a9a276'],
  ['#f1d30c', '#c8b10c', '#c6c87b', '#f16c41', '#ed7d4d', '#f59074', '#e1e0ce', '#a34351', '#fab682', '#d22a3f', '#735441', '#948f50'],
  ['#a38031', '#91900d', '#1d080b', '#6c463b', '#cec298', '#d8c9b1', '#814657', '#844660', '#923e50', '#c43943', '#682a49', '#75674b'],
];

const WHITE = '#ffffff';
const BLACK = '#000000';
const PLAIN_BG = '#131313'; // background when Color is off (the original Figma frame)

// Type, from the Figma frame (2048×2048), now 1:1 with the canvas.
// The 9 fonts from the Figma frame "fonts" (node 31:76071), in its reading
// order, self-hosted in fonts/ (licences in fonts/README.md). file: null = not added (falls back to
// a system serif and the panel says "missing").
const FONTS = [
  { name: 'Handjet', family: 'CC Handjet', file: 'Handjet-Regular.woff2' },
  { name: 'LT Remark', family: 'CC LT Remark', file: 'LTRemark-Regular.otf' },
  { name: 'Manufacturing Consent', family: 'CC Manufacturing Consent', file: 'ManufacturingConsent-Regular.woff2' },
  { name: 'Inconsolata', family: 'CC Inconsolata', file: 'Inconsolata-ExtraCondensedBold.woff2' },
  { name: 'Sprat', family: 'CC Sprat', file: 'Sprat-Regular.woff2' },
  { name: 'Velvelyne', family: 'CC Velvelyne', file: 'Velvelyne-Regular.woff2' },
  { name: 'bianzhidai', family: 'CC bianzhidai', file: 'local/bianzhidai-Base.otf' }, // local only, see fonts/README.md
  { name: 'College', family: 'CC College', file: 'College-Regular.ttf' },
  { name: 'CirrusCumulus', family: 'CC CirrusCumulus', file: 'CirrusCumulus.woff' },
];
const fontReady = FONTS.map(() => false);

// Load every font with the FontFace API so a missing file just marks it missing.
function loadFonts() {
  FONTS.forEach((f, i) => {
    if (!f.file) return;
    const face = new FontFace(f.family, `url(fonts/${f.file})`);
    face.load().then((ok) => { document.fonts.add(ok); fontReady[i] = true; }).catch(() => {});
  });
}

function currentFont() {
  // Just the family name: p5 quotes it itself, so a fallback list would break it.
  // A font that isn't loaded draws in the browser's default face.
  return (FONTS[S.font] || FONTS[1]).family;
}
const TEXT_MID = (707.45 + 1027.55) / 2 + 263 / 2; // halfway between the two lines (999)

// Defaults = Max's chosen settings (2026-11-22). Reset returns to these.
const DEFAULTS = {
  display: 'words',   // 'words' | 'percent'
  font: 1,            // index into FONTS (1 = LT Remark)
  color: true,        // background follows the colour grid
  fade: 1810,         // ms for a colour change
  size: 246,          // font size, px (Figma had 219)
  lineGap: 154,       // distance between the two lines' centres (Figma had 320)
  margin: 361,        // dead zone round the interactive area (Figma had 256)
  grid: true,         // show the 12×12 bands
  panel: true,        // show the control panel
};

// [min, max, step]
const RANGES = {
  fade: [0, 2000, 10],
  size: [60, 400, 1],
  lineGap: [100, 700, 1],
  font: [0, FONTS.length - 1, 1],
  margin: [0, 600, 1],
};

const UNITS = { fade: ' ms', size: ' px', lineGap: ' px', margin: ' px' };

// Tilt: degrees either side of the starting pose that cover the whole area.
const TILT_RANGE = 25;
const TILT_EASE = 0.2;
const CAN_TILT = (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  && 'DeviceOrientationEvent' in window;

const PREF_KEY = 'cc02.settings.2048'; // new key: sizes changed with the 2048 canvas
let S = loadSettings();
let showUI = true;

const state = {
  input: 'drag',                          // 'drag' | 'tilt'
  tilt: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 }, // eased canvas position
  tiltTarget: null,
  tiltZero: null,                         // { beta, gamma } at switch-on
  held: { x: 0, y: 0 },                   // last pointer position outside the controls
  pendingInput: null,                     // set on tap, applied on the click that follows
};

/* ---------- bands ---------- */

// 0..1 across the interactive area, clamped.
function unit(v) {
  const span = Math.max(STAGE_SIZE - S.margin * 2, 1);
  return constrain((v - S.margin) / span, 0, 1);
}

// Which item a coordinate falls on: equal bands across the area, clamped.
function band(v, count) {
  return Math.min(Math.floor(unit(v) * count), count - 1);
}

// Where the words read from. Over the header or panel, keep the last position
// so using a control doesn't change the words or colour.
function pointer() {
  if (state.input === 'tilt') return state.tilt;
  if (!(showUI && overControls(uiX(), uiY()))) state.held = { x: mouseX, y: mouseY };
  return state.held;
}

function overControls(x, y) {
  if (y < TOP.y + TOP.h) return true;
  return S.panel && inside(x, y, panelRect(), 0);
}

/* ---------- p5 ---------- */

function setup() {
  stage({ exportKey: null }); // S is handled below so the PNG leaves the controls out
  noStroke();
  // Canvas text only uses a web font once it has loaded.
  try {
    loadFonts();
    document.fonts.load(`21px "${MONO}"`);
  } catch (e) { /* falls back */ }
  // iOS only lets a tap's click event ask for motion access, so Tilt waits for it.
  document.querySelector('canvas').addEventListener('click', () => {
    if (state.pendingInput) { setInput(state.pendingInput); state.pendingInput = null; }
  });
}

function draw() {
  hits = [];
  if (state.input === 'tilt' && state.tiltTarget) {
    state.tilt.x = lerp(state.tilt.x, state.tiltTarget.x, TILT_EASE);
    state.tilt.y = lerp(state.tilt.y, state.tiltTarget.y, TILT_EASE);
  }
  const { x, y } = pointer();
  const upper = S.display === 'percent' ? `X - ${Math.round(unit(x) * 100)}%` : SIGNS[band(x, SIGNS.length)];
  const lower = S.display === 'percent' ? `Y - ${Math.round(unit(y) * 100)}%` : FOODS[band(y, FOODS.length)];

  const target = S.color ? GRID[band(y, GRID.length)][band(x, GRID[0].length)] : PLAIN_BG;
  const { bg, ink } = easeColours(target, inkFor(target));
  background(bg);
  syncPage(bg, ink);
  if (S.grid && showUI) drawBands(ink);

  noStroke();
  fill(ink);
  textFont(currentFont());
  textSize(S.size);
  textAlign(CENTER, CENTER);
  text(upper, width / 2, TEXT_MID - S.lineGap / 2);
  text(lower, width / 2, TEXT_MID + S.lineGap / 2);

  if (showUI) {
    // The controls are laid out on a 2000 grid (as in Lateralus) and scaled up.
    push();
    scale(UI);
    drawTopBar(ink);
    if (S.panel) drawPanel();
    pop();
  }
  updateCursor();
}

// The 12×12 bands and the margin, faintly.
function drawBands(ink) {
  const m = S.margin, span = STAGE_SIZE - m * 2;
  const c = color(ink);
  c.setAlpha(60);
  stroke(c);
  strokeWeight(2);
  noFill();
  for (let i = 0; i <= 12; i++) {
    const v = m + (span * i) / 12;
    line(v, m, v, m + span);
    line(m, v, m + span, v);
  }
}

/* ---------- colour + contrast ---------- */

// WCAG 2 relative luminance of a #rrggbb colour.
function luminance(h) {
  const [r, g, b] = toRgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

// White or black text, whichever has the higher contrast ratio on bg.
function inkFor(bg) {
  return contrast(bg, WHITE) >= contrast(bg, BLACK) ? WHITE : BLACK;
}

// Ease the shown background and text colours toward their targets, frame-rate
// independent (exponential smoothing in RGB). Fade 0 or reduced motion = instant.
const shown = { bg: null, ink: null };
function easeColours(bgTarget, inkTarget) {
  const tb = toRgb(bgTarget), ti = toRgb(inkTarget);
  if (!shown.bg || reduceMotion || S.fade <= 0) {
    shown.bg = tb; shown.ink = ti;
  } else {
    const k = 1 - Math.exp(-deltaTime / (S.fade / 3));
    shown.bg = shown.bg.map((c, i) => c + (tb[i] - c) * k);
    shown.ink = shown.ink.map((c, i) => c + (ti[i] - c) * k);
  }
  return { bg: toHex(shown.bg), ink: toHex(shown.ink) };
}

// (Not called hex / rgb: p5 has global functions with those names.)
function toRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function toHex(c) {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// The page around the canvas and the back link follow the same colours.
let lastBg = null, lastInk = null;
function syncPage(bg, ink) {
  if (bg === lastBg && ink === lastInk) return;
  lastBg = bg; lastInk = ink;
  const root = document.documentElement.style;
  root.setProperty('--bg', bg);
  root.setProperty('--ink', ink);
}

/* ---------- interface tokens (as in Lateralus) ---------- */

// Controls are laid out in a 2000×2000 space and scaled to the canvas.
const UI = STAGE_SIZE / 2000;
function uiX() { return mouseX / UI; }
function uiY() { return mouseY / UI; }

const ACTIVE = '#ffffff';    // selected segment, on button, toggle on, slider fill
const ON_ACTIVE = '#333333'; // text drawn on ACTIVE
const MONO = 'JetBrains Mono';
const UI_FONT = 'sans-serif';
const INK = '#e8e8e8';
const DIM = '#8a8a8a';
const LINE = '#3a3a3a';
const PANEL_BG = '#242424';

/* ---------- top bar (drawn on the canvas) ---------- */

const TOP = { y: 40, h: 138 };

// Header: the name on the left, Words / Percent in the middle, the panel toggle
// on the right. It sits on the changing background, so its text uses the ink.
function drawTopBar(ink) {
  const mid = TOP.y + 62;
  const soft = color(ink);
  soft.setAlpha(170);
  noStroke();
  textFont(UI_FONT);
  fill(soft);
  textSize(24);
  textAlign(LEFT, CENTER);
  text('COLOR AND FOOD', 60, mid);

  segmented(845, mid - 28, 310, 'display', ['words', 'percent'], true);

  const tx = 1940 - 96;
  fill(ink);
  textSize(26);
  textAlign(RIGHT, CENTER);
  text('Control', tx - 20, mid);
  toggleSwitch(tx, mid - 24, S.panel);
  hits.push({ kind: 'tap', x: tx - 140, y: mid - 32, w: 236, h: 64, fn: () => { S.panel = !S.panel; persist(); } });

  soft.setAlpha(70);
  stroke(soft);
  strokeWeight(2);
  line(60, TOP.y + TOP.h, 1940, TOP.y + TOP.h);
}

/* ---------- control panel (drawn on the canvas) ---------- */

function panelRect() {
  return { x: 40, y: 1513, w: 1920, h: 459 }; // top row: Font
}

let hits = [];    // clickable areas from the last frame
let drag = null;  // what the pointer is dragging

function drawPanel() {
  const p = panelRect();
  noStroke();
  fill(PANEL_BG); // opaque, so the changing background doesn't tint it
  rect(p.x, p.y, p.w, p.h);
  stroke(LINE);
  strokeWeight(2);
  noFill();
  rect(p.x, p.y, p.w, p.h);
  // Swallow clicks on the panel's empty space.
  hits.push({ kind: 'panel', x: p.x, y: p.y, w: p.w, h: p.h });

  const colW = 410;
  const gutter = 60;
  const x0 = p.x + 52;
  const xs = [0, 1, 2, 3].map((i) => x0 + (colW + gutter) * i);

  // Top row: the font, a stepped slider (one stop per font) as wide as two columns.
  slider(xs[0], p.y + 38, colW * 2 + gutter, 'Font', 'font', true);
  stroke(LINE);
  strokeWeight(2);
  line(x0, p.y + 136, x0 + colW * 4 + gutter * 3, p.y + 136);

  const ys = [p.y + 161, p.y + 245];

  // Column 1: colour
  toggleRow(xs[0], ys[0], colW, 'Color', 'color');
  slider(xs[0], ys[1], colW, 'Fade', 'fade', S.color);

  // Column 2: type
  slider(xs[1], ys[0], colW, 'Font size', 'size', true);
  slider(xs[1], ys[1], colW, 'Line gap', 'lineGap', true);

  // Column 3: the interactive area and input
  slider(xs[2], ys[0], colW, 'Margin', 'margin', true);
  label(xs[2], ys[1] + 14, 'Input', CAN_TILT);
  inputSwitch(xs[2] + 130, ys[1] - 2, colW - 130);

  // Column 4: grid + reset
  button(xs[3], ys[0] + 2, colW, S.grid ? 'Grid: on' : 'Grid: off', () => { S.grid = !S.grid; persist(); }, S.grid);
  button(xs[3], ys[1] + 2, colW, 'Reset', resetSettings, false);

  drawShortcuts(x0, p.y + 377);
}

// Drag / Tilt. Only live on touch devices; Tilt is applied on the tap's click
// event because iOS only lets that ask for motion access.
function inputSwitch(x, y, w) {
  const h = 56, opts = ['drag', 'tilt'], segW = w / 2;
  noStroke();
  fill('#333');
  rect(x, y, w, h);
  opts.forEach((o, i) => {
    const sx = x + i * segW;
    const on = state.input === o;
    if (on) {
      fill(CAN_TILT ? ACTIVE : '#555');
      rect(sx + 4, y + 4, segW - 8, h - 8);
    }
    fill(on ? (CAN_TILT ? ON_ACTIVE : INK) : CAN_TILT ? INK : DIM);
    textFont(UI_FONT);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(o[0].toUpperCase() + o.slice(1), sx + segW / 2, y + h / 2 + 1);
    if (CAN_TILT) hits.push({ kind: 'tap', x: sx, y, w: segW, h, fn: () => { state.pendingInput = o; } });
  });
}

// Keyboard shortcuts as little key caps.
function drawShortcuts(x, y) {
  const keys = [['Scroll', 'font'], ['P', 'words / percent'], ['S', 'save PNG'], ['H', 'hide UI'], ['F', 'fullscreen']];
  textSize(20);
  for (const [k, what] of keys) {
    textFont(MONO);
    const kw = Math.max(34, textWidth(k) + 18); // wider caps for words like "Scroll"
    noStroke();
    fill('#555');
    rect(x + 2, y + 2, kw, 35);          // the key's shadow
    fill(PANEL_BG);
    stroke(DIM);
    strokeWeight(2);
    rect(x, y, kw, 35);                  // the key
    noStroke();
    fill(INK);
    textAlign(CENTER, CENTER);
    text(k, x + kw / 2, y + 17);
    textFont(UI_FONT);
    fill(DIM);
    textAlign(LEFT, CENTER);
    text(what, x + kw + 11, y + 17);
    x += kw + 11 + textWidth(what) + 40;
  }
}

// Reset puts every setting back to the defaults and keeps the panel open.
function resetSettings() {
  S = { ...DEFAULTS, panel: S.panel };
  persist();
}

function label(x, y, txt, on = true) {
  noStroke();
  fill(on ? INK : DIM);
  textFont(UI_FONT);
  textSize(26);
  textAlign(LEFT, CENTER);
  text(txt.toUpperCase(), x, y);
}

function toggleRow(x, y, w, name, key) {
  label(x, y + 22, name);
  toggleSwitch(x + w - 96, y, S[key]);
  hits.push({ kind: 'tap', x: x, y: y - 8, w: w, h: 64, fn: () => { S[key] = !S[key]; persist(); } });
}

// Square 96×48 switch, with ON / OFF in the free side.
function toggleSwitch(tx, ty, on) {
  const tw = 96, th = 48;
  noStroke();
  fill(on ? ACTIVE : '#444');
  rect(tx, ty, tw, th);
  fill(on ? '#444' : '#ffffff');
  rect(on ? tx + 54 : tx + 6, ty + 6, 36, 36);
  fill(on ? '#000000' : '#ffffff');
  textFont(MONO);
  textSize(21);
  textAlign(LEFT, CENTER);
  text(on ? 'ON' : 'OFF', on ? tx + 16 : tx + 48, ty + th / 2);
  textFont(UI_FONT);
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
    textFont(UI_FONT);
    textSize(24);
    textAlign(CENTER, CENTER);
    text(o[0].toUpperCase() + o.slice(1), sx + segW / 2, y + h / 2 + 1);
    hits.push({ kind: 'tap', x: sx, y, w: segW, h, fn: () => { S[key] = o; persist(); } });
  });
}

// Sliders that snap to stops and show a name instead of a number.
const STEPPED = { font: true };
function valueText(key) {
  if (key === 'font') {
    const i = S.font;
    return FONTS[i].name + (fontReady[i] ? '' : FONTS[i].file ? '  loading' : '  missing');
  }
  return fmt(S[key]) + (UNITS[key] || '');
}

function slider(x, y, w, name, key, enabled) {
  const [lo, hi] = RANGES[key];
  label(x, y + 14, name, enabled);
  textAlign(RIGHT, CENTER);
  fill(enabled ? INK : DIM);
  text(valueText(key), x + w, y + 14);

  const ty = y + 56;
  const t = constrain((S[key] - lo) / (hi - lo), 0, 1);
  noStroke();
  fill('#444');
  rect(x, ty - 4, w, 8);
  fill(enabled ? ACTIVE : '#666');
  rect(x, ty - 4, w * t, 8);
  if (STEPPED[key]) {
    // A tick at every stop.
    const n = Math.round((hi - lo) / RANGES[key][2]);
    for (let i = 0; i <= n; i++) {
      const tx = x + (w * i) / n;
      fill(i / n <= t ? ACTIVE : '#666');
      rect(tx - 2, ty - 14, 4, 28);
    }
  }
  // Square knob that turns 135° into a diamond while the slider is hovered or dragged.
  const area = { x: x - 20, y: y - 6, w: w + 40, h: 84 };
  const hot = enabled && ((drag && drag.key === key) || (!drag && inside(uiX(), uiY(), area, 0)));
  const a = ease('knob:' + key, hot ? KNOB_HOVER_TURN : 0);
  fill(enabled ? '#ffffff' : '#888');
  push();
  translate(x + w * t, ty);
  rotate(radians(a));
  rect(-18, -18, 36, 36);
  pop();
  if (enabled) hits.push({ kind: 'slider', key, trackX: x, trackW: w, ...area });
}

// Hover animations: each value eases towards its target (instantly with reduced motion).
const KNOB_HOVER_TURN = 135; // degrees
const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const eased = {};
function ease(id, target) {
  const cur = eased[id] || 0;
  let next = reduceMotion ? target : cur + (target - cur) * 0.35;
  if (Math.abs(next - target) < 0.05) next = target;
  eased[id] = next;
  return next;
}

function button(x, y, w, txt, fn, on) {
  const h = 56;
  noStroke();
  fill(on ? ACTIVE : '#333');
  rect(x, y, w, h);
  fill(on ? ON_ACTIVE : INK);
  textFont(UI_FONT);
  textSize(24);
  textAlign(CENTER, CENTER);
  text(txt, x + w / 2, y + h / 2 + 1);
  hits.push({ kind: 'tap', x, y, w, h, fn });
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
  const h = hitAt(uiX(), uiY());
  if (!h) return;
  if (h.kind === 'tap') {
    h.fn();
  } else if (h.kind === 'slider') {
    drag = { kind: 'slider', key: h.key, trackX: h.trackX, trackW: h.trackW };
    dragSlider();
  }
  return false;
}

function mouseDragged() {
  if (!drag) return;
  dragSlider();
  return false;
}

function mouseReleased() {
  if (drag) persist();
  drag = null;
}

function dragSlider() {
  const [lo, hi, step] = RANGES[drag.key];
  const t = constrain((uiX() - drag.trackX) / drag.trackW, 0, 1);
  S[drag.key] = Number((Math.round((lo + t * (hi - lo)) / step) * step).toFixed(2));
}

function updateCursor() {
  const target = drag || (showUI ? hitAt(uiX(), uiY()) : null);
  let c = 'default';
  if (target) c = target.kind === 'slider' ? 'ew-resize' : target.kind === 'panel' ? 'default' : 'pointer';
  cursor(c);
}

// Keep the page from scrolling or zooming while dragging on the canvas.
function touchMoved(e) {
  if (e && e.target && e.target.tagName === 'CANVAS') return false;
}

// Scrolling steps through the fonts: one font per wheel notch.
//
// The browser reports scrolling as wheel events with a deltaY (positive = down).
// What one notch gives varies: about 100px in Chrome/Edge on Windows, 3 "lines"
// in Firefox (deltaMode 1), and on macOS anything from ~4 to 100+ px, often
// split over several events because of smooth scrolling and acceleration.
// Trackpads send a long stream of small deltas. So instead of "N px = 1 step":
//   - the first event after a pause is a notch: step once, straight away;
//   - while events keep coming (a fast roll or a trackpad swipe), step again
//     only every WHEEL_STEP_PX of travel and at most every WHEEL_MIN_MS.
const WHEEL_GAP_MS = 140;   // quiet time that ends a burst
const WHEEL_STEP_PX = 120;  // extra travel per extra step inside a burst
const WHEEL_MIN_MS = 90;    // never faster than this
const wheel = { last: 0, lastStep: 0, acc: 0, dir: 0 };
function mouseWheel(e) {
  const now = performance.now();
  // Normalise to pixels (Firefox can report lines or pages).
  const px = e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1);
  if (!px) return false;
  const dir = Math.sign(px);
  const fresh = now - wheel.last > WHEEL_GAP_MS || dir !== wheel.dir;
  wheel.last = now;
  wheel.dir = dir;
  if (fresh) {
    wheel.acc = 0;
    stepFont(dir);
    wheel.lastStep = now;
  } else {
    wheel.acc += px;
    if (Math.abs(wheel.acc) >= WHEEL_STEP_PX && now - wheel.lastStep >= WHEEL_MIN_MS) {
      wheel.acc -= dir * WHEEL_STEP_PX;
      stepFont(dir);
      wheel.lastStep = now;
    }
  }
  return false; // don't scroll the page
}

function stepFont(dir) {
  S.font = (S.font + dir + FONTS.length) % FONTS.length;
  persist();
}

function keyPressed() {
  if (key === 'p' || key === 'P') { S.display = S.display === 'words' ? 'percent' : 'words'; persist(); }
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

/* ---------- tilt ---------- */

async function setInput(mode) {
  note('');
  if (mode === state.input) return;
  if (mode === 'tilt') {
    if (!window.isSecureContext) {
      note('Tilt needs an https:// page. Open the GitHub Pages link or an HTTPS tunnel.');
      return;
    }
    // iOS 13+: must be asked from a tap, and the answer sticks for this site.
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') {
          note('Motion access was declined. Allow it in Safari settings for this site.');
          return;
        }
      } catch (err) {
        note('Could not ask for motion access.');
        return;
      }
    }
    state.tiltZero = null; // recentre on the next reading
    state.tilt = { ...state.held };
    window.addEventListener('deviceorientation', onOrient);
  } else {
    window.removeEventListener('deviceorientation', onOrient);
    state.tiltTarget = null;
  }
  state.input = mode;
}

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  if (!state.tiltZero) state.tiltZero = { beta: e.beta, gamma: e.gamma };
  const dx = e.gamma - state.tiltZero.gamma; // left/right
  const dy = e.beta - state.tiltZero.beta;   // forward/back
  const lo = S.margin, hi = STAGE_SIZE - S.margin;
  state.tiltTarget = {
    x: map(constrain(dx, -TILT_RANGE, TILT_RANGE), -TILT_RANGE, TILT_RANGE, lo, hi),
    y: map(constrain(dy, -TILT_RANGE, TILT_RANGE), -TILT_RANGE, TILT_RANGE, lo, hi),
  };
}

function note(msg) {
  document.getElementById('note').textContent = msg;
}

/* ---------- saved settings ---------- */

// localStorage can throw (private mode, blocked storage): never let that break the sketch.
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    // Keep Words/Percent from earlier versions; sizes start fresh at 2048.
    const prev = JSON.parse(localStorage.getItem('cc02.settings') || '{}');
    const old = prev.display || localStorage.getItem('cc02.display');
    if (old && !saved.display) saved.display = old;
    return { ...DEFAULTS, ...saved };
  } catch (e) {
    return { ...DEFAULTS };
  }
}

function persist() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
}
