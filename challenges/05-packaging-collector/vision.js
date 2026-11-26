// Vision helpers: decode photos (HEIC too), find the box panel in a photo,
// flatten it, and estimate its true width / height.
//
// Panel finding runs on a small copy of the photo (480 px on the long side):
//   1. GrabCut (OpenCV.js) separates the held box from the shelf behind it.
//      Skin-coloured pixels start as "probably background" so the hand
//      holding the box mostly drops out.
//   2. A quadrilateral is fitted to that mask (corners nudged to cover as
//      much mask and as little non-mask as possible), then each side snaps
//      to the strongest straight edge nearby.
//   3. A second GrabCut seeded from that quad tidies the result, and the
//      fit + snap runs again.
// It is a best guess: every corner stays draggable in the editor.

const CV_URL = 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js';
const HEIC_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/heic-to.js';

export const WORK_MAX = 2048;   // long side of the working copy of each photo
const DET_MAX = 480;            // long side used for panel finding

/* ---------- script loading ---------- */

const scripts = {};
function loadScript(url) {
  if (!scripts[url]) {
    scripts[url] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => { delete scripts[url]; reject(new Error('Could not load ' + url)); };
      document.head.appendChild(s);
    });
  }
  return scripts[url];
}

let cvReady = null;
export function loadCV() {
  if (!cvReady) {
    cvReady = loadScript(CV_URL).then(async () => {
      // The build hands back either a Promise or an Emscripten module that
      // fills in later; poll until cv.Mat exists either way.
      let c = window.cv;
      if (c instanceof Promise) c = await c;   // (a real Promise, not the thenable module)
      const t0 = performance.now();
      while (!(c && c.Mat)) {
        if (performance.now() - t0 > 60000) throw new Error('The vision library took too long to start.');
        await new Promise((r) => setTimeout(r, 50));
        if (window.cv && window.cv.Mat) c = window.cv;
      }
      // Emscripten modules are "thenable"; returning one from a promise would
      // try to await it forever, so drop .then once the module is ready.
      if (typeof c.then === 'function') delete c.then;
      window.cv = c;
      return c;
    });
    cvReady.catch(() => { cvReady = null; });
  }
  return cvReady;
}

/* ---------- decoding ---------- */

function isHeic(file) {
  return /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

// Returns a canvas with the photo, upright, at most WORK_MAX on the long side.
export async function decodePhoto(file) {
  let bmp = null;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    if (!isHeic(file)) throw new Error("This file isn't an image the browser can open.");
  }
  if (!bmp) {
    // Safari opens HEIC natively; other browsers need a decoder (libheif, ~3 MB, loaded once).
    const { heicTo } = await import(HEIC_URL);
    bmp = await heicTo({ blob: file, type: 'bitmap' });
  }
  const k = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c;
}

/* ---------- small geometry helpers ---------- */

// Corners in order TL, TR, BR, BL (clockwise on screen).
export function orderQuad(q) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  const s = q.slice().sort((a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx));
  // atan2 order on screen (y down) runs clockwise. Start at the top-left-most.
  let k = 0;
  for (let i = 1; i < 4; i++) if (s[i][0] + s[i][1] < s[k][0] + s[k][1]) k = i;
  return [0, 1, 2, 3].map((i) => s[(k + i) % 4].slice());
}

function signedArea(q) {
  let a = 0;
  for (let i = 0; i < 4; i++) {
    const p = q[i], n = q[(i + 1) % 4];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return a / 2;
}

function convex(q) {
  // every corner turns the same (clockwise) way: no folds, no bow-ties
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) <= 0) return false;
  }
  return true;
}

// How far a quad strays from what a photographed rectangle looks like:
// corners more than ~30° off square, opposite sides of very different length.
function bend(q) {
  let e = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const ux = a[0] - b[0], uy = a[1] - b[1], vx = c[0] - b[0], vy = c[1] - b[1];
    const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1);
    e += Math.max(0, Math.abs(Math.acos(Math.max(-1, Math.min(1, cos))) - Math.PI / 2) - 0.5);
  }
  // ...and opposite sides stay within ~1.6× of each other
  const L = (i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]) || 1e-6;
  e += Math.max(0, Math.abs(Math.log(L(0) / L(2))) - 0.5);
  e += Math.max(0, Math.abs(Math.log(L(1) / L(3))) - 0.5);
  return e;
}

