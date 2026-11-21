# CC2026

30 interactive creative-coding challenges. Every piece is a 2000 × 2000 canvas, runs in the browser, and lives on one gallery site.

## Start a challenge

```sh
npm run new -- 01 "Gravity wells"   # copies templates/p5 → challenges/01-gravity-wells/
npm run serve                       # http://localhost:8000
```

Each challenge gets today's date in `challenges.json` (add `--date 2026-11-20` to set another), and the gallery shows it on the tile. Then edit `challenges/01-gravity-wells/sketch.js`. No install step: the scripts use plain Node (18+), and p5.js loads from a CDN.

**Testing on your phone:** `npm run serve` also prints a LAN address (like `http://192.168.1.42:8000/`), and the gallery at `localhost:8000` shows it as a QR code. Scan it with a phone on the same Wi‑Fi. If the page doesn't load, allow incoming connections for Node in the macOS firewall. The QR code only appears locally, never on the deployed site. Phones have no hover, so pointer-driven sketches respond while a finger drags.

In every p5 challenge:

- `stage()` replaces `createCanvas()`. It makes a 2000 × 2000 canvas and scales it to fit the window.
- `mouseX`, `mouseY` and `touches` are already in 0–2000 canvas coordinates.
- **S** saves a full-size PNG, **F** toggles fullscreen.
- Drop a `thumb.png` (any square size, ~600px is plenty) in the folder and the gallery shows it.

## Layout

```
index.html            gallery, reads challenges.json
challenges.json       list of challenges (npm run new adds to it)
challenges/NN-name/   one self-contained folder per challenge
templates/p5/         starting point copied by npm run new
scripts/              new.mjs and serve.mjs, no dependencies
assets/qrcode.js      vendored QR generator (MIT) for the local gallery
```

Each challenge folder is self-contained, including its own copy of `stage.js`, so you can change anything inside one without breaking the others.

## Other stacks

A challenge only needs an `index.html` in its folder. To use three.js, plain Canvas, shaders or anything else, either edit the copied folder, or add a new folder under `templates/` and run `npm run new -- 05 "Name" --template <folder>`. Keep the 2000 × 2000 rule and the PNG export.

## Workflow

1. Start a new thread in the CC2026 project for each challenge.
2. Work on a short-lived branch, for example `challenge/01-gravity-wells`.
3. Merge it into `main` when you're done. The site redeploys on every push to `main`.

## Deploy (one-time setup)

In the GitHub repo, open **Settings → Pages** and set **Source** to **GitHub Actions**. After that, `.github/workflows/pages.yml` publishes the repo to `https://<user>.github.io/cc2026/` on each push to `main`.
