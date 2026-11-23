// Tilt cursor
// Canvas is 2048×2048. mouseX / mouseY are already in canvas coordinates.
//
// An exploration of the phone's motion sensors. Tilt the phone and an
// AutoCAD-style crosshair (the one on the sketchbook26 home page: full-length dashed
// guides, four bars in the middle) moves across the canvas.
//
//   gamma (left / right tilt)    → x
//   beta  (forward / back tilt)  → y
//
// The pose you hold the phone in when tilt starts is the centre. Tilting Range
// degrees either way reaches the edge, and Smoothing eases the cursor (a lerp
// each frame). Tap the canvas, press C or hit Recenter to take a new centre.
// Landscape works too: the axes are swapped using the screen angle.
//
// The left column shows the raw sensor values as they arrive:
//   deviceorientation: alpha (compass-ish heading, 0–360), beta (−180–180),
//                      gamma (−90–90), and whether the angles are absolute
//   devicemotion:      rotationRate (deg/s around each axis) and acceleration
//                      including gravity (m/s²)
// and the event rate. The wireframe phone at the top right is drawn from
// alpha, beta and gamma, so you can see how the three angles combine. Watch it
// near beta = ±90° (phone upright): gamma flips there (gimbal lock).
//
// On a computer (no sensor) the crosshair follows the mouse instead, and the
// wireframe phone and the beta / gamma readouts show the tilt that would have
// put the cursor there (the mapping run backwards).
//
// iOS only hands out motion data on an https:// page, and only after a tap
// that asks for permission (the Start tilt button does that).
//
// Keys: S saves a PNG (without the controls), H hides the controls,
// F fullscreen, C recentres.

/* ---------- look ---------- */

const BG = '#1a1a1a';
const ACCENT = '#28e5b0';
const ACTIVE = '#ffffff';    // Lateralus interface tokens: square controls, white = on
const ON_ACTIVE = '#333333';
const INK = '#e8e8e8';
const DIM = '#8a8a8a';
const LINE = '#3a3a3a';
const MONO = 'JetBrains Mono';
const SANS = 'sans-serif';
const W = 2048;
const M = 64;                // page margin

/* ---------- settings (kept in localStorage) ---------- */

const DEFAULTS = {
  input: null,       // 'tilt' | 'pointer' (null = pick by device)
  range: 30,         // degrees of tilt from the centre to the edge
  smooth: 0.85,      // 0 = raw, 0.95 = very floaty
  trail: false,
  readouts: true,
  panel: false,
};
const RANGES = { range: [10, 60], smooth: [0, 0.95] };
let S = loadSettings();

function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem('cc03.settings') || '{}') }; }
  catch (e) { return { ...DEFAULTS }; }
}
function persist() {
  try { localStorage.setItem('cc03.settings', JSON.stringify(S)); } catch (e) { /* ignore */ }
}

/* ---------- sensor state ---------- */

const touchDevice = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const hasSensor = touchDevice && 'DeviceOrientationEvent' in window;

const sensor = {
  started: false,     // listeners attached
  orient: null,       // last deviceorientation { alpha, beta, gamma, absolute }
  motion: null,       // last devicemotion { rate: {alpha,beta,gamma}, acc: {x,y,z}, interval }
  zero: null,         // { beta, gamma, alpha } centre pose
  count: 0, hz: 0, since: 0,
  message: '',
};

let cur = { x: W / 2, y: W / 2 };   // eased cursor position
let target = { x: W / 2, y: W / 2 };
let trail = [];
let showUI = true;
let exporting = false;
let hits = [];
let drag = null;

/* ---------- p5 ---------- */

function setup() {
  const cnv = stage({ exportKey: null });
  if (!S.input || (S.input === 'tilt' && !hasSensor)) S.input = hasSensor ? 'tilt' : 'pointer';
  cnv.elt.addEventListener('click', onTap); // a real click, so iOS lets us ask for motion access
  sensor.since = millis();
}

function draw() {
  hits = [];
  background(BG);
  updateCursor();

  const ui = showUI && !exporting;
  if (S.trail) drawTrail();
  if (ui && S.readouts) { drawReadouts(); drawPhone(); }
  if (ui) drawHeader();
  if (ui && S.input === 'tilt' && !sensor.started) drawStartCard();
  if (ui && S.panel) drawPanel();
  drawCursor(cur.x, cur.y, ui);

  canvasCursor(S.input === 'pointer' && !touchDevice);

  if (exporting) { saveStage(); exporting = false; }

  // events per second
  if (millis() - sensor.since > 1000) {
    sensor.hz = sensor.count * 1000 / (millis() - sensor.since);
    sensor.count = 0;
    sensor.since = millis();
  }
}

