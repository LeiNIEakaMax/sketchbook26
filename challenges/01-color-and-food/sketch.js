// Color and food
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG, F toggles fullscreen, P switches Words / Percent.
//
// The upper line follows X, the lower line follows Y. The interactive area is
// the canvas minus a 256px margin on every side (1488×1488), split into equal
// bands, one per list item. Outside the margin values clamp to the ends.
//
// Display: "Words" shows a color (X) and a food (Y); "Percent" shows how far
// across the interactive area the pointer is, e.g. "X - 36%" / "Y - 74%".
// Input (touch devices only): "Drag" follows your finger; "Tilt" uses the
// phone's orientation (left/right tilt → X, forward/back tilt → Y), centred
// on however you were holding it when you switched Tilt on.

const COLORS = [
  'Maroon', 'Saffron', 'Teal', 'Lavender', 'Ochre', 'Crimson',
  'Indigo', 'Coral', 'Olive', 'Cerulean', 'Magenta', 'Ivory',
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
const BG = '#131313';
const INK = '#fefefe';
const FONT = 'Inria Serif';
const FONT_SIZE = 219 * K;               // 219px in Figma
const UPPER_Y = (707.45 + 263 / 2) * K;  // centre of the "Maroon" text box
const LOWER_Y = (1027.55 + 263 / 2) * K; // centre of the "Asparagus" text box

// Tilt: degrees either side of the starting pose that cover the whole area.
const TILT_RANGE = 25;
const TILT_EASE = 0.2;

const state = {
  display: loadPref('cc01.display', 'words'), // 'words' | 'percent'
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
    : COLORS[band(x, COLORS.length)];
  const lower = state.display === 'percent'
    ? `Y - ${Math.round(unit(y) * 100)}%`
    : FOODS[band(y, FOODS.length)];

  background(BG);
  fill(INK);
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
  savePref('cc01.display', mode);
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
