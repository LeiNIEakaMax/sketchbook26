// Color and food
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG, F toggles fullscreen, P switches Words / Percent.
//
// The upper line follows X, the lower line follows Y. The interactive area is
// the canvas minus a 256px margin on every side (1488×1488), split into equal
// bands, one per list item. Outside the margin values clamp to the ends.
//
// Display: "Words" shows a zodiac sign (X) and a food (Y); "Percent" shows how far
// across the interactive area the pointer is, e.g. "X - 36%" / "Y - 74%".
// Input (touch devices only): "Drag" follows your finger; "Tilt" uses the
// phone's orientation (left/right tilt → X, forward/back tilt → Y), centred
// on however you were holding it when you switched Tilt on.

// The 12 zodiac signs, in calendar order from the spring equinox.
const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

const FOODS = [
  'Asparagus', 'Dumpling', 'Pistachio', 'Croissant', 'Mango', 'Ramen',
  'Artichoke', 'Tiramisu', 'Kimchi', 'Pretzel', 'Fig', 'Cornbread',
];

const MARGIN = 256;
const SPAN = STAGE_SIZE - MARGIN * 2;

// From the Figma frame (2048×2048), scaled to the 2000 canvas.
const FIGMA = 2048;
const K = STAGE_SIZE / FIGMA;

// 12×12 palette sampled from Max's color-grid-12x12.png: GRID[row][col].
// The cell under the pointer (column = X band, row = Y band, same bands as the
// words) becomes the whole background.
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
// Colour transitions: how long (ms) it takes to get most of the way to a new
// cell's colour. Larger = softer. Reduced-motion users get instant changes.
const FADE_MS = 350;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WHITE = '#ffffff';
const BLACK = '#000000';
const FONT = 'LT Remark';          // self-hosted, see fonts/
const FONT_SIZE = 219 * K;               // 219px in Figma
const UPPER_Y = (707.45 + 263 / 2) * K;  // centre of the upper text box in Figma
const LOWER_Y = (1027.55 + 263 / 2) * K; // centre of the "Asparagus" text box

// Tilt: degrees either side of the starting pose that cover the whole area.
const TILT_RANGE = 25;
const TILT_EASE = 0.2;

const state = {
  display: loadPref('cc02.display', 'words'), // 'words' | 'percent'
  input: 'drag',                          // 'drag' | 'tilt'
  tilt: { x: STAGE_SIZE / 2, y: STAGE_SIZE / 2 }, // eased canvas position
  tiltTarget: null,
  tiltZero: null,                         // { beta, gamma } at switch-on
};

// 0..1 across the interactive area, clamped.
function unit(v) {
  return constrain((v - MARGIN) / SPAN, 0, 1);
}

// Which item a coordinate falls on: equal bands across the area, clamped.
function band(v, count) {
  return Math.min(Math.floor(unit(v) * count), count - 1);
}

function pointer() {
  return state.input === 'tilt' ? state.tilt : { x: mouseX, y: mouseY };
}

function setup() {
  stage();
  textFont(FONT);
  textSize(FONT_SIZE);
  textAlign(CENTER, CENTER);
  noStroke();
  // Canvas text only uses a web font once it has loaded.
  document.fonts.load(`${FONT_SIZE}px "${FONT}"`).then(redraw);
  setupControls();
}

function draw() {
  if (state.input === 'tilt' && state.tiltTarget) {
    state.tilt.x = lerp(state.tilt.x, state.tiltTarget.x, TILT_EASE);
    state.tilt.y = lerp(state.tilt.y, state.tiltTarget.y, TILT_EASE);
  }
  const { x, y } = pointer();
  const upper = state.display === 'percent'
    ? `X - ${Math.round(unit(x) * 100)}%`
    : SIGNS[band(x, SIGNS.length)];
  const lower = state.display === 'percent'
    ? `Y - ${Math.round(unit(y) * 100)}%`
    : FOODS[band(y, FOODS.length)];

  const target = GRID[band(y, GRID.length)][band(x, GRID[0].length)];
  const { bg, ink } = easeColours(target, inkFor(target));
  background(bg);
  fill(ink);
  syncPage(bg, ink);
  text(upper, width / 2, UPPER_Y);
  text(lower, width / 2, LOWER_Y);
}