function updateCursor() {
  if (S.input === 'pointer') {
    if (touchDevice && !mouseIsPressed && !drag) { /* finger lifted: stay put */ }
    else if (!drag) target = { x: constrain(mouseX, 0, W), y: constrain(mouseY, 0, W) };
  } else if (sensor.orient) {
    const d = tiltDelta();
    if (d) {
      const r = S.range;
      target = {
        x: map(constrain(d.x, -r, r), -r, r, 0, W),
        y: map(constrain(d.y, -r, r), -r, r, 0, W),
      };
    }
  }
  // Pointer on a computer follows exactly; tilt (and touch) get the lerp.
  const amt = S.input === 'pointer' && !touchDevice ? 1 : 1 - S.smooth;
  cur.x = lerp(cur.x, target.x, amt);
  cur.y = lerp(cur.y, target.y, amt);

  if (S.trail) {
    trail.push({ x: cur.x, y: cur.y });
    if (trail.length > 240) trail.shift();
  }
}

// Tilt away from the centre pose, in degrees, turned to match the screen.
function tiltDelta() {
  const o = sensor.orient;
  if (o.beta == null || o.gamma == null) return null;
  if (!sensor.zero) sensor.zero = { beta: o.beta, gamma: o.gamma, alpha: o.alpha || 0 };
  const db = wrap180(o.beta - sensor.zero.beta);   // forward / back
  const dg = wrap180(o.gamma - sensor.zero.gamma); // left / right
  switch (screenAngle()) {
    case 90: return { x: db, y: -dg };
    case 180: return { x: -dg, y: -db };
    case 270: return { x: -db, y: dg };
    default: return { x: dg, y: db };
  }
}

function screenAngle() {
  let a = (screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0;
  return ((a % 360) + 360) % 360;
}

function wrap180(a) {
  return ((a + 180) % 360 + 360) % 360 - 180;
}

/* ---------- simulated tilt (desktop) ---------- */

// With no gyro, run the tilt mapping backwards: the cursor's position becomes
// the tilt that would have put it there, so the wireframe phone shows how you'd
// hold the phone to reach that spot. The centre is a typical hand-held pose.
const SIM_BETA = 40;

function simOrient() {
  if (S.input !== 'pointer' || sensor.orient) return null;
  const r = S.range;
  return {
    alpha: 0,
    beta: SIM_BETA + map(cur.y, 0, W, -r, r),
    gamma: map(cur.x, 0, W, -r, r),
    absolute: false,
    sim: true,
  };
}

/* ---------- sensors ---------- */

async function startTilt() {
  sensor.message = '';
  if (!window.isSecureContext) {
    sensor.message = 'Tilt needs an https:// page. This one is ' + location.protocol + '//' + location.host + '.';
    return;
  }
  // iOS 13+: both permissions must be asked from a tap. Android just says yes.
  try {
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      if ((await DOE.requestPermission()) !== 'granted') {
        sensor.message = 'Motion access was declined. Allow it in Settings › Safari › Motion & Orientation Access, then reload.';
        return;
      }
    }
    const DME = window.DeviceMotionEvent;
    if (DME && typeof DME.requestPermission === 'function') await DME.requestPermission().catch(() => {});
  } catch (err) {
    sensor.message = 'Could not ask for motion access: ' + (err && err.message ? err.message : err);
    return;
  }
  window.addEventListener('deviceorientation', onOrient);
  window.addEventListener('devicemotion', onMotion);
  sensor.started = true;
  sensor.zero = null;
  setTimeout(() => {
    if (sensor.started && !sensor.orient) sensor.message = 'No orientation events yet. This device may not have a gyro.';
  }, 1500);
}

function onOrient(e) {
  sensor.orient = { alpha: e.alpha, beta: e.beta, gamma: e.gamma, absolute: e.absolute, heading: e.webkitCompassHeading };
  if (!sensor.zero && e.beta != null) sensor.zero = { beta: e.beta, gamma: e.gamma, alpha: e.alpha || 0 };
  sensor.count++;
  if (sensor.message.startsWith('No orientation')) sensor.message = '';
}

