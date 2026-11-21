/*
 * stage.js — the shared CC2026 stage for p5.js (global mode).
 *
 * Call `stage()` instead of `createCanvas()` in setup(). You get:
 *   - a fixed 2000×2000 canvas at pixelDensity(1), so exports are exactly 2000×2000
 *   - the canvas scaled with CSS to fit the window (mouseX / mouseY / touches
 *     stay in 0–2000 canvas coordinates, p5 maps them for you)
 *   - press S to save a PNG, press F for fullscreen
 *
 * This file is copied into each challenge, so a challenge can change it freely.
 */
const STAGE_SIZE = 2000;

function stage(opts = {}) {
  const { exportKey = 's', fullscreenKey = 'f', margin = 24, renderer } = opts;

  const cnv = renderer ? createCanvas(STAGE_SIZE, STAGE_SIZE, renderer) : createCanvas(STAGE_SIZE, STAGE_SIZE);
  pixelDensity(1);
  cnv.elt.classList.add('stage');

  const fit = () => {
    const pad = fullscreen() ? 0 : margin;
    const px = Math.floor(Math.min(window.innerWidth, window.innerHeight) - pad * 2);
    cnv.elt.style.width = px + 'px';
    cnv.elt.style.height = px + 'px';
  };
  fit();
  window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);

  // A plain listener, so your own keyPressed() still works.
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return; // typing, not shortcuts
    const k = e.key.toLowerCase();
    if (exportKey && k === exportKey) saveStage();
    if (fullscreenKey && k === fullscreenKey) fullscreen(!fullscreen());
  });

  return cnv;
}

// Saves the canvas as <folder-name>-<timestamp>.png
function saveStage(name) {
  const slug = name || location.pathname.split('/').filter(Boolean).pop() || 'cc2026';
  const t = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  saveCanvas(`${slug}-${t}`, 'png');
}
