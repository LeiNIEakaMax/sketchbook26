#!/usr/bin/env node
// Create a new challenge from a template and add it to challenges.json.
//
//   npm run new -- 01 "Gravity wells"
//   npm run new -- 02 "Type soup" --template p5
//   npm run new -- 03 "Late night" --date 2026-12-01
//
// The date defaults to today on this computer.
// Makes challenges/01-gravity-wells/ from templates/<template>/.
import { cpSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const tIdx = args.indexOf('--template');
const template = tIdx >= 0 ? args.splice(tIdx, 2)[1] : 'p5';
const dIdx = args.indexOf('--date');
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const date = dIdx >= 0 ? args.splice(dIdx, 2)[1] : today;
const [num, ...titleParts] = args;
const title = titleParts.join(' ').trim();

const templates = readdirSync(join(root, 'templates'));
if (!/^\d{1,2}$/.test(num || '') || !title) {
  console.error('Usage: npm run new -- <number> "<title>" [--template ' + templates.join('|') + '] [--date YYYY-MM-DD]');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
  console.error('--date must look like 2026-11-20');
  process.exit(1);
}
if (!templates.includes(template)) {
  console.error(`No template "${template}". Available: ${templates.join(', ')}`);
  process.exit(1);
}

const nn = num.padStart(2, '0');
const slug = `${nn}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const dest = join(root, 'challenges', slug);
const manifestPath = join(root, 'challenges.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

if (existsSync(dest) || manifest.some((c) => c.number === Number(nn))) {
  console.error(`Challenge ${nn} already exists.`);
  process.exit(1);
}

cpSync(join(root, 'templates', template), dest, { recursive: true });
for (const f of readdirSync(dest)) {
  if (!/\.(html|js|css|md)$/.test(f)) continue;
  const p = join(dest, f);
  writeFileSync(p, readFileSync(p, 'utf8').replaceAll('{{TITLE}}', title));
}

manifest.push({
  number: Number(nn),
  slug,
  title,
  stack: template,
  date,
  description: '',
});
manifest.sort((a, b) => a.number - b.number);
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Created challenges/${slug}/`);
console.log(`Run "npm run serve" and open http://localhost:8000/challenges/${slug}/`);