// Keep the page from scrolling or zooming while dragging on the canvas.
function touchMoved(e) {
  if (e && e.target && e.target.tagName === 'CANVAS') return false;
}

function keyPressed() {
  if (key === 'p' || key === 'P') setDisplay(state.display === 'words' ? 'percent' : 'words');
}

/* ---------- controls ---------- */

function setupControls() {
  document.querySelectorAll('[data-display]').forEach((b) =>
    b.addEventListener('click', () => setDisplay(b.dataset.display)));
  document.querySelectorAll('[data-input]').forEach((b) =>
    b.addEventListener('click', () => setInput(b.dataset.input)));

  // Drag / Tilt only makes sense on a touch device with an orientation sensor.
  const touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  if (touch && 'DeviceOrientationEvent' in window) {
    document.getElementById('input-seg').hidden = false;
  }
  refreshControls();
}

function refreshControls() {
  document.querySelectorAll('[data-display]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.display === state.display)));
  document.querySelectorAll('[data-input]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.input === state.input)));
}

function setDisplay(mode) {
  state.display = mode;
  savePref('cc02.display', mode);
  refreshControls();
}

async function setInput(mode) {
  note('');
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
    state.tilt = { x: mouseX || STAGE_SIZE / 2, y: mouseY || STAGE_SIZE / 2 };
    window.addEventListener('deviceorientation', onOrient);
  } else {
    window.removeEventListener('deviceorientation', onOrient);
    state.tiltTarget = null;
  }
  state.input = mode;
  refreshControls();
}

function onOrient(e) {
  if (e.beta == null || e.gamma == null) return;
  if (!state.tiltZero) state.tiltZero = { beta: e.beta, gamma: e.gamma };
  const dx = e.gamma - state.tiltZero.gamma; // left/right
  const dy = e.beta - state.tiltZero.beta;   // forward/back
  state.tiltTarget = {
    x: map(constrain(dx, -TILT_RANGE, TILT_RANGE), -TILT_RANGE, TILT_RANGE, MARGIN, STAGE_SIZE - MARGIN),
    y: map(constrain(dy, -TILT_RANGE, TILT_RANGE), -TILT_RANGE, TILT_RANGE, MARGIN, STAGE_SIZE - MARGIN),
  };
}

/* ---------- colour + contrast ---------- */

// WCAG 2 relative luminance of a #rrggbb colour.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
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
// independent (exponential smoothing in RGB).
const shown = { bg: null, ink: null };
function easeColours(bgTarget, inkTarget) {
  const tb = toRgb(bgTarget), ti = toRgb(inkTarget);
  if (!shown.bg || REDUCED_MOTION) {
    shown.bg = tb; shown.ink = ti;
  } else {
    const k = 1 - Math.exp(-deltaTime / (FADE_MS / 3));
    shown.bg = shown.bg.map((c, i) => c + (tb[i] - c) * k);
    shown.ink = shown.ink.map((c, i) => c + (ti[i] - c) * k);
  }
  return { bg: toHex(shown.bg), ink: toHex(shown.ink) };
}

function toRgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function toHex(c) {
  return '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Page around the canvas and the small controls follow the same colours.
let lastBg = null, lastInk = null;
function syncPage(bg, ink) {
  if (bg === lastBg && ink === lastInk) return;
  lastBg = bg; lastInk = ink;
  const root = document.documentElement.style;
  root.setProperty('--bg', bg);
  root.setProperty('--ink', ink);
}

function note(msg) {
  document.getElementById('note').textContent = msg;
}

// localStorage can throw (private mode, blocked storage): never let that break the sketch.
function loadPref(k, fallback) {
  try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; }
}
function savePref(k, v) {
  try { localStorage.setItem(k, v); } catch (e) { /* ignore */ }
}
