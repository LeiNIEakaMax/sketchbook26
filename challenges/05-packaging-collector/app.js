// Challenge 05 · Packaging collector
//
// Photograph the six sides of a box. Each photo's box face is found and
// flattened, the six panels give the box's proportions, and the panels are
// folded back into a 3D box you can turn around.
//
// Faces: front / back are W × H, left / right are D × H, top / bottom are W × D.
// Every panel's measured width / height (perspective corrected) feeds a small
// least-squares fit for W, H and D.
//
// A scale photo (a credit-card-size card laid on the box, plus a line you
// drag along one box edge) turns the proportions into millimetres, and the
// Dieline view unfolds the box into a printable tuck-end net.
//
// Save box keeps the photos, corners and panels in this browser (IndexedDB);
// the Shelf view lists every saved box.
//
// Keys: S saves a PNG of the box view, F fullscreen.

import { decodePhoto, findPanel, findCard, lineMM, flatten, panelAspect, orderQuad, defaultQuad, clampQuad, loadCV, CARD_MM } from './vision.js';
import { buildDieline } from './dieline.js';
import { createBoxView, SIZE } from './box.js';
import { listBoxes, getBox, putBox, deleteBox, toBlob, toCanvas } from './store.js';

const FACES = ['front', 'right', 'back', 'left', 'top', 'bottom'];
const LABEL = { front: 'Front', right: 'Right', back: 'Back', left: 'Left', top: 'Top', bottom: 'Bottom' };
const KEY = 'sketchbook26.05.settings';

const $ = (id) => document.getElementById(id);

/* ---------- state ---------- */

// faces[name] = { work, quad, rot (0-3, quarter turns set by you), auto (0|1 extra turn picked by the fit),
//                 aspect (true w/h of the flattened panel), flat (canvas), panel (oriented canvas), busy, error }
const faces = Object.fromEntries(FACES.map((f) => [f, null]));
let S = loadSettings();
let dims = null;
let currentId = null;   // the shelf box being edited, if any
// scale = { work, card (quad), line ([[x,y],[x,y]]), dim, mm } or null.
// dim names the box side by size, which doesn't depend on how the box was
// turned: 'long' | 'mid' | 'short'.
let scale = null;
const DIM_LABEL = { long: 'Longest', mid: 'Middle', short: 'Shortest' };
const sideBySize = (d) => { const v = [d.w, d.h, d.d].sort((a, b) => b - a); return { long: v[0], mid: v[1], short: v[2] }; };