function onMotion(e) {
  const r = e.rotationRate || {};
  const a = e.accelerationIncludingGravity || {};
  sensor.motion = { rate: { alpha: r.alpha, beta: r.beta, gamma: r.gamma }, acc: { x: a.x, y: a.y, z: a.z }, interval: e.interval };
}

function recenter() {
  sensor.zero = null;
  trail = [];
}

/* ---------- cursor ---------- */

// Same proportions as the home page cursor, scaled ×3 for the 2048 canvas.
function drawCursor(x, y, labels) {
  const ctx = drawingContext;
  stroke(ACCENT);
  strokeWeight(2);
  ctx.setLineDash([12, 12]);
  line(0, y, W, y);
  line(x, 0, x, W);
  ctx.setLineDash([]);

  strokeWeight(9);
  strokeCap(SQUARE);
  line(x - 64, y, x - 22, y);
  line(x + 24, y, x + 64, y);
  line(x, y - 64, x, y - 22);
  line(x, y + 24, x, y + 64);
  strokeCap(ROUND);

  if (labels) {
    noStroke();
    fill(ACCENT);
    textFont(MONO);
    textSize(24);
    textAlign(LEFT, TOP);
    text(`x=${Math.round(x)}`, x + 12, 10);
    textAlign(RIGHT, BOTTOM);
    text(`y=${Math.round(y)}`, W - 12, y - 10);
    textFont(SANS);
  }
}

function drawTrail() {
  noStroke();
  for (let i = 0; i < trail.length; i += 2) {
    const t = i / trail.length;
    fill(40, 229, 176, 20 + 120 * t);
    rect(trail[i].x - 4, trail[i].y - 4, 8, 8);
  }
}

function canvasCursor(hide) {
  const el = document.querySelector('canvas.stage');
  if (el) el.classList.toggle('no-cursor', hide);
}

/* ---------- readouts (left column) ---------- */

function drawReadouts() {
  const x = M, vx = M + 190;
  let y = 250;
  const sim = simOrient();
  const o = sensor.orient || sim, m = sensor.motion;
  const d = sensor.orient ? tiltDelta() : null;
  textFont(MONO);
  textAlign(LEFT, BASELINE);
  noStroke();

  const head = (t) => { fill(DIM); textSize(28); text(t, x, y); y += 56; };
  const row = (k, v, extra) => {
    textSize(40);
    fill(DIM); text(k, x, y);
    fill(v == null ? DIM : INK); text(num(v), vx, y);
    if (extra) { fill(ACCENT); text(extra, vx + 230, y); }
    y += 54;
  };

  head('ORIENTATION  deg');
  row('alpha', o && o.alpha);
  const zero = sim ? { beta: SIM_BETA, gamma: 0 } : sensor.zero;
  const live = (d || sim) && zero;
  row('beta', o && o.beta, live ? 'Δ ' + signed(wrap180(o.beta - zero.beta)) : '');
  row('gamma', o && o.gamma, live ? 'Δ ' + signed(wrap180(o.gamma - zero.gamma)) : '');
  if (o && o.heading != null) row('compass', o.heading);
  fill(DIM); textSize(28);
  text(sim ? 'simulated from the mouse (no gyro)' : o ? (o.absolute ? 'absolute (earth frame)' : 'relative frame') : 'waiting for deviceorientation', x, y);
  y += 76;

  head('ROTATION RATE  deg/s');
  row('alpha', m && m.rate.alpha);
  row('beta', m && m.rate.beta);
  row('gamma', m && m.rate.gamma);
  y += 28;

  head('ACCELERATION + GRAVITY  m/s²');
  row('x', m && m.acc.x);
  row('y', m && m.acc.y);
  row('z', m && m.acc.z);
  y += 28;

  head('STATUS');
  textSize(30);
  fill(INK);
  const lines = [
    `input   ${S.input}${S.input === 'tilt' ? (sensor.started ? ' · live' : ' · not started') : ''}`,
    `events  ${sensor.started ? sensor.hz.toFixed(0) + ' Hz' : '—'}${m && m.interval ? ` · motion every ${(m.interval < 1 ? m.interval * 1000 : m.interval).toFixed(0)} ms` : ''}`,
    `screen  ${screenAngle()}°`,
    `range   ±${S.range}° · smoothing ${S.smooth.toFixed(2)}`,
    `https   ${window.isSecureContext ? 'yes' : 'no'}`,
  ];
  for (const l of lines) { text(l, x, y); y += 42; }
  textFont(SANS);
}

