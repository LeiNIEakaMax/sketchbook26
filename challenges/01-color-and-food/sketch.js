// Color and food
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG, F toggles fullscreen.
//
// The upper word is a color picked by mouseX, the lower word is a food picked
// by mouseY. The interactive area is the canvas minus a 256px margin on every
// side (1488×1488), split into equal bands, one per list item. Outside the
// margin the pointer is clamped to the first or last item.

const COLORS = [
  'Maroon', 'Saffron', 'Teal', 'Lavender', 'Ochre', 'Crimson',
  'Indigo', 'Coral', 'Olive', 'Cerulean', 'Magenta', 'Ivory',
];

const FOODS = [
  'Asparagus', 'Dumpling', 'Pistachio', 'Croissant', 'Mango', 'Ramen',
  'Artichoke', 'Tiramisu', 'Kimchi', 'Pretzel', 'Fig', 'Cornbread',
];

const MARGIN = 256;

// From the Figma frame (2048×2048), scaled to the 2000 canvas.
const FIGMA = 2048;
const K = STAGE_SIZE / FIGMA;
const BG = '#131313';
const INK = '#fefefe';
const FONT = 'Inria Serif';
const FONT_SIZE = 219 * K;           // 219px in Figma
const UPPER_Y = (707.45 + 263 / 2) * K;  // centre of the "Maroon" text box
const LOWER_Y = (1027.55 + 263 / 2) * K; // centre of the "Asparagus" text box

// Which item a coordinate falls on: equal bands across the area, clamped.
function band(v, count) {
  const span = STAGE_SIZE - MARGIN * 2;
  const i = Math.floor(((v - MARGIN) / span) * count);
  return constrain(i, 0, count - 1);
}

function setup() {
  stage();
  textFont(FONT);
  textSize(FONT_SIZE);
  textAlign(CENTER, CENTER);
  noStroke();
  // Canvas text only uses a web font once it has loaded.
  document.fonts.load(`${FONT_SIZE}px "${FONT}"`).then(redraw);
}

function draw() {
  background(BG);
  fill(INK);
  text(COLORS[band(mouseX, COLORS.length)], width / 2, UPPER_Y);
  text(FOODS[band(mouseY, FOODS.length)], width / 2, LOWER_Y);
}