function loadSettings() {
  const d = { view: 'panels', panel: false, spin: false, realH: '', openId: null };
  try { return { ...d, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return d; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}

/* ---------- views ---------- */

const box = createBoxView($('boxCanvas'));

function setView(v) {
  S.view = v;
  persist();
  document.querySelectorAll('.top .seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === v)));
  $('panelsView').hidden = v !== 'panels';
  $('boxView').hidden = v !== 'box';
  $('shelfView').hidden = v !== 'shelf';
  $('dieView').hidden = v !== 'dieline';
  if (v === 'box') box.start(); else box.stop();
  if (v === 'shelf') renderShelf();
  if (v === 'dieline') renderDieline();
}
document.querySelectorAll('.top .seg button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

function setSwitch(el, on) {
  el.setAttribute('aria-checked', String(on));
  el.querySelector('b').textContent = on ? 'ON' : 'OFF';
}
function setPanel(on) {
  S.panel = on;
  persist();
  setSwitch($('ctlToggle'), on);
  $('panel').hidden = !on;
}
$('ctlToggle').addEventListener('click', () => setPanel(!S.panel));

$('spinToggle').addEventListener('click', () => {
  S.spin = !S.spin; persist();
  setSwitch($('spinToggle'), S.spin);
  box.setSpin(S.spin);
});
$('resetView').addEventListener('click', () => box.resetView());
$('realH').value = S.realH;
$('realH').addEventListener('input', () => { S.realH = $('realH').value; persist(); showDims(); });

/* ---------- status line ---------- */

let statusTimer = 0;
function status(msg, hold = false) {
  clearTimeout(statusTimer);
  $('status').textContent = msg || '';
  if (msg && !hold) statusTimer = setTimeout(() => { $('status').textContent = ''; }, 4000);
}

/* ---------- the unfolded net of slots ---------- */

const net = $('net');
const slots = {};
for (const f of FACES) {
  const b = document.createElement('button');
  b.className = 'slot';
  b.style.gridArea = f;
  b.dataset.face = f;
  b.addEventListener('click', () => (faces[f] && faces[f].work ? openEditor(f) : pickOne(f)));
  b.addEventListener('dragover', (e) => { e.preventDefault(); b.classList.add('drop'); });
  b.addEventListener('dragleave', () => b.classList.remove('drop'));
  b.addEventListener('drop', (e) => {
    e.preventDefault();
    b.classList.remove('drop');
    const files = [...e.dataTransfer.files];
    if (files.length === 1) addPhoto(f, files[0]);
    else if (files.length > 1) addMany(files);
  });
  net.appendChild(b);
  slots[f] = b;
}

function renderSlot(f) {
  const b = slots[f], s = faces[f];
  b.replaceChildren();
  b.classList.toggle('filled', !!(s && s.panel));
  b.classList.toggle('busy', !!(s && s.busy));
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = LABEL[f].toUpperCase();
  b.appendChild(tag);
  if (s && s.panel && !s.busy) {
    const c = document.createElement('canvas');
    c.width = s.panel.width; c.height = s.panel.height;
    c.getContext('2d').drawImage(s.panel, 0, 0);
    b.appendChild(c);
    b.setAttribute('aria-label', `${LABEL[f]} panel, tap to adjust`);
  } else {
    const m = document.createElement('span');
    m.className = 'msg';
    if (s && s.busy) m.textContent = s.busy;
    else if (s && s.error) m.textContent = s.error;
    else { m.innerHTML = '<span class="plus">+</span>Add photo'; }
    b.appendChild(m);
    b.setAttribute('aria-label', `Add ${LABEL[f]} photo`);
  }
}
FACES.forEach(renderSlot);

// the scale photo gets its own tile, under the net
const scaleSlot = document.createElement('button');
scaleSlot.className = 'slot scale';
scaleSlot.style.gridArea = 'scale';
scaleSlot.addEventListener('click', () => (scale && scale.work ? openEditor('scale') : pickOne('scale')));
net.appendChild(scaleSlot);

function renderScaleSlot() {
  const b = scaleSlot;
  b.replaceChildren();
  b.classList.toggle('filled', !!(scale && scale.work && !scale.busy));
  const tag = document.createElement('span');
  tag.className = 'tag';
  tag.textContent = 'SCALE CARD';
  b.appendChild(tag);
  const m = document.createElement('span');
  m.className = 'msg';
  if (scale && scale.busy) m.textContent = scale.busy;
  else if (scale && scale.work) {
    m.innerHTML = scale.mm
      ? `<b class="mm">${scale.mm.toFixed(1)} mm</b><br>${DIM_LABEL[scale.dim].toLowerCase()} side of the box<br><span class="dim">tap to adjust</span>`
      : 'Card found. Tap to draw the measuring line';
  } else {
    m.innerHTML = '<span class="plus">+</span>Card photo<br><span class="dim">credit-card size, laid on the box</span>';
  }
  b.appendChild(m);
  b.setAttribute('aria-label', scale ? 'Scale card photo, tap to adjust' : 'Add a scale card photo');
}
renderScaleSlot();

/* ---------- adding photos ---------- */

let pickTarget = null;
function pickOne(f) { pickTarget = f; $('fileOne').value = ''; $('fileOne').click(); }
$('fileOne').addEventListener('change', () => {
  const file = $('fileOne').files[0];
  if (!file || !pickTarget) return;
  if (pickTarget === 'scale') addScalePhoto(file); else addPhoto(pickTarget, file);
});
for (const id of ['addAll', 'addAllTop']) $(id).addEventListener('click', () => { $('fileMany').value = ''; $('fileMany').click(); });
$('fileMany').addEventListener('change', () => addMany([...$('fileMany').files]));
function clearFaces() {
  for (const f of FACES) { faces[f] = null; renderSlot(f); box.setFace(f, null); }
  scale = null;
  renderScaleSlot();
  setCurrent(null);
  refit();
}
$('clearAll').addEventListener('click', clearFaces);

// The whole page is a drop target for a batch of photos.
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  if (e.defaultPrevented) return;
  e.preventDefault();
  const files = [...e.dataTransfer.files];
  if (files.length) addMany(files);
});

function addMany(files) {
  files = files.filter((f) => /^image\//.test(f.type) || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name));
  files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (files.length > 6) { addWithCard(files.slice(0, 7)); return; }
  // fill empty slots in order: front, right, back, left, top, bottom
  let empties = FACES.filter((f) => !faces[f]);
  if (empties.length < files.length) empties = FACES.slice();
  files.slice(0, 6).forEach((file, i) => addPhoto(empties[i], file));
}

// Seven photos: one of them shows the scale card. Open them all, find the
// panel and the card in each, and give the scale tile the photo where a
// card-like shape sits apart from the box face (a white box face can look
// like the card, but then the two outlines coincide). The other six go to
// the faces in order.
function addWithCard(files) {
  for (const f of FACES) { faces[f] = { busy: 'Sorting photos…', rot: 0, auto: 0, manual: false }; renderSlot(f); }
  scale = { busy: 'Looking for the card…' };
  renderScaleSlot();
  queue = queue.then(async () => {
    const decoded = [];
    for (const file of files) decoded.push(await decodePhoto(file));
    if (!(window.cv && window.cv.Mat)) status('Loading the vision library, about 10 MB, only the first time', true);
    await loadCV();
    status('Finding the card and the panels…', true);
    const found = [];
    for (const work of decoded) {
      await new Promise((r) => setTimeout(r, 20));
      let panel = null;
      try { panel = await findPanel(work); } catch (e) { console.warn(e); }
      const card = findCard(work);
      const sc = card ? card.score * (1 - overlap(card, panel, work)) : 0;
      found.push({ work, panel, sc });
    }
    status('');
    let best = 0;
    found.forEach((v, i) => { if (v.sc > found[best].sc) best = i; });
    setScalePhoto(found[best].work);
    found.filter((_, i) => i !== best).forEach(({ work, panel }, i) => {
      const f = FACES[i];
      const job = { busy: 'Flattening…', rot: 0, auto: 0, manual: false };
      faces[f] = job;
      renderSlot(f);
      queue = queue.then(() => processPhoto(f, null, job, work, panel)).catch((err) => {
        console.error(err);
        if (faces[f] === job) { job.busy = null; job.error = err.message || 'Something went wrong'; renderSlot(f); }
      });
    });
  }).catch((err) => {
    console.error(err);
    status(err.message || "Couldn't open those photos");
    for (const f of FACES) if (faces[f] && faces[f].busy) { faces[f] = null; renderSlot(f); }
    scale = null; renderScaleSlot();
  });
}

// how much of the card outline is the panel outline (0 = apart, 1 = same)
function overlap(a, b, work) {
  if (!a || !b) return 0;
  const inside = (q, x, y) => {
    for (let i = 0; i < 4; i++) {
      const p = q[i], n = q[(i + 1) % 4];
      if ((n[0] - p[0]) * (y - p[1]) - (n[1] - p[1]) * (x - p[0]) < 0) return false;
    }
    return true;
  };
  let ia = 0, both = 0, any = 0;
  const step = Math.max(work.width, work.height) / 80;
  for (let y = 0; y < work.height; y += step) for (let x = 0; x < work.width; x += step) {
    const A = inside(a, x, y), B = inside(b, x, y);
    if (A) ia++;
    if (A && B) both++;
    if (A || B) any++;
  }
  return any ? both / any : 0;
}

function addScalePhoto(file) {
  scale = { busy: 'Opening photo…' };
  renderScaleSlot();
  queue = queue.then(async () => setScalePhoto(await decodePhoto(file))).catch((err) => {
    console.error(err);
    scale = null;
    renderScaleSlot();
    status(err.message || "Couldn't open that photo");
  });
}

function setScalePhoto(work) {
  const card = findCard(work) || defaultQuad(work.width, work.height);
  // a first measuring line beside the card, for you to drag onto a box edge
  const cx = (card[1][0] + card[2][0]) / 2, cy = (card[1][1] + card[2][1]) / 2;
  const len = Math.hypot(card[2][0] - card[1][0], card[2][1] - card[1][1]);
  const ux = (card[2][0] - card[1][0]) / (len || 1), uy = (card[2][1] - card[1][1]) / (len || 1);
  const off = 0.25 * len;
  const clampP = (p) => [Math.min(work.width - 1, Math.max(0, p[0])), Math.min(work.height - 1, Math.max(0, p[1]))];
  const line = [
    clampP([cx + uy * off - ux * len * 0.4, cy - ux * off - uy * len * 0.4]),
    clampP([cx + uy * off + ux * len * 0.4, cy - ux * off + uy * len * 0.4]),
  ];
  scale = { work, card: card.map((p) => p.slice()), line, dim: 'long', mm: 0, placed: false };
  measure();
  renderScaleSlot();
}

// mm along the line, and from it the real height that the rest of the page uses
function measure() {
  if (!scale || !scale.work) return;
  scale.mm = lineMM(scale.card, scale.line, scale.work.width, scale.work.height);
  applyScale();
}
function applyScale() {
  if (!scale || !scale.mm || !scale.placed || !dims) return;
  const unit = sideBySize(dims)[scale.dim];   // that side, in units where H = 1
  if (!(unit > 0)) return;
  const hcm = scale.mm / unit / 10;
  S.realH = hcm.toFixed(1);
  $('realH').value = S.realH;
  persist();
  showDims();
}

// One photo at a time through decode → find → flatten, so phones don't run out of memory.
let queue = Promise.resolve();
function addPhoto(f, file) {
  faces[f] = { busy: 'Opening photo…', rot: 0, auto: 0, manual: false };
  renderSlot(f);
  const job = faces[f];
  queue = queue.then(() => processPhoto(f, file, job)).catch((err) => {
    console.error(err);
    if (faces[f] === job) { job.busy = null; job.error = err.message || 'Something went wrong'; renderSlot(f); }
  });
}

async function processPhoto(f, file, job, work = null, known = undefined) {
  const stillHere = () => faces[f] === job;
  job.work = work || (await decodePhoto(file));
  if (!stillHere()) return;
  job.busy = window.cv && window.cv.Mat ? 'Finding the panel…' : 'Loading vision (10 MB, once)…';
  renderSlot(f);
  if (!(window.cv && window.cv.Mat)) status('Loading the vision library, about 10 MB, only the first time', true);
  await loadCV();
  status('');
  job.busy = 'Finding the panel…';
  renderSlot(f);
  await new Promise((r) => setTimeout(r, 30));
  let q = known === undefined ? null : known;
  if (known === undefined) {
    try { q = await findPanel(job.work); } catch (e) { console.warn('panel finding failed', e); }
  }
  if (!stillHere()) return;
  job.quad = q || defaultQuad(job.work.width, job.work.height);
  job.found = !!q;
  await reflatten(f);
  job.busy = null;
  renderSlot(f);
  refit();
}

async function reflatten(f) {
  const s = faces[f];
  s.aspect = panelAspect(s.quad, s.work.width, s.work.height);
  const q = s.quad;
  const edge = Math.max(
    Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]), Math.hypot(q[2][0] - q[3][0], q[2][1] - q[3][1]),
    Math.hypot(q[3][0] - q[0][0], q[3][1] - q[0][1]), Math.hypot(q[2][0] - q[1][0], q[2][1] - q[1][1])
  );
  const long = Math.max(64, Math.min(1024, Math.round(edge)));
  const w = s.aspect >= 1 ? long : Math.round(long * s.aspect);
  const h = s.aspect >= 1 ? Math.round(long / s.aspect) : long;
  s.flat = await flatten(s.work, q, Math.max(8, w), Math.max(8, h));
  orient(f);
}

function orient(f) {
  const s = faces[f];
  const turns = (s.rot + s.auto) % 4;
  const src = s.flat;
  const c = document.createElement('canvas');
  const odd = turns % 2 === 1;
  c.width = odd ? src.height : src.width;
  c.height = odd ? src.width : src.height;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2);
  g.rotate((turns * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  s.panel = c;
}

/* ---------- box proportions ---------- */

// Unknowns: log W and log D, with log H = 0. Each panel adds one equation:
//   front/back  logW        = log(w/h)
//   left/right  logD        = log(w/h)
//   top/bottom  logW - logD = log(w/h)
// A panel nobody has rotated by hand may get an extra quarter turn when that
// fits the other panels better (a side photographed sideways, or a box that
// was lying down in the photos).
function refit() {
  const have = FACES.filter((f) => faces[f] && faces[f].flat && !faces[f].busy);
  const row = { front: [1, 0], back: [1, 0], left: [0, 1], right: [0, 1], top: [1, -1], bottom: [1, -1] };
  // every panel you haven't turned by hand may get a quarter turn, the front
  // included: a box photographed lying down then stands up on its own
  const free = have.filter((f) => !faces[f].manual);

  const solve = (flips) => {
    // ridge prior (weight 0.05) keeps it solvable with only a few panels
    let a = 0.05, b = 0, c = 0.05, y1 = 0, y2 = 0;
    const eqs = have.map((f) => {
      const s = faces[f];
      let l = Math.log(s.aspect);
      if (s.rot % 2 === 1) l = -l;
      if (flips[f]) l = -l;
      return [row[f], l];
    });
    for (const [[p, q], l] of eqs) { a += p * p; b += p * q; c += q * q; y1 += p * l; y2 += q * l; }
    const det = a * c - b * b;
    const lw = (c * y1 - b * y2) / det, ld = (a * y2 - b * y1) / det;
    let err = 0;
    for (const [[p, q], l] of eqs) err += (p * lw + q * ld - l) ** 2;
    return { lw, ld, err };
  };

  let best = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const flips = {};
    let n = 0;
    free.forEach((f, i) => { flips[f] = !!(mask & (1 << i)); if (flips[f]) n++; });
    const r = solve(flips);
    r.err += 0.02 * n;      // prefer photos as taken
    r.flips = flips;
    if (!best || r.err < best.err) best = r;
  }

  for (const f of have) {
    const s = faces[f];
    const want = best && best.flips[f] ? 1 : 0;
    if (s.auto !== want) { s.auto = want; orient(f); renderSlot(f); }
    box.setFace(f, s.panel);
  }
  if (have.length && best) {
    dims = { w: Math.exp(best.lw), h: 1, d: Math.exp(best.ld) };
    // without any panel that shows D, borrow a modest depth
    if (!have.some((f) => row[f][1] !== 0)) dims.d = Math.min(dims.w, 1) * 0.5;
    box.setDims(dims.w, dims.h, dims.d);
  } else {
    dims = null;
    box.setDims(1, 1, 1);
  }
  $('boxHint').hidden = have.length > 0;
  document.querySelector('.intro').hidden = FACES.some((f) => faces[f]);
  $('saveBox').disabled = have.length === 0 || FACES.some((f) => faces[f] && faces[f].busy);
  applyScale();
  showDims();
  if (S.view === 'dieline') renderDieline();
}

function showDims() {
  const el = $('dims');
  if (!dims) { el.textContent = 'W × H × D'; return; }
  const H = parseFloat(S.realH);
  if (H > 0) {
    const k = H / dims.h;
    el.textContent = `${(dims.w * k).toFixed(1)} × ${(dims.h * k).toFixed(1)} × ${(dims.d * k).toFixed(1)} cm`;
  } else {
    const m = Math.max(dims.w, dims.h, dims.d);
    el.textContent = `${(dims.w / m).toFixed(2)} × ${(dims.h / m).toFixed(2)} × ${(dims.d / m).toFixed(2)}`;
  }
}

/* ---------- editor: drag the corners ---------- */

let edFace = null;
let edQuad = null;
let edLine = null;     // the measuring line, in scale mode
let drag = null;

const faceSeg = $('faceSeg');
for (const f of FACES) {
  const b = document.createElement('button');
  b.textContent = LABEL[f];
  b.dataset.face = f;
  b.addEventListener('click', () => moveFace(edFace, f));
  faceSeg.appendChild(b);
}

function openEditor(f) {
  edFace = f;
  const isScale = f === 'scale';
  $('editor').classList.toggle('scale-mode', isScale);
  const s = isScale ? scale : faces[f];
  // older saved boxes may have a corner past the photo's edge: pull it in
  edQuad = clampQuad(isScale ? s.card : s.quad, s.work.width, s.work.height);
  edLine = isScale ? s.line.map((p) => p.slice()) : null;
  if (isScale) { updateDimSeg(); showMeasure(); }
  const c = $('edCanvas');
  c.width = s.work.width; c.height = s.work.height;
  c.getContext('2d').drawImage(s.work, 0, 0);
  $('editor').hidden = false;
  updateFaceSeg();
  requestAnimationFrame(() => { layoutSvg(); drawQuad(); showPreview(); });
}

function updateFaceSeg() {
  faceSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.face === edFace)));
}