function insideConvex(q, x, y) {
  // q clockwise on screen (positive signed area with y down)
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < 0) return false;
  }
  return true;
}

function scaleAbout(q, k) {
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
}

export function defaultQuad(w, h) {
  return [[w * 0.25, h * 0.2], [w * 0.75, h * 0.2], [w * 0.75, h * 0.8], [w * 0.25, h * 0.8]];
}

/* ---------- mask helpers (plain JS on Uint8Arrays) ---------- */

function close3(m, w, h, r) {
  // dilate then erode with a (2r+1) square
  return erode(dilate(m, w, h, r), w, h, r);
}
function dilate(m, w, h, r) { return morph(m, w, h, r, 1); }
function erode(m, w, h, r) { return morph(m, w, h, r, 0); }
function morph(m, w, h, r, hit) {
  // separable square structuring element
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = hit ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const xx = x + d;
        const s = xx < 0 || xx >= w ? (hit ? 0 : 1) : m[y * w + xx];
        if (hit ? s : !s) { v = hit; break; }
      }
      t[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = hit ? 0 : 1;
      for (let d = -r; d <= r; d++) {
        const yy = y + d;
        const s = yy < 0 || yy >= h ? (hit ? 0 : 1) : t[yy * w + x];
        if (hit ? s : !s) { v = hit; break; }
      }
      o[y * w + x] = v;
    }
  }
  return o;
}

function fillHoles(m, w, h) {
  // background reachable from the border stays background, the rest is filled
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => { if (!m[i] && !seen[i]) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = m[i] || !seen[i] ? 1 : 0;
  return o;
}

function pickComponent(m, w, h) {
  // largest blob, weighted towards the middle of the photo
  const lab = new Int32Array(w * h);
  let best = null, n = 0;
  const diag = Math.hypot(w, h);
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || lab[s]) continue;
    n++;
    const stack = [s];
    lab[s] = n;
    let area = 0, sx = 0, sy = 0;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i / w) | 0;
      area++; sx += x; sy += y;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of nb) if (j >= 0 && m[j] && !lab[j]) { lab[j] = n; stack.push(j); }
    }
    const d = Math.hypot(sx / area - w / 2, sy / area - h / 2) / diag;
    const score = area * (1 - d);
    if (!best || score > best.score) best = { score, id: n };
  }
  const o = new Uint8Array(w * h);
  if (best) for (let i = 0; i < w * h; i++) o[i] = lab[i] === best.id ? 1 : 0;
  return o;
}

function minAreaRect(m, w, h) {
  // boundary points, then the tightest rotated box over 180 angles
  const pts = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (m[i] && (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w])) pts.push([x, y]);
    }
  }
  if (pts.length < 4) return null;
  let best = null;
  for (let a = 0; a < 90; a += 0.5) {
    const t = (a * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      const u = x * c + y * s, v = -x * s + y * c;
      if (u < x0) x0 = u; if (u > x1) x1 = u;
      if (v < y0) y0 = v; if (v > y1) y1 = v;
    }
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) best = { area, c, s, x0, x1, y0, y1 };
  }
  const { c, s, x0, x1, y0, y1 } = best;
  const back = (u, v) => [u * c - v * s, u * s + v * c];
  return orderQuad([back(x0, y0), back(x1, y0), back(x1, y1), back(x0, y1)]);
}