function num(v) {
  if (v == null || Number.isNaN(v)) return '—';
  return v.toFixed(1).padStart(7, ' ');
}
function signed(v) {
  if (v == null) return '—';
  return (v >= 0 ? '+' : '') + v.toFixed(1);
}

/* ---------- wireframe phone (top right) ---------- */

// Rotates the phone's corners by alpha, beta, gamma (the W3C order: Z, then X,
// then Y) and draws them from a camera south of the phone and 50° up, which is
// roughly where your eyes are when you hold it.
function drawPhone() {
  const cx = W - M - 230, cy = 470, s = 300;
  const sim = simOrient();
  const o = sensor.orient || sim;
  const a = radians(o && o.alpha != null ? o.alpha - (sensor.zero ? sensor.zero.alpha : 0) : 0);
  const b = radians(o && o.beta != null ? o.beta : 40);
  const g = radians(o && o.gamma != null ? o.gamma : 0);

  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  // R = Rz(a) · Rx(b) · Ry(g)
  const R = [
    [ca * cg - sa * sb * sg, -sa * cb, ca * sg + sa * sb * cg],
    [sa * cg + ca * sb * sg, ca * cb, sa * sg - ca * sb * cg],
    [-cb * sg, sb, cb * cg],
  ];
  const e = radians(50);
  const up = [0, Math.sin(e), Math.cos(e)];
  const toCam = [0, -Math.cos(e), Math.sin(e)];
  const rot = (p) => [0, 1, 2].map((i) => R[i][0] * p[0] + R[i][1] * p[1] + R[i][2] * p[2]);
  const proj = (p) => {
    const w = rot(p);
    return { x: cx + w[0] * s, y: cy - (w[1] * up[1] + w[2] * up[2]) * s };
  };

  // Floor cross (world axes), dashed.
  const ctx = drawingContext;
  stroke(LINE); strokeWeight(2); ctx.setLineDash([8, 8]);
  const fl = (p, q) => { const P = proj0(p), Q = proj0(q); line(P.x, P.y, Q.x, Q.y); };
  function proj0(p) { return { x: cx + p[0] * s, y: cy - (p[1] * up[1] + p[2] * up[2]) * s }; }
  fl([-0.7, 0, -0.35], [0.7, 0, -0.35]);
  fl([0, -0.7, -0.35], [0, 0.7, -0.35]);
  ctx.setLineDash([]);

  const hw = 0.24, hh = 0.5, hd = 0.035;
  const box = (z) => [[-hw, -hh, z], [hw, -hh, z], [hw, hh, z], [-hw, hh, z]].map(proj);
  const back = box(-hd), front = box(hd);
  const normal = rot([0, 0, 1]);
  const facing = normal[0] * toCam[0] + normal[1] * toCam[1] + normal[2] * toCam[2] > 0;

  noFill();
  stroke(facing ? '#555' : ACCENT); strokeWeight(3);
  quadP(back);
  stroke('#555');
  for (let i = 0; i < 4; i++) line(back[i].x, back[i].y, front[i].x, front[i].y);

  // Screen face.
  const scr = [[-hw + 0.03, -hh + 0.06, hd], [hw - 0.03, -hh + 0.06, hd], [hw - 0.03, hh - 0.06, hd], [-hw + 0.03, hh - 0.06, hd]].map(proj);
  noStroke();
  fill(40, 229, 176, facing ? 45 : 0);
  quadP(scr);
  noFill();
  stroke(facing ? ACCENT : '#555'); strokeWeight(3);
  quadP(front);
  // Top edge marker (the earpiece), so you can tell top from bottom.
  const t1 = proj([-0.06, hh - 0.03, hd]), t2 = proj([0.06, hh - 0.03, hd]);
  strokeWeight(6);
  line(t1.x, t1.y, t2.x, t2.y);

  noStroke(); fill(DIM); textFont(MONO); textSize(26); textAlign(CENTER, TOP);
  text(sim ? 'how the phone would tilt' : o ? 'attitude from alpha · beta · gamma' : 'attitude (no sensor yet)', cx, cy + 300);
  textFont(SANS);
}