function closeEditor() {
  $('editor').hidden = true;
  edFace = null;
  drag = null;
}
$('edDone').addEventListener('click', closeEditor);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && edFace) closeEditor(); });

// Swap this photo into another face (whatever was there comes here).
function moveFace(from, to) {
  if (!from || from === to) return;
  const a = faces[from], b = faces[to];
  faces[to] = a; faces[from] = b;
  for (const f of [from, to]) {
    const s = faces[f];
    if (s) { s.manual = false; s.auto = 0; orient(f); } else box.setFace(f, null);
    renderSlot(f);
  }
  edFace = to;
  updateFaceSeg();
  refit();
  showPreview();
}

function layoutSvg() {
  const c = $('edCanvas'), svg = $('edSvg');
  // fit the whole photo in its area (CSS max-height can't see a grid row's height)
  const box = $('edPhoto').getBoundingClientRect();
  const k = Math.min((box.width - 24) / c.width, (box.height - 24) / c.height);
  c.style.width = Math.round(c.width * k) + 'px';
  c.style.height = Math.round(c.height * k) + 'px';
  const r = c.getBoundingClientRect(), pr = $('edPhoto').getBoundingClientRect();
  svg.style.left = r.left - pr.left + 'px';
  svg.style.top = r.top - pr.top + 'px';
  svg.style.width = r.width + 'px';
  svg.style.height = r.height + 'px';
  svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);
}
window.addEventListener('resize', () => { if (edFace) { layoutSvg(); drawQuad(); } });