function fitQuad(m, w, h, q0, lam, aspect = 0) {
  // corner-by-corner hill climb on (mask inside) - lam * (non-mask inside)
  const step0 = 5;
  const P = [];
  for (let y = 0; y < h; y += step0) for (let x = 0; x < w; x += step0) P.push(x, y, m[y * w + x] ? 1 : -lam);
  let q = orderQuad(q0);
  if (signedArea(q) < 0) q = q.reverse();
  let fg = 0;
  for (let k = 2; k < P.length; k += 3) if (P[k] > 0) fg++;
  // A box face seen in a photo keeps its corners within ~30° of square;
  // past that, charge for the bend (see bend()) so a missing patch (a finger,
  // a shiny sticker) can't drag one corner inwards.
  const F = (q) => {
    let f = 0;
    for (let k = 0; k < P.length; k += 3) if (insideConvex(q, P[k], P[k + 1])) f += P[k + 2];
    let pen = bend(q);
    if (aspect) {
      // a known shape (the card): pull the long/short ratio towards it
      const L = (i) => Math.hypot(q[(i + 1) % 4][0] - q[i][0], q[(i + 1) % 4][1] - q[i][1]);
      const r = (L(0) + L(2)) / (L(1) + L(3) || 1);
      const rr = r >= 1 ? r : 1 / r;
      pen += 2 * Math.max(0, Math.abs(Math.log(rr / aspect)) - 0.12);
    }
    return f - pen * fg;
  };
  let f = F(q);
  let step = Math.max(w, h) * 0.08;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let guard = 0;
  while (step > 1 && guard++ < 160) {
    let improved = false;
    for (let i = 0; i < 4; i++) {
      for (const d of dirs) {
        const qq = q.map((p) => p.slice());
        qq[i][0] += d[0] * step;
        qq[i][1] += d[1] * step;
        if (!convex(qq)) continue;
        const ff = F(qq);
        if (ff > f) { q = qq; f = ff; improved = true; }
      }
    }
    if (!improved) step /= 2;
  }
  return q;
}

function gradients(gray, w, h) {
  const gx = new Float32Array(w * h), gy = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = gray[i - w - 1], b = gray[i - w], c = gray[i - w + 1];
      const d = gray[i - 1], f = gray[i + 1];
      const g = gray[i + w - 1], hh = gray[i + w], k = gray[i + w + 1];
      gx[i] = c + 2 * f + k - a - 2 * d - g;
      gy[i] = g + 2 * hh + k - a - 2 * b - c;
    }
  }
  return { gx, gy };
}

function snapEdges(q, G, w, h, rounds = 2) {
  // each side slides / tilts (both ends move along the side's normal) to the
  // strongest edge nearby; the median-ish score ignores fingers over the edge
  for (let r = 0; r < rounds; r++) {
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const p0 = q[i], p1 = q[(i + 1) % 4];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      const L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      const R = Math.max(3, 0.06 * L);
      let best = { s: -1, o0: 0, o1: 0 };
      for (let a = 0; a < 13; a++) {
        for (let b = 0; b < 13; b++) {
          const o0 = -R + (2 * R * a) / 12, o1 = -R + (2 * R * b) / 12;
          const ax = p0[0] + nx * o0, ay = p0[1] + ny * o0;
          const bx = p1[0] + nx * o1, by = p1[1] + ny * o1;
          const ex = bx - ax, ey = by - ay, EL = Math.hypot(ex, ey) || 1;
          const mx = -ey / EL, my = ex / EL;
          const vals = [];
          for (let t = 0; t < 50; t++) {
            const u = 0.05 + (0.9 * t) / 49;
            const x = Math.min(w - 1, Math.max(0, Math.round(ax + ex * u)));
            const y = Math.min(h - 1, Math.max(0, Math.round(ay + ey * u)));
            const j = y * w + x;
            vals.push(Math.abs(G.gx[j] * mx + G.gy[j] * my));
          }
          vals.sort((p, q2) => p - q2);
          let s = 0;
          for (let t = 16; t < 50; t++) s += vals[t];
          if (s > best.s) best = { s, o0, o1 };
        }
      }
      lines.push([
        [p0[0] + nx * best.o0, p0[1] + ny * best.o0],
        [p1[0] + nx * best.o1, p1[1] + ny * best.o1],
      ]);
    }
    const nq = [];
    for (let i = 0; i < 4; i++) {
      const [a1, b1] = lines[(i + 3) % 4], [a2, b2] = lines[i];
      const d1 = [b1[0] - a1[0], b1[1] - a1[1]], d2 = [b2[0] - a2[0], b2[1] - a2[1]];
      const det = d1[0] * -d2[1] - -d2[0] * d1[1];
      if (Math.abs(det) < 1e-9) { nq.push(q[i]); continue; }
      const rx = a2[0] - a1[0], ry = a2[1] - a1[1];
      const t = (rx * -d2[1] - -d2[0] * ry) / det;
      nq.push([a1[0] + d1[0] * t, a1[1] + d1[1] * t]);
    }
    if (!convex(nq) || bend(nq) > bend(q) + 0.15) break;   // snapping went somewhere odd
    q = nq;
  }
  return q;
}

/* ---------- panel finding ---------- */

