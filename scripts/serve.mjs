#!/usr/bin/env node
// Tiny static server with no dependencies: npm run serve  →  http://localhost:8000
// Listens on all interfaces, so a phone on the same Wi‑Fi can open the LAN URL
// it prints (the local gallery also shows it as a QR code).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT) || 8000;
const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glsl': 'text/plain', '.frag': 'text/plain', '.vert': 'text/plain', '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2',
};

// Private IPv4 addresses of this machine, Wi‑Fi/Ethernet first.
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
      out.push({ name, address: a.address });
    }
  }
  const rank = (n) => (/^(en|eth|wlan|wl)/.test(n) ? 0 : 1);
  return out.sort((a, b) => rank(a.name) - rank(b.name)).map((a) => `http://${a.address}:${port}/`);
}

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');

  // Only exists locally; the deployed site 404s here, so the gallery hides its QR code.
  if (path === '/__lan.json') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ urls: lanAddresses() }));
  }

  let file = join(root, path);
  try {
    if ((await stat(file)).isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
    }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`sketchbook26 at http://localhost:${port}`);
  const lan = lanAddresses();
  if (lan.length) console.log(`On your phone (same Wi‑Fi): ${lan.join('  ')}`);
  else console.log('No LAN address found, so phones can’t reach this machine right now.');
});