function drawQuad() {
  const svg = $('edSvg');
  const isScale = edFace === 'scale';
  const c = $('edCanvas');
  const k = c.width / Math.max(1, c.getBoundingClientRect().width);   // image px per screen px
  const ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren();
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('class', 'quad');
  poly.setAttribute('points', edQuad.map((p) => p.join(',')).join(' '));
  svg.appendChild(poly);
  edQuad.forEach((p, i) => {
    const v = document.createElementNS(ns, 'rect');
    v.setAttribute('class', 'hv');
    const s = 12 * k;
    v.setAttribute('x', p[0] - s / 2); v.setAttribute('y', p[1] - s / 2);
    v.setAttribute('width', s); v.setAttribute('height', s);
    v.setAttribute('transform', `rotate(45 ${p[0]} ${p[1]})`);
    const h = document.createElementNS(ns, 'circle');
    h.setAttribute('class', 'h');
    h.setAttribute('cx', p[0]); h.setAttribute('cy', p[1]); h.setAttribute('r', 26 * k);
    h.dataset.i = i;
    h.addEventListener('pointerdown', startDrag);
    svg.appendChild(v);
    svg.appendChild(h);
  });
  if (isScale && edLine) {
    const ln = document.createElementNS(ns, 'line');
    ln.setAttribute('class', 'mline');
    ln.setAttribute('x1', edLine[0][0]); ln.setAttribute('y1', edLine[0][1]);
    ln.setAttribute('x2', edLine[1][0]); ln.setAttribute('y2', edLine[1][1]);
    svg.appendChild(ln);
    // label at the middle
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('class', 'mtext');
    t.setAttribute('x', (edLine[0][0] + edLine[1][0]) / 2 + 14 * k);
    t.setAttribute('y', (edLine[0][1] + edLine[1][1]) / 2 - 14 * k);
    t.setAttribute('font-size', 15 * k);
    t.textContent = scale && scale.mm ? `${scale.mm.toFixed(1)} mm` : '';
    svg.appendChild(t);
    edLine.forEach((p, j) => {
      const v = document.createElementNS(ns, 'circle');
      v.setAttribute('class', 'lv');
      v.setAttribute('cx', p[0]); v.setAttribute('cy', p[1]); v.setAttribute('r', 7 * k);
      const h = document.createElementNS(ns, 'circle');
      h.setAttribute('class', 'h');
      h.setAttribute('cx', p[0]); h.setAttribute('cy', p[1]); h.setAttribute('r', 26 * k);
      h.dataset.i = 4 + j;
      h.addEventListener('pointerdown', startDrag);
      svg.appendChild(v);
      svg.appendChild(h);
    });
  }
}