export async function findPanel(work) {
  const cv = await loadCV();
  const k = Math.min(1, DET_MAX / Math.max(work.width, work.height));
  const w = Math.round(work.width * k), h = Math.round(work.height * k);
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  sctx.drawImage(work, 0, 0, w, h);
  const rgba = sctx.getImageData(0, 0, w, h).data;

  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  // light blur so print texture doesn't win over the box outline
  const blur = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    blur[i] = (gray[i - w - 1] + 2 * gray[i - w] + gray[i - w + 1] + 2 * gray[i - 1] + 4 * gray[i] + 2 * gray[i + 1] + gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1]) / 16;
  }
  const G = gradients(blur, w, h);

  const src = cv.matFromImageData(new ImageData(new Uint8ClampedArray(rgba), w, h));
  const rgb = new cv.Mat();
  cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
  src.delete();

  const grab = (seed, iters) => {
    const mask = cv.matFromArray(h, w, cv.CV_8UC1, Array.from(seed));
    const bgd = new cv.Mat(), fgd = new cv.Mat();
    try {
      cv.grabCut(rgb, mask, new cv.Rect(0, 0, w, h), bgd, fgd, iters, cv.GC_INIT_WITH_MASK);
      const d = mask.data;
      let m = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) m[i] = d[i] === 1 || d[i] === 3 ? 1 : 0;
      m = fillHoles(close3(m, w, h, 2), w, h);
      return m;
    } finally {
      mask.delete(); bgd.delete(); fgd.delete();
    }
  };

  // One full attempt. With useSkin, skin-coloured pixels start as "probably
  // background" (drops the hand). That helps against a busy shelf but hurts
  // when the box itself is skin-toned (light pink, kraft), so both run and
  // the quad whose sides sit on the strongest straight edges wins.
  const attempt = (useSkin) => {
    const seed = new Uint8Array(w * h);
    const x0 = Math.round(w * 0.1), y0 = Math.round(h * 0.08);
    const x1 = Math.round(w * 0.9), y1 = Math.round(h * 0.92);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = y * w + x;
        const R = rgba[i * 4], Gc = rgba[i * 4 + 1], B = rgba[i * 4 + 2];
        const Y = 0.299 * R + 0.587 * Gc + 0.114 * B;
        const Cr = (R - Y) * 0.713 + 128, Cb = (B - Y) * 0.564 + 128;
        const skin = useSkin && Cr > 135 && Cr < 175 && Cb > 85 && Cb < 130 && Y > 40;
        seed[i] = skin ? 2 : 3;
      }
    }
    const m = pickComponent(grab(seed, 5), w, h);
    let q = minAreaRect(m, w, h);
    if (!q) return null;
    q = fitQuad(m, w, h, q, 1.5);
    q = snapEdges(q, G, w, h);

    // pass 2: seeded from the first quad
    const seed2 = new Uint8Array(w * h);
    const big = scaleAbout(q, 1.3), core = scaleAbout(q, 0.5);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      seed2[y * w + x] = insideConvex(core, x, y) ? 1 : insideConvex(q, x, y) ? 3 : insideConvex(big, x, y) ? 2 : 0;
    }
    const m2 = grab(seed2, 4);
    let q2 = fitQuad(m2, w, h, q, 1.5);
    q2 = snapEdges(q2, G, w, h);
    if (Math.abs(signedArea(q2)) < w * h * 0.01) q2 = q;
    return q2;
  };

  // how well a quad's sides sit on strong edges (0..1), nudged towards bigger
  const mags = [];
  for (let i = 0; i < w * h; i += 7) mags.push(Math.hypot(G.gx[i], G.gy[i]));
  mags.sort((a, b) => a - b);
  const T = Math.max(20, mags[Math.floor(mags.length * 0.85)]);
  const edgeScore = (q) => {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
      const nx = -dy / L, ny = dx / L;
      let hit = 0;
      for (let t = 0; t < 60; t++) {
        const u = 0.05 + (0.9 * t) / 59;
        let best = 0;
        for (let o = -2; o <= 2; o++) {   // allow a pixel or two of slack
          const x = Math.round(a[0] + dx * u + nx * o), y = Math.round(a[1] + dy * u + ny * o);
          if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
          const j = y * w + x;
          best = Math.max(best, Math.abs(G.gx[j] * nx + G.gy[j] * ny));
        }
        if (best > T) hit++;
      }
      sum += hit / 60;
    }
    const area = Math.abs(signedArea(q)) / (w * h);
    return (sum / 4) * Math.pow(Math.min(1, area), 0.25) * Math.exp(-2 * bend(q));
  };

  try {
    let best = null;
    for (const useSkin of [true, false]) {
      const q = attempt(useSkin);
      if (!q || !convex(q)) continue;
      const sc = edgeScore(q);
      if (!best || sc > best.sc) best = { q, sc };
    }
    if (!best) return null;
    const out = orderQuad(best.q.map((p) => [p[0] / k, p[1] / k]));
    out.score = best.sc;
    return out;
  } finally {
    rgb.delete();
  }
}

