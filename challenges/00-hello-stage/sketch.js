// 00 · Hello stage
// Proves the template: a field of needles that turn toward the pointer.
// The crosshair sits exactly under the cursor, so you can see the 2000×2000
// mapping is right at any window size. Click or tap to change palette.
// S saves a PNG, F toggles fullscreen.

const GRID = 40;
const palettes = [
  ['#0e0e10', '#f2efe9', '#ff5a36'],
  ['#0b1d2a', '#9ad1d4', '#f7c548'],
  ['#1a0f1f', '#e8d5ff', '#3cf0a0'],
];
let pal = 0;

function setup() {
  stage();
  strokeCap(ROUND);
}

function draw() {
  const [bg, ink, accent] = palettes[pal];
  background(bg);

  const cell = width / GRID;
  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      const x = (i + 0.5) * cell;
      const y = (j + 0.5) * cell;
      const d = dist(x, y, mouseX, mouseY);
      const a = atan2(mouseY - y, mouseX - x);
      const len = map(d, 0, width * 0.7, cell * 0.9, cell * 0.15, true);
      stroke(d < 300 ? accent : ink);
      strokeWeight(map(d, 0, 600, 7, 2, true));
      line(x - cos(a) * len / 2, y - sin(a) * len / 2, x + cos(a) * len / 2, y + sin(a) * len / 2);
    }
  }

  // Crosshair at the pointer, in canvas coordinates.
  stroke(accent);
  strokeWeight(3);
  noFill();
  circle(mouseX, mouseY, 60);
  line(mouseX - 50, mouseY, mouseX + 50, mouseY);
  line(mouseX, mouseY - 50, mouseX, mouseY + 50);

  noStroke();
  fill(ink);
  textFont('monospace');
  textSize(28);
  text(`${round(mouseX)}, ${round(mouseY)}  ·  click: palette  ·  S: save  ·  F: fullscreen`, 40, height - 40);
}

function mousePressed() {
  pal = (pal + 1) % palettes.length;
}