const pt = (i) => (i < 4 ? edQuad[i] : edLine[i - 4]);
const setPt = (i, p) => { if (i < 4) edQuad[i] = p; else edLine[i - 4] = p; };

function toImage(e) {
  const c = $('edCanvas'), r = c.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * c.width, ((e.clientY - r.top) / r.height) * c.height];
}

function startDrag(e) {
  e.preventDefault();
  const i = +e.target.dataset.i;
  const p = toImage(e);
  drag = { i, dx: pt(i)[0] - p[0], dy: pt(i)[1] - p[1], id: e.pointerId };
  $('edSvg').setPointerCapture(e.pointerId);
  $('loupe').hidden = false;
  drawLoupe();
}
$('edSvg').addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const c = $('edCanvas');
  const p = toImage(e);
  setPt(drag.i, [
    Math.min(c.width, Math.max(0, p[0] + drag.dx)),
    Math.min(c.height, Math.max(0, p[1] + drag.dy)),
  ]);
  if (edFace === 'scale') { scale.line = edLine.map((q) => q.slice()); scale.card = edQuad.map((q) => q.slice()); scale.mm = lineMM(scale.card, scale.line, scale.work.width, scale.work.height); }
  drawQuad();
  drawLoupe();
});
const endDrag = async (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  $('loupe').hidden = true;
  await commitQuad();
};
$('edSvg').addEventListener('pointerup', endDrag);
$('edSvg').addEventListener('pointercancel', endDrag);