function quadP(p) {
  quad(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
}

/* ---------- start card (tilt not started) ---------- */

function drawStartCard() {
  const w = 900, h = sensor.message ? 360 : 250;
  const x = (W - w) / 2, y = 1480;
  noStroke();
  fill(24, 24, 24, 235);
  rect(x, y, w, h);
  stroke(LINE); strokeWeight(2); noFill();
  rect(x, y, w, h);
  hits.push({ kind: 'panel', x, y, w, h });

  noStroke();
  fill(INK); textSize(36); textAlign(CENTER, CENTER);
  text('Hold the phone how you like, then', W / 2, y + 62);
  button(x + 200, y + 120, w - 400, 'Start tilt', startTilt, true);
  if (sensor.message) {
    fill(DIM); textSize(30); textAlign(CENTER, TOP);
    text(sensor.message, x + 40, y + 210, w - 80, 140);
  }
}

/* ---------- header ---------- */

const TOP = { y: 40, h: 138 };

function drawHeader() {
  const mid = TOP.y + 62;
  noStroke();
  fill(DIM);
  textSize(24);
  textAlign(LEFT, CENTER);
  text('TILT CURSOR', M, mid);

  segmented((W - 460) / 2, mid - 28, 460, 'input', ['tilt', 'pointer'], [hasSensor, true]);

  const tx = W - M - 96;
  fill(INK);
  textSize(26);
  textAlign(RIGHT, CENTER);
  text('Control', tx - 20, mid);
  toggleSwitch(tx, mid - 24, S.panel);
  hits.push({ kind: 'tap', x: tx - 140, y: mid - 32, w: 236, h: 64, fn: () => { S.panel = !S.panel; persist(); } });

  stroke(LINE);
  strokeWeight(2);
  line(M, TOP.y + TOP.h, W - M, TOP.y + TOP.h);

  if (!hasSensor) {
    noStroke(); fill(DIM); textSize(20); textAlign(CENTER, TOP);
    text('No tilt sensor here: open this page on a phone (https)', W / 2, TOP.y + TOP.h + 14);
  }
}

/* ---------- control panel ---------- */

function panelRect() {
  return { x: 40, y: W - 40 - 330, w: W - 80, h: 330 };
}

function drawPanel() {
  const p = panelRect();
  noStroke();
  fill(24, 24, 24, 235);
  rect(p.x, p.y, p.w, p.h);
  stroke(LINE); strokeWeight(2); noFill();
  rect(p.x, p.y, p.w, p.h);
  hits.push({ kind: 'panel', ...p });

  const colW = 560, gutter = 64, x0 = p.x + 56;
  const xs = [x0, x0 + colW + gutter, x0 + (colW + gutter) * 2];
  const y1 = p.y + 38, y2 = p.y + 136;

  slider(xs[0], y1, colW, 'Range', 'range', true, (v) => `±${Math.round(v)}°`);
  slider(xs[1], y1, colW, 'Smoothing', 'smooth', true, (v) => v.toFixed(2));
  toggleRow(xs[2], y1, colW, 'Readouts', 'readouts');

  button(xs[0], y2 + 6, 262, 'Recenter', recenter, false);
  button(xs[0] + 298, y2 + 6, 262, 'Reset', resetSettings, false);
  toggleRow(xs[2], y2, colW, 'Trail', 'trail');

  drawShortcuts(x0, p.y + 250);
}

function resetSettings() {
  const keep = { input: S.input, panel: S.panel };
  S = { ...DEFAULTS, ...keep };
  persist();
  recenter();
}

function drawShortcuts(x, y) {
  const keys = [['S', 'save PNG'], ['H', 'hide UI'], ['F', 'fullscreen'], ['C', 'recenter']];
  textSize(20);
  for (const [k, what] of keys) {
    noStroke();
    fill('#555');
    rect(x + 2, y + 2, 34, 35);
    fill(BG);
    stroke(DIM);
    strokeWeight(2);
    rect(x, y, 34, 35);
    noStroke();
    fill(INK);
    textFont(MONO);
    textAlign(CENTER, CENTER);
    text(k, x + 17, y + 17);
    textFont(SANS);
    fill(DIM);
    textAlign(LEFT, CENTER);
    text(what, x + 45, y + 17);
    x += 45 + textWidth(what) + 40;
  }
  fill(DIM);
  textAlign(LEFT, CENTER);
  if (S.input === 'tilt') text('· or tap the canvas to recenter', x - 16, y + 17);
}

/* ---------- controls (Lateralus style) ---------- */

function label(x, y, txt, on = true) {
  noStroke();
  fill(on ? INK : DIM);
  textSize(26);
  textAlign(LEFT, CENTER);
  text(txt.toUpperCase(), x, y);
}

function toggleRow(x, y, w, name, key) {
  label(x, y + 24, name);
  toggleSwitch(x + w - 96, y, S[key]);
  hits.push({ kind: 'tap', x, y: y - 8, w, h: 64, fn: () => { S[key] = !S[key]; persist(); if (key === 'trail') trail = []; } });
}

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
  textFont(SANS);
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
    const ok = enabled[i];
    if (on) {
      fill(ACTIVE);
      rect(sx + 4, y + 4, segW - 8, h - 8);
    }
    fill(on ? ON_ACTIVE : ok ? INK : '#555');
    textSize(24);
    textAlign(CENTER, CENTER);
    text(o[0].toUpperCase() + o.slice(1), sx + segW / 2, y + h / 2 + 1);
    if (ok) hits.push({ kind: 'tap', x: sx, y, w: segW, h, fn: () => setInput(o) });
    else hits.push({ kind: 'panel', x: sx, y, w: segW, h });
  });
}

