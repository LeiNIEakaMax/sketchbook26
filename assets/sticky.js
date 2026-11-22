/*
 * sticky.js — sticky notes on every page of sketchbook26 (challenge 04).
 *
 * Include once per page:  <script src="../../assets/sticky.js" defer></script>
 *   data-open="true"  opens the pad when the page loads
 *   data-seed="true"  puts a few how-to notes on the page the first time it is visited
 *
 * - The square button at the bottom right brings out a pad of notes.
 * - Grab the bottom of the top sheet and pull: it peels off and follows the pointer.
 *   Let go anywhere and it sticks there. Start typing straight away.
 * - Three pens (Shantell Sans, Homemade Apple, Rock Salt) in the dock; a note keeps the pen it was peeled with.
 * - Notes never grow or resize and have one font size. When a note is full it
 *   stops taking text: grab another one from the pad.
 * - Drag a note onto the trash can at the bottom left and let go to throw it away.
 * - Show / Hide switches every note on the page on or off.
 *
 * Notes are kept in localStorage, one list per page (key sb26.sticky:<path>).
 * Positions are stored as fractions of the window, so notes keep their place on
 * the screen when the window is resized.
 */
(() => {
  if (window.__sb26Sticky) return;
  window.__sb26Sticky = true;

  const script = document.currentScript;
  const OPEN_ON_LOAD = !!script && script.dataset.open === 'true';
  const SEED = !!script && script.dataset.seed === 'true';
  const FOLDER_MODE = !!script && script.dataset.folder === 'true'; // the notes folder page
  // The site root is one level above this file (assets/), on localhost and on Pages alike.
  const ROOT = new URL('..', (script && script.src) || location.href);
  const FOLDER_URL = new URL('notes/', ROOT).href;
  const NOTE_HASH = /^#sb-note=([\w-]+)$/;

  // Max, 2026-11-22: notes and pad at full size with 17px text; the controls
  // (pen picker, Show/Hide, pad button, trash) at half size.
  const UI_SCALE = 0.5;      // the controls are designed at full size and drawn at this scale
  const BASE = 180;
  const SIZE = BASE;         // note size in CSS px, the same on every page and device
  const PEEL = 110;          // how far (px) the bottom has to be pulled before the sheet comes off
  const PERSP = 700;         // perspective for the peel
  const FONT_KEY = 'sb26.sticky.font';
  // The pens. Each note keeps the one it was peeled with, so its text always fits.
  const FONTS = [
    { id: 'shantell', name: 'Shantell Sans', family: "'Shantell Sans', 'Comic Sans MS', cursive", lh: 23 },
    { id: 'apple', name: 'Homemade Apple', family: "'Homemade Apple', cursive", lh: 27 },
    { id: 'salt', name: 'Rock Salt', family: "'Rock Salt', cursive", lh: 27 },
  ];
  // French month abbreviations for the date stamp, as Max spelled them.
  const MONTHS = ['JAN.', 'FEV.', 'MARS', 'AVR.', 'MAI', 'JUIN', 'JUIL.', 'AOUT', 'SEP.', 'OCT.', 'NOV.', 'DEC.'];
  const today = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const stamp = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`; };
  const fontOf = (id) => FONTS.find((f) => f.id === id) || FONTS[0];
  const GRAB_FROM = 0.45;    // the sheet can only be grabbed below this fraction of its height
  const path = location.pathname.replace(/index\.html$/, '').replace(/\/*$/, '/');
  const KEY = 'sb26.sticky:' + path;
  const VIS_KEY = 'sb26.sticky.visible';

  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked: notes last until reload */ } },
  };

  /* ---------- styles ---------- */

  const css = `
  #sb26s { position: fixed; inset: 0; z-index: 900; pointer-events: none; font: 11px/1 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; color: #eee; -webkit-tap-highlight-color: transparent; }
  .sb26 * { box-sizing: border-box; }
  .sb26 button { font: inherit; color: inherit; margin: 0; }
  /* Notes live on the page itself (document coordinates), so they scroll with it.
     The pad, toggle and trash stay fixed to the window. */
  .sb26.sb-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; }
  .sb26.sb-hidden.sb-layer, .sb26.sb-hidden.sb-trash, #sb26s.sb-hidden .sb-pad, #sb26s.sb-hidden .sb-padbtn:not(.sb-folderbtn) { display: none; }

  /* one sheet of paper: the pad's top sheet and every note on the page */
  .sb26 .sb-paper { position: absolute; left: 0; top: 0; width: ${BASE}px; height: ${BASE}px; pointer-events: auto; touch-action: none;
    background: linear-gradient(180deg, #f6f0ba 0%, #f0de86 100%);
    transform-origin: 50% 0; will-change: transform; -webkit-user-select: none; user-select: none; }
  .sb26 .sb-paper::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 22px; background: linear-gradient(180deg, rgba(0,0,0,.05), rgba(0,0,0,0)); pointer-events: none; }
  .sb26 .sb-shade { position: absolute; inset: 0; pointer-events: none; opacity: 0;
    background: linear-gradient(0deg, rgba(120,90,0,.28) 0%, rgba(255,255,255,.35) 22%, rgba(0,0,0,0) 45%, rgba(0,0,0,.08) 100%); }

  .sb26 .sb-note { cursor: grab; transition: transform .28s cubic-bezier(.2,.9,.3,1.2), box-shadow .2s;
    box-shadow: 0 1px 1px rgba(0,0,0,.18), 0 12px 14px -12px rgba(0,0,0,.65); }
  .sb26 .sb-note.sb-lifted { cursor: grabbing; transition: box-shadow .2s; box-shadow: 0 2px 3px rgba(0,0,0,.2), 0 26px 30px -14px rgba(0,0,0,.6); }
  .sb26 .sb-note.sb-editing { cursor: default; }
  .sb26 .sb-note.sb-editing::after { content: ''; position: absolute; inset: -3px; border: 1.5px solid #fff; pointer-events: none; }
  .sb26 .sb-note.sb-full { animation: sb-full .28s; }
  @keyframes sb-full { 25% { translate: -4px 0; } 50% { translate: 4px 0; } 75% { translate: -2px 0; } }
  .sb26 .sb-note.sb-gone { transition: transform .26s ease-in, opacity .26s ease-in; opacity: 0; }

  .sb26 .sb-ta { position: absolute; left: 14px; right: 14px; top: 22px; bottom: 14px; width: auto; height: auto; margin: 0; padding: 0;
    border: 0; outline: 0; resize: none; overflow: hidden; background: transparent; color: #1d1a10; caret-color: #1d1a10;
    font-size: 17px; line-height: 22px; font-family: 'Shantell Sans', cursive; overflow-wrap: anywhere; white-space: pre-wrap;
    pointer-events: none; -webkit-user-select: text; user-select: text; }
  .sb26 .sb-editing .sb-ta { pointer-events: auto; }
  /* date stamp, bottom right (Figma "Sticky / Note", node 43:61977) */
  .sb26 .sb-date { position: absolute; right: 11px; bottom: 0; height: 23px; line-height: 23px; pointer-events: none; white-space: nowrap;
    font: 500 9pt/23px 'Barlow Condensed', 'Arial Narrow', sans-serif; color: rgba(29,26,16,.6); }
  /* a note seen in the notes folder */
  .sb26 .sb-paper.sb-card { position: relative; display: block; flex: none; cursor: pointer; text-decoration: none;
    box-shadow: 0 1px 1px rgba(0,0,0,.18), 0 12px 14px -12px rgba(0,0,0,.65); transition: transform .2s cubic-bezier(.2,.9,.3,1.2), box-shadow .2s; }
  .sb26 .sb-paper.sb-card:hover, .sb26 .sb-paper.sb-card:focus-visible { transform: rotate(0deg) scale(1.04) !important; box-shadow: 0 2px 3px rgba(0,0,0,.2), 0 26px 30px -14px rgba(0,0,0,.6); outline: none; }
  /* the note you came to from the folder */
  .sb26 .sb-note.sb-found { animation: sb-found 1.6s ease-out 2; }
  @keyframes sb-found { 0% { box-shadow: 0 0 0 0 rgba(40,229,176,.9); } 100% { box-shadow: 0 0 0 24px rgba(40,229,176,0); } }
  .sb26 .sb-f-apple .sb-ta { font-family: 'Homemade Apple', cursive; line-height: 26px; }
  .sb26 .sb-f-salt .sb-ta { font-family: 'Rock Salt', cursive; line-height: 26px; }
  .sb26 .sb-ta::placeholder { color: rgba(60,50,10,.35); }
  .sb26 .sb-ta::selection { background: rgba(0,0,0,.16); }

  /* the pad */
  .sb26 .sb-pad { position: absolute; right: 8px; bottom: 38px; width: ${BASE}px; height: ${BASE + 8}px;
    transition: transform .3s cubic-bezier(.2,.9,.3,1.1), opacity .2s; }
  .sb26 .sb-pad.sb-closed { transform: translateY(24px); opacity: 0; visibility: hidden; transition: transform .2s, opacity .2s, visibility 0s .2s; }
  .sb26 .sb-under { position: absolute; left: 0; width: ${BASE}px; height: ${BASE}px; background: #e6d47e; pointer-events: none; }
  .sb26 .sb-under:nth-child(1) { top: 8px; background: #c9b263; box-shadow: 0 10px 14px -8px rgba(0,0,0,.6); }
  .sb26 .sb-under:nth-child(2) { top: 6px; background: #d8c172; }
  .sb26 .sb-under:nth-child(3) { top: 4px; background: #e3ce7e; }
  .sb26 .sb-under:nth-child(4) { top: 2px; background: #ecd98a; }
  .sb26 .sb-sheet { cursor: default; box-shadow: 0 1px 0 rgba(0,0,0,.12); }
  .sb26 .sb-sheet.sb-grab-zone { cursor: grab; }
  .sb26 .sb-sheet.sb-peeling { cursor: grabbing; box-shadow: 0 18px 22px -12px rgba(0,0,0,.55); }
  .sb26 .sb-sheet.sb-back { transition: transform .35s cubic-bezier(.3,1.6,.5,1); }
  .sb26 .sb-sheet.sb-fresh { animation: sb-fresh .25s ease-out; }
  @keyframes sb-fresh { from { opacity: 0; } }
  /* a corner that is already lifting a little, so it is clear where to grab */
  .sb26 .sb-ear { position: absolute; right: 0; bottom: 0; width: 20px; height: 20px; pointer-events: none; transition: width .15s, height .15s;
    background: linear-gradient(315deg, rgba(0,0,0,0) 0 48%, rgba(90,70,0,.22) 50%, #fbf7d6 54%, #efdf93 100%); }
  .sb26 .sb-sheet.sb-grab-zone .sb-ear { width: 30px; height: 30px; }
  .sb26 .sb-sheet.sb-peeling .sb-ear { width: 0; height: 0; }
  .sb26 .sb-hint { position: absolute; right: 0; bottom: calc(100% + 8px); white-space: nowrap; color: rgba(238,238,238,.7); text-shadow: 0 1px 2px rgba(0,0,0,.6); pointer-events: none; transition: opacity .3s; }
  .sb26 .sb-hint.sb-off { opacity: 0; }

  /* controls: squared off, white active token */
  .sb26 .sb-dock { position: absolute; right: 16px; bottom: 16px; display: flex; gap: 8px; pointer-events: auto; }
  .sb26 .sb-seg { display: flex; height: 40px; border: 1px solid rgba(255,255,255,.22); background: rgba(20,20,20,.9); }
  .sb26 .sb-seg span { display: flex; align-items: center; padding: 0 10px; color: rgba(238,238,238,.6); border-right: 1px solid rgba(255,255,255,.12); }
  .sb26 .sb-seg button { border: 0; background: none; padding: 0 12px; cursor: pointer; text-transform: uppercase; letter-spacing: .04em; }
  .sb26 .sb-seg button[aria-pressed="true"] { background: #fff; color: #111; }
  .sb26 .sb-seg button:not([aria-pressed="true"]):hover { background: rgba(255,255,255,.08); }
  .sb26 .sb-fonts button { text-transform: none; letter-spacing: 0; font-size: 14px; padding: 0 10px; }
  .sb26 .sb-padbtn { width: 40px; height: 40px; padding: 0; border: 1px solid rgba(255,255,255,.22); background: rgba(20,20,20,.9); cursor: pointer; display: grid; place-items: center; }
  .sb26 a.sb-padbtn { color: #eee; }
  .sb26 a.sb-padbtn svg { width: 20px; height: 20px; }
  /* bottom centre: back to the notes folder after jumping to a note */
  .sb26 .sb-return { position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%); height: 40px; display: flex; align-items: center; gap: 10px; padding: 0 16px;
    pointer-events: auto; border: 1px solid #fff; background: #fff; color: #111; text-decoration: none; text-transform: uppercase; letter-spacing: .04em; white-space: nowrap; }
  .sb26 .sb-return:hover { background: #e8e8e8; }
  .sb26 .sb-padbtn:hover { border-color: rgba(255,255,255,.5); }
  .sb26 .sb-padbtn[aria-expanded="true"] { background: #fff; border-color: #fff; }
  .sb26 .sb-padbtn i { display: block; width: 18px; height: 18px; background: linear-gradient(180deg, #f6f0ba, #f0de86); box-shadow: 0 2px 0 #c9b263; }
  .sb26 .sb-padbtn[aria-expanded="true"] i { box-shadow: 0 2px 0 #c9b263, 0 0 0 1px rgba(0,0,0,.15); }
  .sb26 button:focus-visible { outline: 2px solid #28e5b0; outline-offset: 2px; }

  /* the trash can */
  .sb26.sb-trash { position: fixed; z-index: 1000; pointer-events: none; left: 16px; bottom: 16px; width: 64px; height: 64px; display: grid; place-items: center;
    border: 1px solid rgba(255,255,255,.22); background: rgba(20,20,20,.9); color: #eee;
    opacity: 0; transform: translateY(12px); transition: opacity .2s, transform .2s, border-color .15s, background .15s, color .15s; }
  .sb26.sb-trash.sb-show { opacity: 1; transform: none; }
  .sb26.sb-trash.sb-armed { border-color: #ff5a4a; background: rgba(255,90,74,.16); color: #ff7a6c; transform: scale(1.08); }
  .sb26.sb-trash svg { width: 30px; height: 30px; overflow: visible; }
  .sb26.sb-trash .sb-lid { transform-origin: 3px 6px; transition: transform .15s; }
  .sb26.sb-trash.sb-armed .sb-lid { transform: rotate(-28deg) translateY(-1px); }
  .sb26.sb-trash.sb-gulp { animation: sb-gulp .3s; }
  @keyframes sb-gulp { 40% { transform: scale(.9); } }

  @media (prefers-reduced-motion: reduce) {
    .sb26 .sb-note, .sb26 .sb-pad, .sb26 .sb-sheet.sb-back, .sb26.sb-trash { transition-duration: .01s; }
    .sb26 .sb-note.sb-full, .sb26 .sb-sheet.sb-fresh, .sb26.sb-trash.sb-gulp { animation: none; }
  }`;

  // Draw the controls' rules at UI_SCALE: every length over 1.5px is scaled; hairlines stay.
  // A rule (and its continuation lines) counts as a control if its selector names one.
  const UI_RULE = /#sb26s \{|sb-dock|sb-seg|sb-fonts|sb-padbtn|sb-trash|sb-gulp|sb-hint|sb-return/;
  let uiRule = false;
  const scaledCss = css.split('\n').map((line) => {
    if (/^  \S/.test(line)) uiRule = UI_RULE.test(line);
    if (!uiRule) return line;
    return line.replace(/(\d*\.?\d+)px/g, (m, v) => (Number(v) <= 1.5 ? m : +(Number(v) * UI_SCALE).toFixed(2) + 'px'));
  }).join('\n');

  function addFonts() {
    const have = [...document.querySelectorAll('link[rel="stylesheet"]')].map((l) => l.href).join(' ');
    if (/Shantell\+Sans/.test(have)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono&family=Shantell+Sans&family=Homemade+Apple&family=Rock+Salt&family=Barlow+Condensed:wght@500&display=swap';
    document.head.append(l);
  }

  /* ---------- markup ---------- */

  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

  const root = el('div');
  root.id = 'sb26s';
  root.className = 'sb26';
  const layer = el('div', 'sb26 sb-layer');
  const pad = el('div', 'sb-pad sb-closed');
  for (let i = 0; i < 4; i++) pad.append(el('div', 'sb-under'));
  const hint = el('div', 'sb-hint', 'pull from the bottom ↑');
  pad.append(hint);
  const trash = el('div', 'sb26 sb-trash', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" aria-hidden="true">
      <g class="sb-lid"><path d="M3 6h18"/><path d="M9 6V3.5h6V6"/></g>
      <path d="M5.5 6l1.2 15h10.6l1.2-15"/><path d="M10 10v7.5M14 10v7.5"/></svg>`);
  trash.setAttribute('aria-hidden', 'true');
  const dock = el('div', 'sb-dock');
  const seg = el('div', 'sb-seg', '<span></span><button type="button" data-v="1">Show</button><button type="button" data-v="0">Hide</button>');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Sticky notes on this page');
  const count = seg.querySelector('span');
  const padBtn = el('button', 'sb-padbtn', '<i></i>');
  padBtn.type = 'button';
  padBtn.title = 'Sticky notes';
  padBtn.setAttribute('aria-label', 'Sticky note pad');
  padBtn.setAttribute('aria-expanded', 'false');
  const fontSeg = el('div', 'sb-seg sb-fonts', FONTS.map((f) => `<button type="button" data-f="${f.id}" title="${f.name}" aria-label="${f.name}" style="font-family:${f.family.replace(/"/g, '')}">Aa</button>`).join(''));
  fontSeg.setAttribute('role', 'group');
  fontSeg.setAttribute('aria-label', 'Pen for the next note');
  const folderBtn = el('a', 'sb-padbtn sb-folderbtn', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 6.5h6l2 2h10V19H3z"/></svg>');
  folderBtn.href = FOLDER_URL;
  folderBtn.title = 'Notes folder: every note on the site';
  folderBtn.setAttribute('aria-label', 'Notes folder');
  dock.append(fontSeg, seg, folderBtn, padBtn);
  root.append(pad, dock);
  const parts = [layer, root, trash];

  // Keep the page's own sketch out of everything that happens on the notes:
  // p5 listens on window, so stopping these here means typing "s" doesn't save a
  // PNG and dragging a note doesn't paint on the canvas underneath.
  // (pointermove is left alone so the home page's crosshair still follows.)
  for (const t of ['mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'touchstart', 'touchmove', 'touchend', 'wheel', 'keydown', 'keyup', 'keypress', 'contextmenu']) {
    for (const part of parts) part.addEventListener(t, (e) => { if (e.target !== root && e.target !== layer) e.stopPropagation(); });
  }

  /* ---------- state ---------- */

  let notes = [];            // { id, fx (fraction of page width), py (page px), r, text, z, el, ta }
  let topZ = 1;
  let visible = store.get(VIS_KEY, true) !== false;
  let font = fontOf(store.get(FONT_KEY, FONTS[0].id)).id;
  function setFont(id) {
    font = fontOf(id).id;
    store.set(FONT_KEY, font);
    for (const b of fontSeg.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.f === font));
    if (sheet) sheet.className = sheet.className.replace(/ ?sb-f-\w+/g, '') + ` sb-f-${font}`;
  }

  // Page width (without the scrollbar). x is kept as a fraction of it, y in page px.
  const W = () => document.documentElement.clientWidth || window.innerWidth;
  const inUI = (a) => !!a && (layer.contains(a) || root.contains(a));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  function save() {
    store.set(KEY, notes.map(({ id, fx, py, r, text, z, f, d }) => ({ id, fx, py: Math.round(py), r, text, z, f, d })));
    updateCount();
  }
  let saveTimer = 0;
  const saveSoon = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 250); };

  function updateCount() {
    count.textContent = `Notes ${notes.length}`;
  }

  function setVisible(v) {
    visible = v;
    for (const part of parts) part.classList.toggle('sb-hidden', !v);
    for (const b of seg.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.v === '1') === v));
    store.set(VIS_KEY, v);
    if (!v) { setPad(false); if (inUI(document.activeElement)) document.activeElement.blur(); }
  }

  function setPad(open) {
    pad.classList.toggle('sb-closed', !open);
    padBtn.setAttribute('aria-expanded', String(open));
    trash.classList.toggle('sb-show', open);
  }

  /* ---------- notes on the page ---------- */

  // Top-left corner in page px: x from the stored fraction of the page width
  // (so notes stay put across window sizes), y as stored.
  function placeOf(n) {
    const x = clamp(n.fx * W() - SIZE / 2, -SIZE + 48, W() - 48);
    const y = Math.max(0, n.py - SIZE / 2);
    return { x, y };
  }

  function position(n, x, y) {
    if (x == null) ({ x, y } = placeOf(n));
    n.x = x; n.y = y;
    n.el.style.left = x + 'px';
    n.el.style.top = y + 'px';
  }

  const rest = (n) => `rotate(${n.r}deg)`;

  function makeNote(data) {
    const n = { id: data.id || uid(), fx: data.fx, py: data.py ?? data.fy * window.innerHeight, r: data.r ?? 0, text: data.text || '', z: data.z || ++topZ, f: fontOf(data.f || font).id, d: /^\d{4}-\d\d-\d\d$/.test(data.d || '') ? data.d : today() };
    topZ = Math.max(topZ, n.z);
    n.el = el('div', `sb-paper sb-note sb-f-${n.f}`);
    n.ta = el('textarea', 'sb-ta');
    n.ta.value = n.text;
    n.ta.spellcheck = false;
    n.ta.setAttribute('aria-label', 'Sticky note');
    n.ta.tabIndex = -1;
    const date = el('div', 'sb-date');
    date.textContent = stamp(n.d);
    n.el.append(n.ta, date);
    n.el.style.zIndex = n.z;
    n.el.style.transform = rest(n);
    layer.append(n.el);
    position(n);
    wireNote(n);
    notes.push(n);
    return n;
  }

  // Typing: a note never grows, so text that doesn't fit is refused.
  function wireNote(n) {
    const ta = n.ta;
    let good = ta.value, selS = 0, selE = 0;
    const remember = () => { good = ta.value; selS = ta.selectionStart; selE = ta.selectionEnd; };
    const fits = () => ta.scrollHeight <= ta.clientHeight + 1;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); ta.blur(); return; }
      remember();
    });
    ta.addEventListener('beforeinput', remember);
    ta.addEventListener('input', () => {
      if (!fits()) {
        ta.value = good;
        ta.setSelectionRange(selS, selE);
        n.el.classList.remove('sb-full');
        void n.el.offsetWidth;
        n.el.classList.add('sb-full');
        // A paste that is too long: keep as much of it as fits.
        return;
      }
      good = ta.value;
      n.text = ta.value;
      saveSoon();
    });
    ta.addEventListener('paste', (e) => {
      const add = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      if (!add) return;
      e.preventDefault();
      const s = ta.selectionStart, end = ta.selectionEnd, before = ta.value.slice(0, s), after = ta.value.slice(end);
      let lo = 0, hi = add.length;
      while (lo < hi) { // longest prefix of the pasted text that still fits
        const mid = (lo + hi + 1) >> 1;
        ta.value = before + add.slice(0, mid) + after;
        if (fits()) lo = mid; else hi = mid - 1;
      }
      ta.value = before + add.slice(0, lo) + after;
      ta.setSelectionRange(s + lo, s + lo);
      if (lo < add.length) { n.el.classList.remove('sb-full'); void n.el.offsetWidth; n.el.classList.add('sb-full'); }
      good = ta.value; n.text = ta.value; saveSoon();
    });
    ta.addEventListener('focus', () => n.el.classList.add('sb-editing'));
    ta.addEventListener('blur', () => { n.el.classList.remove('sb-editing'); ta.tabIndex = -1; n.text = ta.value; save(); });

    n.el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      if (e.target === ta && n.el.classList.contains('sb-editing')) return; // normal text selection
      e.preventDefault();
      startNoteDrag(n, e, false);
    });
  }

  function edit(n) {
    n.ta.tabIndex = 0;
    n.el.classList.add('sb-editing');
    n.ta.focus({ preventScroll: true });
    const end = n.ta.value.length;
    n.ta.setSelectionRange(end, end);
  }

  // Stacking order among notes, kept in 1..n (all below the pad and trash).
  function toFront(n) {
    n.z = ++topZ;
    notes.sort((a, b) => a.z - b.z).forEach((m, i) => { m.z = i + 1; m.el.style.zIndex = m.z; });
    topZ = notes.length;
  }

  function overTrash(x, y) {
    const r = trash.getBoundingClientRect();
    const m = 16; // generous: "drag it to the bottom left"
    return x > r.left - m && x < r.right + m && y > r.top - m && y < r.bottom + m;
  }

  // Drag a note around. fresh = it just came off the pad.
  function startNoteDrag(n, e, fresh) {
    const id = e.pointerId;
    const gx = e.pageX - n.x, gy = e.pageY - n.y; // grab point inside the note
    const sx = e.clientX, sy = e.clientY;
    let moved = fresh, lastX = e.clientX, tilt = 0, vx = 0, raf = 0, armed = false;
    try { n.el.setPointerCapture(id); } catch (err) { /* synthetic pointer */ }
    if (document.activeElement !== n.ta && inUI(document.activeElement)) document.activeElement.blur();
    toFront(n);
    n.el.style.zIndex = 950; // held: above the pad (900), below the trash (1000)

    const frame = () => {
      raf = 0;
      if (!moved) return;
      // Hanging from the sticky strip at the top, it swings a little against the motion.
      tilt += (clamp(-vx * 0.6, -14, 14) - tilt) * 0.25;
      vx *= 0.8;
      n.el.style.transform = `rotate(${n.r + tilt}deg) scale(1.03)`;
      if (Math.abs(tilt) > 0.05 || Math.abs(vx) > 0.05) raf = requestAnimationFrame(frame);
    };

    const move = (ev) => {
      if (ev.pointerId !== id) return;
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      if (!moved) { moved = true; n.el.classList.add('sb-lifted'); trash.classList.add('sb-show'); if (document.activeElement === n.ta) n.ta.blur(); }
      vx = ev.clientX - lastX; lastX = ev.clientX;
      position(n, ev.pageX - gx, ev.pageY - gy);
      armed = overTrash(ev.clientX, ev.clientY);
      trash.classList.toggle('sb-armed', armed);
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const up = (ev) => {
      if (ev.pointerId !== id) return;
      n.el.removeEventListener('pointermove', move);
      n.el.removeEventListener('pointerup', up);
      n.el.removeEventListener('pointercancel', up);
      cancelAnimationFrame(raf);
      n.el.classList.remove('sb-lifted');
      n.el.style.zIndex = n.z;
      trash.classList.remove('sb-armed');
      if (pad.classList.contains('sb-closed')) trash.classList.remove('sb-show');
      if (!moved) { edit(n); return; }
      if (armed && ev.type === 'pointerup') { throwAway(n); return; }
      n.fx = (n.x + SIZE / 2) / W();
      n.py = n.y + SIZE / 2;
      n.el.style.transform = rest(n);
      save();
      if (fresh) edit(n);
    };

    n.el.addEventListener('pointermove', move);
    n.el.addEventListener('pointerup', up);
    n.el.addEventListener('pointercancel', up);
    return move;
  }

  function throwAway(n) {
    const r = trash.getBoundingClientRect();
    const dx = r.left + window.scrollX + r.width / 2 - (n.x + SIZE / 2), dy = r.top + window.scrollY + r.height / 2 - (n.y + SIZE / 2);
    n.el.style.pointerEvents = 'none';
    n.el.classList.add('sb-gone');
    n.el.style.transformOrigin = '50% 50%';
    n.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${n.r - 20}deg) scale(.12)`;
    trash.classList.remove('sb-gulp');
    void trash.offsetWidth;
    trash.classList.add('sb-gulp');
    notes = notes.filter((m) => m !== n);
    save();
    setTimeout(() => n.el.remove(), 300);
  }

  /* ---------- the pad: peel the top sheet off by its bottom ---------- */

  let sheet;
  function newSheet() {
    sheet = el('div', `sb-paper sb-sheet sb-fresh sb-f-${font}`);
    sheet.append(el('div', 'sb-shade'), el('div', 'sb-ear'));
    pad.insertBefore(sheet, hint);
    sheet.addEventListener('pointermove', (e) => {
      if (sheet.classList.contains('sb-peeling')) return;
      sheet.classList.toggle('sb-grab-zone', e.offsetY > SIZE * GRAB_FROM);
    });
    sheet.addEventListener('pointerleave', () => sheet.classList.remove('sb-grab-zone'));
    sheet.addEventListener('pointerdown', peel);
  }

  function peel(e) {
    if (e.button > 0) return;
    const s = e.currentTarget;
    const box = s.getBoundingClientRect();
    const gx = e.clientX - box.left, gy = e.clientY - box.top;
    e.preventDefault();
    if (gy < SIZE * GRAB_FROM) { // the top is stuck down: a little wobble says "not here"
      s.animate([{ transform: `perspective(${PERSP}px) rotateX(0)` }, { transform: `perspective(${PERSP}px) rotateX(-8deg)` }, { transform: `perspective(${PERSP}px) rotateX(0)` }], { duration: 220 });
      return;
    }
    const id = e.pointerId;
    try { s.setPointerCapture(id); } catch (err) { /* synthetic pointer */ }
    if (inUI(document.activeElement)) document.activeElement.blur();
    s.classList.remove('sb-back', 'sb-fresh');
    s.classList.add('sb-peeling');
    const shade = s.querySelector('.sb-shade');
    const sx = e.clientX, sy = e.clientY;
    let state = { mx: 0, my: 0, rz: 0, rx: 0, dx: 0, dy: 0 };

    // The top edge stays glued down. Pulling the bottom toward the glue lifts it
    // off the page toward you (it folds back on its hinge); pulling sideways swings
    // it round the hinge; pulling away starts to unstick the glue and the whole
    // sheet slides after the pointer until it lets go.
    const ox = gx - SIZE / 2, oy = gy, oLen = Math.hypot(ox, oy);
    const bend = (dx, dy) => {
      const tx = ox + dx, ty = oy + dy, tLen = Math.hypot(tx, ty) || 1;
      let rz = (Math.atan2(-tx, ty) - Math.atan2(-ox, oy)) * 180 / Math.PI;
      if (rz > 180) rz -= 360; if (rz < -180) rz += 360;
      rz = clamp(rz, -28, 28);
      const ratio = tLen / oLen;
      let rx, mx = 0, my = 0;
      if (ty < 0) rx = -80; // pulled up past the glue line
      else if (ratio < 1) rx = -Math.acos(ratio) * 180 / Math.PI * 0.9;
      else {
        const extra = tLen - oLen;
        mx = (tx / tLen) * extra * 0.55; my = (ty / tLen) * extra * 0.55;
        rx = -Math.min(8 + extra * 0.35, 30);
      }
      rx = Math.min(rx, -6); // as soon as it's held, the bottom lifts off the pad a little
      state = { mx, my, rz, rx, dx, dy };
      s.style.transform = `translate(${mx}px, ${my}px) perspective(${PERSP}px) rotateZ(${rz}deg) rotateX(${rx}deg)`;
      shade.style.opacity = String(clamp(0.3 + -rx / 60, 0, 1));
      return Math.hypot(dx, dy);
    };

    const move = (ev) => {
      if (ev.pointerId !== id) return;
      const d = bend(ev.clientX - sx, ev.clientY - sy);
      if (d > PEEL) detach(ev);
    };

    const end = (ev) => {
      if (ev.pointerId !== id) return;
      cleanup();
      s.classList.remove('sb-peeling');
      s.classList.add('sb-back'); // not far enough: it snaps back onto the pad
      s.style.transform = '';
      shade.style.opacity = '';
    };

    const cleanup = () => {
      s.removeEventListener('pointermove', move);
      s.removeEventListener('pointerup', end);
      s.removeEventListener('pointercancel', end);
    };

    // Off the pad: the sheet becomes a note held at the same point, and the pad shows the next sheet.
    const detach = (ev) => {
      cleanup();
      try { s.releasePointerCapture(id); } catch (err) { /* fine */ }
      const x = ev.pageX - gx, y = ev.pageY - gy;
      const n = makeNote({ fx: (x + SIZE / 2) / W(), py: y + SIZE / 2, r: Math.round((Math.random() * 6 - 3) * 10) / 10 });
      position(n, x, y);
      // Start from exactly where the peeling sheet was drawn, then flatten out in the hand.
      const { mx, my, rz, rx, dx, dy } = state;
      n.el.style.transition = 'none';
      n.el.style.transform = `translate(${mx - dx}px, ${my - dy}px) perspective(${PERSP}px) rotateZ(${rz}deg) rotateX(${rx}deg)`;
      n.el.classList.add('sb-lifted');
      void n.el.offsetWidth;
      n.el.style.transition = 'transform .22s cubic-bezier(.2,.9,.3,1.1), box-shadow .2s';
      n.el.style.transform = `translate(0px, 0px) perspective(${PERSP}px) rotateZ(${n.r}deg) rotateX(0deg) scale(1.03)`;
      setTimeout(() => { n.el.style.transition = ''; }, 240);
      s.remove();
      newSheet();
      hint.classList.add('sb-off');
      save();
      const move2 = startNoteDrag(n, ev, true);
      move2(ev);
    };

    s.addEventListener('pointermove', move);
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
  }

  /* ---------- start ---------- */

  function seedNotes() {
    const tips = [
      { fx: 0.2, fy: 0.46, r: -2.5, text: 'Every page of sketchbook26 has a pad of these.' },
      { fx: 0.47, fy: 0.5, r: 1.8, text: 'Pull a sheet off the pad from its bottom edge. Let go to stick it.' },
      { fx: 0.27, fy: 0.76, r: 2.6, text: 'Drag a note to the trash, bottom left, to throw it away.' },
    ];
    return tips.map((t, i) => ({ ...t, id: 'tip' + i, z: i + 1 }));
  }

  /* ---------- the notes folder: every note on the site, by page ---------- */

  const pad2 = (n) => String(n).padStart(2, '0');
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  async function buildFolder() {
    const box = document.getElementById('sb-folder') || document.body.appendChild(el('main'));
    box.classList.add('sb26');
    let list = [];
    try { list = await (await fetch(new URL('challenges.json', ROOT), { cache: 'no-store' })).json(); } catch (e) { /* labels fall back to paths */ }
    const bySlug = new Map(list.map((c) => [c.slug, c]));
    const pages = [];
    let total = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('sb26.sticky:')) continue;
        const p = k.slice('sb26.sticky:'.length);
        const items = (store.get(k, []) || []).filter((d) => d && d.id);
        if (!items.length) continue;
        const rel = p.startsWith(ROOT.pathname) ? p.slice(ROOT.pathname.length) : p.replace(/^\//, '');
        const m = rel.match(/^challenges\/([^/]+)\/$/);
        const c = m && bySlug.get(m[1]);
        const label = rel === '' ? 'Home' : c ? `${pad2(c.number)} · ${c.title}` : rel;
        const order = rel === '' ? -1 : c ? c.number : 999;
        pages.push({ href: new URL(rel, ROOT).href, label, order, items });
        total += items.length;
      }
    } catch (e) { /* storage blocked */ }
    pages.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
    const count = document.getElementById('sb-folder-count');
    if (count) count.textContent = `${total} note${total === 1 ? '' : 's'} on ${pages.length} page${pages.length === 1 ? '' : 's'}`;
    if (!pages.length) {
      box.innerHTML = '<p class="sb-empty">No notes yet. Open any page, pull a note off the pad at the bottom right, and it will show up here.</p>';
      return;
    }
    for (const pg of pages) {
      const sec = el('section', 'sb-page');
      sec.innerHTML = `<h2><a href="${escHtml(pg.href)}">${escHtml(pg.label)}</a> <small>${pg.items.length}</small></h2>`;
      const grid = el('div', 'sb-grid');
      // newest first
      pg.items.sort((a, b) => String(b.d || '').localeCompare(String(a.d || '')) || (b.z || 0) - (a.z || 0));
      for (const d of pg.items) {
        const card = el('a', `sb-paper sb-card sb-f-${fontOf(d.f).id}`);
        card.href = `${pg.href}#sb-note=${encodeURIComponent(d.id)}`;
        card.title = `Open on ${pg.label}`;
        card.style.transform = `rotate(${Number(d.r) || 0}deg)`;
        const ta = el('textarea', 'sb-ta');
        ta.value = d.text || '';
        ta.readOnly = true;
        ta.tabIndex = -1;
        ta.setAttribute('aria-hidden', 'true');
        const date = el('div', 'sb-date');
        if (d.d) date.textContent = stamp(d.d);
        card.setAttribute('aria-label', `${(d.text || 'Empty note').slice(0, 80)} (${pg.label})`);
        card.append(ta, date);
        grid.append(card);
      }
      sec.append(grid);
      box.append(sec);
    }
  }

  // Came here from the folder: show the note, and offer the way back.
  function arrive() {
    const m = location.hash.match(NOTE_HASH);
    if (!m) return;
    const back = el('a', 'sb-return', '← Notes folder');
    back.href = FOLDER_URL;
    root.append(back);
    const n = notes.find((x) => x.id === decodeURIComponent(m[1]));
    if (!n) return;
    if (!visible) setVisible(true);
    toFront(n);
    // Pages like the gallery build their content after loading, so wait until the
    // page is tall enough to scroll the note into the middle of the window.
    const left = Math.max(0, n.x + SIZE / 2 - innerWidth / 2), top = Math.max(0, n.y + SIZE / 2 - innerHeight / 2);
    let tries = 0;
    const go = () => {
      const room = document.documentElement.scrollHeight - innerHeight;
      if (room < top - 1 && tries++ < 20) { setTimeout(go, 150); return; }
      window.scrollTo({ left, top, behavior: 'smooth' });
      n.el.classList.add('sb-found');
    };
    go();
  }

  function start() {
    addFonts();
    const style = el('style');
    style.textContent = scaledCss;
    document.head.append(style);
    if (FOLDER_MODE) { buildFolder(); return; }
    document.body.append(layer, root, trash);

    let saved = store.get(KEY, null);
    if (!Array.isArray(saved)) saved = SEED ? seedNotes() : [];
    saved.sort((a, b) => (a.z || 0) - (b.z || 0)).forEach((d) => {
      if (typeof d.fx === 'number' && (typeof d.py === 'number' || typeof d.fy === 'number')) makeNote(d);
    });
    if (SEED && store.get(KEY, null) == null) save();
    updateCount();
    newSheet();

    padBtn.addEventListener('click', () => setPad(pad.classList.contains('sb-closed')));
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setVisible(b.dataset.v === '1');
    });
    fontSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) setFont(b.dataset.f);
    });
    setFont(font);
    setVisible(visible);
    if (OPEN_ON_LOAD && visible) setPad(true);
    arrive();

    window.addEventListener('resize', () => notes.forEach((n) => position(n)));
    // Another tab changed this page's notes: follow along (unless typing here).
    window.addEventListener('storage', (e) => {
      if (e.key === VIS_KEY) { setVisible(store.get(VIS_KEY, true) !== false); return; }
      if (e.key !== KEY || inUI(document.activeElement)) return;
      notes.forEach((n) => n.el.remove());
      notes = [];
      (store.get(KEY, []) || []).sort((a, b) => (a.z || 0) - (b.z || 0)).forEach(makeNote);
      updateCount();
    });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
