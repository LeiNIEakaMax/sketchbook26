// {{TITLE}}
// Canvas is 2000×2000. mouseX / mouseY are already in canvas coordinates.
// S saves a PNG, F toggles fullscreen.

function setup() {
  stage();
  background(17);
}

function draw() {
  noStroke();
  fill(255, 40);
  circle(mouseX, mouseY, 80);
}

function mousePressed() {
  background(17);
}