function drawLoupe() {
  if (!drag) return;
  const L = $('loupe'), g = L.getContext('2d');
  const s = edFace === 'scale' ? scale.work : faces[edFace].work;
  const p = pt(drag.i);
  const zoom = 3 * (s.width / Math.max(1, $('edCanvas').getBoundingClientRect().width)) ** 0.5;
  const span = L.width / zoom;
  g.fillStyle = '#000';
  g.fillRect(0, 0, L.width, L.height);
  g.imageSmoothingEnabled = true;
  g.drawImage(s, p[0] - span / 2, p[1] - span / 2, span, span, 0, 0, L.width, L.height);
  g.strokeStyle = '#28e5b0';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(L.width / 2, 0); g.lineTo(L.width / 2, L.height);
  g.moveTo(0, L.height / 2); g.lineTo(L.width, L.height / 2);
  g.stroke();
  // keep the loupe out from under the finger
  const r = $('edCanvas').getBoundingClientRect(), pr = $('edPhoto').getBoundingClientRect();
  const sx = r.left - pr.left + (p[0] / s.width) * r.width;
  const right = sx < pr.width / 2;
  L.style.left = right ? 'auto' : '12px';
  L.style.right = right ? '12px' : 'auto';
}

async function commitQuad() {
  const f = edFace;
  if (!f) return;
  if (f === 'scale') {
    scale.card = orderQuad(edQuad);
    edQuad = scale.card.map((p) => p.slice());
    scale.line = edLine.map((p) => p.slice());
    scale.placed = true;
    measure();
    drawQuad();
    showMeasure();
    renderScaleSlot();
    return;
  }
  faces[f].quad = orderQuad(edQuad);
  edQuad = faces[f].quad.map((p) => p.slice());
  drawQuad();
  await reflatten(f);
  renderSlot(f);
  refit();
  showPreview();
}

// scale mode: which box side the line measures, and the reading
const dimSeg = $('dimSeg');
for (const d of ['long', 'mid', 'short']) {
  const b = document.createElement('button');
  b.textContent = DIM_LABEL[d];
  b.dataset.dim = d;
  b.addEventListener('click', () => { scale.dim = d; scale.placed = true; updateDimSeg(); applyScale(); showMeasure(); renderScaleSlot(); });
  dimSeg.appendChild(b);
}
function updateDimSeg() {
  dimSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(scale && b.dataset.dim === scale.dim)));
}
function showMeasure() {
  const el = $('measure');
  if (!scale) { el.textContent = ''; return; }
  const H = parseFloat(S.realH);
  el.innerHTML = `<b>${scale.mm.toFixed(1)} mm</b> along the box's ${DIM_LABEL[scale.dim].toLowerCase()} side` +
    (scale.placed && dims && H > 0
      ? `<br>Box: ${(dims.w * H * 10).toFixed(0)} × ${(H * 10).toFixed(0)} × ${(dims.d * H * 10).toFixed(0)} mm (W × H × D)`
      : '<br><span class="dim">Drag the white line along one box edge, then pick which side it is.</span>');
}

