#!/usr/bin/env node
// Builds the public site into _site/ for GitHub Pages:  npm run build
//
// Every challenge in challenges.json has `released: true` or `false`.
// - Released challenges are copied in full.
// - Unreleased ones keep only their thumb.png, and their entry in the public
//   challenges.json is cut down to number, slug, title and `comingSoon: true`,
//   so the gallery shows a "Coming soon" card that can't be opened.
//   Their code is not in _site/ at all, so it can't be reached by URL.
// - A challenge can own site-wide files (`sitePaths`, e.g. 04's sticky notes
//   overlay). While it's unreleased those files are left out, and any
//   <script src="…"> tag pointing at them is removed from the published pages.
//
// The local server (npm run serve) serves the repo as is, so everything shows
// in full there. To release a challenge: set `released: true` and merge to main.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');

// Top-level files and folders that make up the site. Anything else (scripts/,
// templates/, README, package.json, .github/) stays out of the public build.
const SITE = ['index.html', 'challenges.json', 'CNAME', 'assets', 'notes', 'challenges'];
// Challenge folders that aren't in challenges.json but should stay reachable.
const KEEP = ['01-color-and-food']; // redirect from 02's old address

const list = JSON.parse(await readFile(join(root, 'challenges.json'), 'utf8'));
const unreleased = list.filter((c) => c.released !== true);
const released = new Set(list.filter((c) => c.released === true).map((c) => c.slug));
const hiddenPaths = unreleased.flatMap((c) => c.sitePaths || []);

const exists = (p) => stat(p).then(() => true, () => false);
const posix = (p) => p.split(sep).join('/');
const isHidden = (rel) => hiddenPaths.some((h) => rel === h || rel.startsWith(h + '/'));

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const name of SITE) {
  const src = join(root, name);
  if (!(await exists(src)) || isHidden(name)) continue;
  if (name === 'challenges' || name === 'challenges.json') continue; // handled below
  await cp(src, join(out, name), {
    recursive: true,
    filter: (p) => !isHidden(posix(relative(root, p))) && !p.endsWith('.DS_Store'),
  });
}

// Challenge folders.
for (const slug of await readdir(join(root, 'challenges'))) {
  const src = join(root, 'challenges', slug);
  if (!(await stat(src)).isDirectory()) continue;
  const dest = join(out, 'challenges', slug);
  if (released.has(slug) || KEEP.includes(slug)) {
    // fonts/local/ holds license-restricted fonts that must never be published.
    await cp(src, dest, { recursive: true, filter: (p) => !p.endsWith('.DS_Store') && !/[\\/]fonts[\\/]local([\\/]|$)/.test(p) });
  } else if (await exists(join(src, 'thumb.png'))) {
    await mkdir(dest, { recursive: true });
    await cp(join(src, 'thumb.png'), join(dest, 'thumb.png'));
  }
}

// Public challenge list: unreleased entries keep only what the card needs.
const publicList = list.map((c) =>
  c.released === true ? c : { number: c.number, slug: c.slug, title: c.title, comingSoon: true });
await writeFile(join(out, 'challenges.json'), JSON.stringify(publicList, null, 2) + '\n');

// Drop <script> tags that load hidden site files (e.g. assets/sticky.js).
async function* htmlFiles(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* htmlFiles(p);
    else if (e.name.endsWith('.html')) yield p;
  }
}
if (hiddenPaths.length) {
  const tag = /[ \t]*<script\b[^>]*\bsrc="([^"]+)"[^>]*>\s*<\/script>[ \t]*\n?/g;
  for await (const file of htmlFiles(out)) {
    const html = await readFile(file, 'utf8');
    const fileDir = dirname(file);
    const next = html.replace(tag, (m, src) => {
      if (/^[a-z]+:|^\/\//i.test(src)) return m; // external
      const target = posix(relative(out, join(fileDir, src.split(/[?#]/)[0])));
      return isHidden(target) ? '' : m;
    });
    if (next !== html) await writeFile(file, next);
  }
}

console.log(`Built _site/: ${released.size} released, ${unreleased.length} coming soon` +
  (unreleased.length ? ` (${unreleased.map((c) => String(c.number).padStart(2, '0')).join(', ')})` : '') + '.');
