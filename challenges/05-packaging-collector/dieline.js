// A simple reverse tuck-end dieline, drawn in millimetres as SVG.
//
//            [dust]          [dust]  [ top lid ]
//                                    [  tuck   ]
//   [ left ][ front ][ right ][ back ][glue>
//   [ D    ][ W     ][ D     ][ W    ]
//            [bottom lid]
//            [  tuck    ]
//   [dust]           [dust]
//
// Red = cut, green = fold. The panel photos can be laid in, each turned the
// way it ends up once folded (the top lid hinges on the back, so its art is
// upside down on the sheet).

const CUT = '#e0262b';
const FOLD = '#1aa35a';
const DIM = '#e0262b';

const f1 = (v) => (Math.round(v * 100) / 100).toString();

export function buildDieline({ W, H, D, real, art = {} }) {
  const glue = Math.min(15, Math.max(8, D * 0.6));
  const tuck = Math.min(15, Math.max(6, D * 0.55));
  const dust = Math.min(D * 0.6, W * 0.45);
  const r = tuck * 0.8;                 // tuck corner radius
  const M = 14;                         // margin around the net (room for dimensions)

  const x0 = 0, x1 = D, x2 = D + W, x3 = 2 * D + W, x4 = 2 * D + 2 * W, x5 = x4 + glue;
  const top = -(D + tuck), bottom = H + D + tuck;
  const sheetW = x5 + 2 * M, sheetH = bottom - top + 2 * M;
  const ox = M, oy = M - top;           // shift so everything is positive

  const cut = [], fold = [];
  const seg = (list, a, b) => list.push(`M${f1(a[0] + ox)} ${f1(a[1] + oy)}L${f1(b[0] + ox)} ${f1(b[1] + oy)}`);
  const path = (list, d) => list.push(d);
  const P = (x, y) => `${f1(x + ox)} ${f1(y + oy)}`;

  // main row
  seg(cut, [x0, 0], [x0, H]);                 // free left edge
  seg(cut, [x1, 0], [x2, 0]);                 // top of front: free edge
  seg(cut, [x3, H], [x4, H]);                 // bottom of back: free edge
  for (const x of [x1, x2, x3, x4]) seg(fold, [x, 0], [x, H]);
  seg(fold, [x0, 0], [x1, 0]); seg(fold, [x2, 0], [x3, 0]); seg(fold, [x3, 0], [x4, 0]);
  seg(fold, [x0, H], [x1, H]); seg(fold, [x1, H], [x2, H]); seg(fold, [x2, H], [x3, H]);

  // glue flap, tapered
  const gt = Math.min(4, H * 0.08);
  path(cut, `M${P(x4, 0)}L${P(x5, gt)}L${P(x5, H - gt)}L${P(x4, H)}`);

  // dust flaps: the slanted side faces the lid, so they tuck in cleanly
  const dustFlap = (xa, xb, y, dir, slantRight) => {
    const s = Math.min(dust * 0.45, (xb - xa) * 0.3);
    const a = slantRight ? 1 : s, b = slantRight ? s : 1;
    path(cut, `M${P(xa, y)}L${P(xa + a, y + dir * dust)}L${P(xb - b, y + dir * dust)}L${P(xb, y)}`);
  };
  dustFlap(x0, x1, 0, -1, true);
  dustFlap(x2, x3, 0, -1, false);
  dustFlap(x0, x1, H, 1, true);
  dustFlap(x2, x3, H, 1, false);

  // lids with rounded tucks: top on the back, bottom on the front
  const lid = (xa, xb, y, dir) => {
    const yl = y + dir * D, yt = yl + dir * tuck;
    const rr = Math.min(r, (xb - xa) / 2, tuck);
    const sweep = dir < 0 ? 1 : 0;
    path(cut, `M${P(xa, y)}L${P(xa, yt - dir * rr)}A${f1(rr)} ${f1(rr)} 0 0 ${sweep} ${P(xa + rr, yt)}` +
      `L${P(xb - rr, yt)}A${f1(rr)} ${f1(rr)} 0 0 ${sweep} ${P(xb, yt - dir * rr)}L${P(xb, y)}`);
    seg(fold, [xa + 1.5, yl], [xb - 1.5, yl]);
  };
  lid(x3, x4, 0, -1);
  lid(x1, x2, H, 1);

  // artwork
  const imgs = [];
  const put = (f, x, y, w, h, rot) => {
    const c = art[f];
    if (!c) return;
    const href = c.toDataURL('image/jpeg', 0.85);
    const cx = x + w / 2 + ox, cy = y + h / 2 + oy;
    imgs.push(`<image href="${href}" x="${f1(x + ox)}" y="${f1(y + oy)}" width="${f1(w)}" height="${f1(h)}" preserveAspectRatio="none"` +
      (rot ? ` transform="rotate(${rot} ${f1(cx)} ${f1(cy)})"` : '') + '/>');
  };
  put('left', x0, 0, D, H, 0);
  put('front', x1, 0, W, H, 0);
  put('right', x2, 0, D, H, 0);
  put('back', x3, 0, W, H, 0);
  put('top', x3, -D, W, D, 180);
  put('bottom', x1, H, W, D, 0);

  // dimensions
  const dims = [];
  const label = (v) => `${v.toFixed(1)} mm`;
  const arrowH = (xa, xb, y, text) => {
    dims.push(`<path d="M${P(xa, y)}L${P(xb, y)}M${P(xa, y - 1.5)}L${P(xa, y + 1.5)}M${P(xb, y - 1.5)}L${P(xb, y + 1.5)}" />`);
    dims.push(`<text x="${f1((xa + xb) / 2 + ox)}" y="${f1(y - 1.5 + oy)}" text-anchor="middle">${text}</text>`);
  };
  const arrowV = (x, ya, yb, text) => {
    dims.push(`<path d="M${P(x, ya)}L${P(x, yb)}M${P(x - 1.5, ya)}L${P(x + 1.5, ya)}M${P(x - 1.5, yb)}L${P(x + 1.5, yb)}" />`);
    const cy = (ya + yb) / 2 + oy, cx = x - 2 + ox;
    dims.push(`<text x="${f1(cx)}" y="${f1(cy)}" text-anchor="middle" transform="rotate(-90 ${f1(cx)} ${f1(cy)})">${text}</text>`);
  };
  arrowH(x0, x1, -dust - 4, label(D));
  arrowH(x1, x2, -dust - 4, label(W));
  arrowV(-6, 0, H, label(H));

  // a 10 mm check bar, to confirm the print came out at 100%
  const by = bottom + M * 0.55;
  const bx = x5 - 10;
  const check = real
    ? `<g class="check"><path d="M${P(bx, by)}L${P(bx + 10, by)}" stroke="#000" stroke-width="0.6"/>` +
      `<text x="${f1(bx - 1.5 + ox)}" y="${f1(by + 1 + oy)}" text-anchor="end" fill="#000" font-size="2.6">10 mm</text></g>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" ` +
    (real ? `width="${f1(sheetW)}mm" height="${f1(sheetH)}mm" ` : '') +
    `viewBox="0 0 ${f1(sheetW)} ${f1(sheetH)}" font-family="Helvetica, Arial, sans-serif">` +
    `<rect width="100%" height="100%" fill="#fff"/>` +
    `<g class="art">${imgs.join('')}</g>` +
    `<g fill="none" stroke="${FOLD}" stroke-width="0.35" stroke-dasharray="2 1">${fold.map((d) => `<path d="${d}"/>`).join('')}</g>` +
    `<g fill="none" stroke="${CUT}" stroke-width="0.4" stroke-linejoin="round">${cut.map((d) => `<path d="${d}"/>`).join('')}</g>` +
    `<g stroke="${DIM}" stroke-width="0.2" fill="${DIM}" font-size="2.6">${dims.join('')}</g>` +
    check +
    `</svg>`;
  return { svg, size: { W, H, D, real, sheetW, sheetH } };
}