function showPreview() {
  if (edFace === 'scale') return;
  const s = edFace && faces[edFace];
  const holder = $('edPreview');
  holder.replaceChildren();
  if (s && s.panel) {
    const c = document.createElement('canvas');
    c.width = s.panel.width; c.height = s.panel.height;
    c.getContext('2d').drawImage(s.panel, 0, 0);
    holder.appendChild(c);
  }
}

$('edRotate').addEventListener('click', () => {
  const s = faces[edFace];
  if (!s) return;
  // fold the automatic turn into the manual one so the turn you see is the turn you get
  s.rot = (s.rot + s.auto + 1) % 4;
  s.auto = 0;
  s.manual = true;
  orient(edFace);
  renderSlot(edFace);
  refit();
  showPreview();
});
$('edDetect').addEventListener('click', async () => {
  const f = edFace, s = faces[f];
  if (f === 'scale') {
    const q = findCard(scale.work);
    if (q) { edQuad = q.map((p) => p.slice()); await commitQuad(); } else status("Couldn't find the card. Drag its corners instead.");
    return;
  }
  $('edDetect').disabled = true;
  $('edDetect').textContent = 'Looking…';
  try {
    const q = await findPanel(s.work);
    if (q) { edQuad = q; await commitQuad(); } else status("Couldn't find a panel. Drag the corners instead.");
  } finally {
    $('edDetect').disabled = false;
    $('edDetect').textContent = 'Find panel again';
  }
});
$('edReplace').addEventListener('click', () => { const f = edFace; closeEditor(); pickOne(f); });
$('edRemove').addEventListener('click', () => {
  const f = edFace;
  closeEditor();
  if (f === 'scale') { scale = null; renderScaleSlot(); return; }
  faces[f] = null;
  renderSlot(f);
  box.setFace(f, null);
  refit();
});

/* ---------- dieline ---------- */