/* ---------- true proportions of a photographed rectangle ---------- */

// Zhang & He, "Whiteboard scanning and image enhancement" (2007): from the
// four corners and a focal length, recover width / height of the real
// rectangle. Phone photos: ~26 mm equivalent lens → f ≈ 0.6 × diagonal.
export function panelAspect(q, imgW, imgH) {
  const [tl, tr, br, bl] = q;
  const u0 = imgW / 2, v0 = imgH / 2;
  const f = 0.6 * Math.hypot(imgW, imgH);
  const P = (p) => [p[0] - u0, p[1] - v0, 1];
  const m1 = P(tl), m2 = P(tr), m3 = P(bl), m4 = P(br);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const k2 = dot(cross(m1, m4), m3) / dot(cross(m2, m4), m3);
  const k3 = dot(cross(m1, m4), m2) / dot(cross(m3, m4), m2);
  const n2 = [k2 * m2[0] - m1[0], k2 * m2[1] - m1[1], k2 * m2[2] - m1[2]];
  const n3 = [k3 * m3[0] - m1[0], k3 * m3[1] - m1[1], k3 * m3[2] - m1[2]];
  const len2 = (n) => n[0] * n[0] + n[1] * n[1] + f * f * n[2] * n[2];
  const r = Math.sqrt(len2(n2) / len2(n3));
  const naive = (Math.hypot(tr[0] - tl[0], tr[1] - tl[1]) + Math.hypot(br[0] - bl[0], br[1] - bl[1])) /
    (Math.hypot(bl[0] - tl[0], bl[1] - tl[1]) + Math.hypot(br[0] - tr[0], br[1] - tr[1]));
  if (!isFinite(r) || r <= 0 || r / naive > 2.5 || naive / r > 2.5) return naive;
  return r;
}

/* ---------- flattening ---------- */

// Warps the quad out of the working photo into a canvas of the given size.
export async function flatten(work, q, outW, outH) {
  const cv = await loadCV();
  const src = cv.imread(work);
  const dst = new cv.Mat();
  const from = cv.matFromArray(4, 1, cv.CV_32FC2, q.flat());
  const to = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, outW, 0, outW, outH, 0, outH]);
  const M = cv.getPerspectiveTransform(from, to);
  try {
    cv.warpPerspective(src, dst, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
    const c = document.createElement('canvas');
    c.width = outW; c.height = outH;
    cv.imshow(c, dst);
    return c;
  } finally {
    src.delete(); dst.delete(); from.delete(); to.delete(); M.delete();
  }
}

/* ---------- the scale card ---------- */

// A credit-card-size card (ISO/IEC 7810 ID-1): 85.60 × 53.98 mm.
export const CARD_MM = [85.6, 53.98];