function setInput(mode) {
  S.input = mode;
  persist();
  recenter();
  if (mode === 'pointer') target = { x: cur.x, y: cur.y };
}

function slider(x, y, w, name, key, enabled, show) {
  const [lo, hi] = RANGES[key];
  label(x, y + 14, name, enabled);
  textAlign(RIGHT, CENTER);
  fill(enabled ? INK : DIM);
  text(show(S[key]), x + w, y + 14);

  const ty = y + 56;
  const t = constrain((S[key] - lo) / (hi - lo), 0, 1);
  noStroke();
  fill('#444');
  rect(x, ty - 4, w, 8);
  fill(enabled ? ACTIVE : '#666');
  rect(x, ty - 4, w * t, 8);
  const area = { x: x - 20, y: y - 6, w: w + 40, h: 84 };
  const hot = (drag && drag.key === key) || (!drag && !touchDevice && inside(mouseX, mouseY, area));
  const a = ease('knob:' + key, hot ? 135 : 0);
  fill('#ffffff');
  push();
  translate(x + w * t, ty);
  rotate(radians(a));
  rect(-18, -18, 36, 36);
  pop();
  hits.push({ kind: 'slider', key, trackX: x, trackW: w, ...area });
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

const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const eased = {};
function ease(id, target) {
  const c = eased[id] || 0;
  let n = reduceMotion ? target : c + (target - c) * 0.35;
  if (Math.abs(n - target) < 0.05) n = target;
  return (eased[id] = n);
}

function inside(x, y, r) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function hitAt(x, y) {
  for (let i = hits.length - 1; i >= 0; i--) if (inside(x, y, hits[i])) return hits[i];
  return null;
}

/* ---------- input ---------- */

// Taps run from a native click, which counts as a user gesture on iOS
// (needed for DeviceOrientationEvent.requestPermission).
function onTap(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = (e.clientX - r.left) * W / r.width;
  const y = (e.clientY - r.top) * W / r.height;
  if (!showUI) { if (S.input === 'tilt' && sensor.started) recenter(); return; }
  const h = hitAt(x, y);
  if (h && h.kind === 'tap') h.fn();
  else if (!h && S.input === 'tilt' && sensor.started) recenter();
}

function mousePressed() {
  if (!showUI) return;
  const h = hitAt(mouseX, mouseY);
  if (h && h.kind === 'slider') { drag = h; setSlider(h); }
}

function mouseDragged() {
  if (drag) setSlider(drag);
}

function mouseReleased() {
  if (drag) { drag = null; persist(); }
}

function setSlider(h) {
  const [lo, hi] = RANGES[h.key];
  let v = lo + constrain((mouseX - h.trackX) / h.trackW, 0, 1) * (hi - lo);
  S[h.key] = h.key === 'range' ? Math.round(v) : Math.round(v * 100) / 100;
}

function keyPressed() {
  const k = (key || '').toLowerCase();
  if (k === 's') exporting = true;
  if (k === 'h') showUI = !showUI;
  if (k === 'c') recenter();
}