let dieArt = true;
function dielineInput() {
  const H = parseFloat(S.realH);
  const real = H > 0;
  const hmm = real ? H * 10 : 100;      // without a real size, draw it 100 mm tall
  const d = dims || { w: 0.6, h: 1, d: 0.35 };
  const art = {};
  if (dieArt) for (const f of FACES) if (faces[f] && faces[f].panel && !faces[f].busy) art[f] = faces[f].panel;
  return { W: d.w * hmm, H: hmm, D: d.d * hmm, real, art };
}
function renderDieline() {
  const holder = $('dieline');
  const { svg, size } = buildDieline(dielineInput());
  holder.innerHTML = svg;
  $('dieNote').textContent = size.real
    ? `${size.W.toFixed(1)} × ${size.H.toFixed(1)} × ${size.D.toFixed(1)} mm box · sheet ${size.sheetW.toFixed(0)} × ${size.sheetH.toFixed(0)} mm · print at 100%`
    : 'Not to scale yet: add a scale card photo or a real height (Control) to print at real size';
}
$('dieArt').addEventListener('click', () => { dieArt = !dieArt; setSwitch($('dieArt'), dieArt); renderDieline(); });
$('dieSvg').addEventListener('click', () => {
  const { svg } = buildDieline(dielineInput());
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  a.download = `dieline-${Date.now()}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
$('diePrint').addEventListener('click', () => {
  renderDieline();
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1000);
});

/* ---------- saving: the shelf ---------- */

function setCurrent(id) {
  currentId = id;
  S.openId = id;
  persist();
}

let saving = false;
async function saveBox() {
  const have = FACES.filter((f) => faces[f] && faces[f].flat && !faces[f].busy);
  if (!have.length || saving) return;
  saving = true;
  $('saveBox').disabled = true;
  $('saveBox').textContent = 'Saving…';
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const old = currentId ? await getBox(currentId) : null;
    const rec = {
      id: currentId || `box-${Date.now().toString(36)}`,
      name: old ? old.name : await nextName(),
      created: old ? old.created : Date.now(),
      updated: Date.now(),
      dims, realH: S.realH,
      faces: {},
    };
    for (const f of have) {
      const s = faces[f];
      rec.faces[f] = {
        photo: await toBlob(s.work, 'image/jpeg', 0.88),
        flat: await toBlob(s.flat, 'image/jpeg', 0.9),
        quad: s.quad, rot: s.rot, auto: s.auto, manual: s.manual, aspect: s.aspect,
      };
    }
    if (scale && scale.work) {
      rec.scale = { photo: await toBlob(scale.work, 'image/jpeg', 0.88), card: scale.card, line: scale.line, dim: scale.dim, placed: scale.placed };
    }
    rec.thumb = await toBlob(box.snapshot(480), 'image/jpeg', 0.85);
    await putBox(rec);
    setCurrent(rec.id);
    status(`Saved “${rec.name}” to the shelf`);
  } catch (e) {
    console.error(e);
    status("Couldn't save: this browser may be out of storage space. Try deleting a box from the shelf.");
  } finally {
    saving = false;
    $('saveBox').textContent = 'Save box';
    refit();
  }
}
$('saveBox').addEventListener('click', saveBox);

async function nextName() {
  const all = await listBoxes();
  let n = all.length + 1;
  while (all.some((b) => b.name === `Box ${n}`)) n++;
  return `Box ${n}`;
}

async function openBox(id) {
  const rec = await getBox(id);
  if (!rec) { status('That box is no longer on the shelf'); setCurrent(null); return; }
  for (const f of FACES) {
    const r = rec.faces[f];
    if (!r) { faces[f] = null; box.setFace(f, null); renderSlot(f); continue; }
    const [work, flat] = await Promise.all([toCanvas(r.photo), toCanvas(r.flat)]);
    faces[f] = { work, flat, quad: r.quad, rot: r.rot, auto: r.auto, manual: r.manual, aspect: r.aspect, found: true };
    orient(f);
    renderSlot(f);
  }
  if (rec.realH != null) { S.realH = rec.realH; $('realH').value = rec.realH; persist(); }
  scale = null;
  if (rec.scale) {
    scale = { work: await toCanvas(rec.scale.photo), card: rec.scale.card, line: rec.scale.line, dim: DIM_LABEL[rec.scale.dim] ? rec.scale.dim : 'long', placed: rec.scale.placed, mm: 0 };
    scale.mm = lineMM(scale.card, scale.line, scale.work.width, scale.work.height);
  }
  renderScaleSlot();
  setCurrent(rec.id);
  refit();
}

const thumbURLs = [];
async function renderShelf() {
  const shelf = $('shelf');
  let all = [];
  try { all = await listBoxes(); } catch (e) { console.error(e); }
  thumbURLs.splice(0).forEach((u) => URL.revokeObjectURL(u));
  shelf.replaceChildren();

  const add = document.createElement('button');
  add.className = 'card new';
  add.innerHTML = '<span><span class="plus">+</span>New box</span>';
  add.addEventListener('click', () => { clearFaces(); setView('panels'); });
  shelf.appendChild(add);

  if (!all.length) {
    const p = document.createElement('p');
    p.className = 'shelf-empty';
    p.textContent = 'No boxes yet. Build one in Panels, then press Save box.';
    shelf.appendChild(p);
  }
  for (const rec of all) {
    const card = document.createElement('div');
    card.className = 'card' + (rec.id === currentId ? ' current' : '');
    const pic = document.createElement('button');
    pic.className = 'pic';
    pic.setAttribute('aria-label', `Open ${rec.name}`);
    if (rec.thumb) {
      const img = document.createElement('img');
      const u = URL.createObjectURL(rec.thumb);
      thumbURLs.push(u);
      img.src = u; img.alt = '';
      pic.appendChild(img);
    }
    pic.addEventListener('click', async () => { await openBox(rec.id); setView('box'); });

    const meta = document.createElement('div');
    meta.className = 'meta';
    const name = document.createElement('input');
    name.value = rec.name;
    name.setAttribute('aria-label', 'Box name');
    name.addEventListener('change', async () => {
      const r = await getBox(rec.id);
      if (!r) return;
      r.name = name.value.trim() || r.name;
      name.value = r.name;
      await putBox(r);
    });
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
    const sub = document.createElement('div');
    sub.className = 'sub';
    const d = rec.dims;
    const H = parseFloat(rec.realH);
    sub.textContent = d
      ? (H > 0 ? `${(d.w * H).toFixed(1)} × ${H.toFixed(1)} × ${(d.d * H).toFixed(1)} cm` : `${d.w.toFixed(2)} × 1 × ${d.d.toFixed(2)}`)
      : '';
    const date = document.createElement('div');
    date.className = 'sub';
    date.textContent = new Date(rec.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    const acts = document.createElement('div');
    acts.className = 'acts';
    const open = document.createElement('button');
    open.className = 'btn';
    open.textContent = 'Open';
    open.addEventListener('click', async () => { await openBox(rec.id); setView('panels'); });
    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = 'Delete';
    let armed = 0;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = 'Tap to delete';
        del.classList.add('warn');
        armed = setTimeout(() => { armed = 0; del.textContent = 'Delete'; del.classList.remove('warn'); }, 3000);
        return;
      }
      clearTimeout(armed);
      await deleteBox(rec.id);
      if (rec.id === currentId) setCurrent(null);
      status(`Deleted “${rec.name}”`);
      renderShelf();
    });
    acts.append(open, del);
    meta.append(name, sub, date, acts);
    card.append(pic, meta);
    shelf.appendChild(card);
  }
}

/* ---------- keys ---------- */

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey || e.altKey || edFace) return;
  const k = e.key.toLowerCase();
  if (k === 's') {
    e.preventDefault();
    box.render();
    const a = document.createElement('a');
    a.download = `packaging-${Date.now()}.png`;
    a.href = $('boxCanvas').toDataURL('image/png');
    a.click();
  } else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }
});

/* ---------- start ---------- */

setPanel(S.panel);
setSwitch($('spinToggle'), S.spin);
box.setSpin(S.spin);
setView(S.view);
refit();
// reopen the box that was open last time
if (S.openId) openBox(S.openId).catch((e) => { console.warn(e); setCurrent(null); });

// for testing in the console
window.packaging = { faces, refit, SIZE, saveBox, openBox, listBoxes, getScale: () => scale, dielineInput };