// Finds the cream-coloured card: bright, low-saturation, warm pixels (its
// black squares and pencil lines are filled in), then the same quad fit and
// edge snap as the panels. Plain JS, no OpenCV needed.
export function findCard(work) {
  const k = Math.min(1, DET_MAX / Math.max(work.width, work.height));
  const w = Math.round(work.width * k), h = Math.round(work.height * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(work, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const m = new Uint8Array(w * h);
  const gray = new Float32Array(w * h);
  const hist = new Uint32Array(256);
  for (let i = 0; i < w * h; i++) hist[Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2])]++;
  let acc = 0, p98 = 255;
  for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > w * h * 0.02) { p98 = v; break; } }
  const bright = Math.max(150, 0.75 * p98);
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], gg = px[i * 4 + 1], b = px[i * 4 + 2];
    const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    const sat = mx ? (mx - mn) / mx : 0;
    gray[i] = 0.299 * r + 0.587 * gg + 0.114 * b;
    // cream: bright, barely saturated, a little yellow (green above blue);
    // grey floors aren't bright enough and pinkish whites have green ≈ blue
    m[i] = mx > bright && sat < 0.3 && gg - b > 8 && r >= gg - 6 ? 1 : 0;
  }
  // wide close: the drawn strips and squares are several mm across
  let mask = fillHoles(close3(m, w, h, 12), w, h);
  mask = erode(dilate(erode(mask, w, h, 2), w, h, 2), w, h, 0);   // drop specks
  mask = pickComponent(mask, w, h);
  // the card is convex: fill its hull so edge squares and a thumb don't bite in
  mask = hullFill(mask, w, h);
  let q = minAreaRect(mask, w, h);
  if (!q) return null;
  const G = gradients(gray, w, h);
  q = fitQuad(mask, w, h, q, 1.2, CARD_MM[0] / CARD_MM[1]);
  q = snapEdges(q, G, w, h);
  // A thumb usually hides one corner. If the shape is off, rebuild each
  // corner in turn from the other three (as a parallelogram) and keep the
  // version whose true proportions are closest to a card's.
  const target = CARD_MM[0] / CARD_MM[1];
  const off = (qq) => {
    const a = panelAspect(qq, w, h);
    return Math.abs(Math.log((a >= 1 ? a : 1 / a) / target));
  };
  if (off(q) > 0.12) {
    let best = q, bo = off(q);
    for (let i = 0; i < 4; i++) {
      const a = q[(i + 1) % 4], b = q[(i + 2) % 4], c = q[(i + 3) % 4];
      const qq = q.map((p) => p.slice());
      qq[i] = [a[0] + c[0] - b[0], a[1] + c[1] - b[1]];
      if (!convex(qq)) continue;
      const o = off(qq);
      if (o < bo) { best = qq; bo = o; }
    }
    q = snapEdges(best, G, w, h, 1);
  }
  const area = Math.abs(signedArea(q));
  if (area < w * h * 0.01) return null;
  // how card-like is it: share of cream inside, and how close to card shape
  let inside = 0, cream = 0;
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
    if (insideConvex(q, x, y)) { inside++; if (m[y * w + x]) cream++; }
  }
  const score = (inside ? cream / inside : 0) * Math.exp(-4 * off(q));
  const quad = orderQuad(q.map((p) => [p[0] / k, p[1] / k]));
  quad.score = score;
  return quad;
}

function hullFill(m, w, h) {
  const pts = [];
  for (let y = 0; y < h; y++) {
    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x0 < 0) x0 = x; x1 = x; }
    if (x0 >= 0) { pts.push([x0, y]); if (x1 !== x0) pts.push([x1, y]); }
  }
  if (pts.length < 3) return m;
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.beginPath();
  hull.forEach((p, i) => (i ? g.lineTo(p[0] + 0.5, p[1] + 0.5) : g.moveTo(p[0] + 0.5, p[1] + 0.5)));
  g.closePath();
  g.fill();
  const a = g.getImageData(0, 0, w, h).data;
  const o = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) o[i] = a[i * 4 + 3] > 127 ? 1 : 0;
  return o;
}

// Homography from 4 point pairs (src → dst), as a 3×3 row-major array.
export function homography(src, dst) {
  const A = [], bv = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); bv.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); bv.push(v);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [bv[col], bv[piv]] = [bv[piv], bv[col]];
    const d = A[col][col] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      if (!f) continue;
      for (let cc = col; cc < n; cc++) A[r][cc] -= f * A[col][cc];
      bv[r] -= f * bv[col];
    }
  }
  const hv = bv.map((v, i) => v / (A[i][i] || 1e-12));
  return [...hv, 1];
}

export function applyH(H, p) {
  const x = p[0], y = p[1];
  const z = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / z, (H[3] * x + H[4] * y + H[5]) / z];
}

// Length in mm of a line lying in the card's plane.
export function lineMM(card, line, imgW, imgH) {
  // whichever pair of sides is really longer (perspective corrected) is 85.6 mm
  const [a, b] = panelAspect(card, imgW, imgH) >= 1 ? CARD_MM : [CARD_MM[1], CARD_MM[0]];
  const H = homography(card, [[0, 0], [a, 0], [a, b], [0, b]]);
  const p = applyH(H, line[0]), q = applyH(H, line[1]);
  return Math.hypot(q[0] - p[0], q[1] - p[1]);
}
