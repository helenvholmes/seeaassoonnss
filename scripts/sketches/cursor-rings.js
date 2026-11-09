// cursor rings: thin circles that grow from wherever the cursor rests.
// p5.js global mode. On phones the "cursor" follows the scroll position.
let rings = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  noFill();
}

function draw() {
  clear();
  if (frameCount % 12 === 0) rings.push({ x: mouseX, y: mouseY, r: 0 });
  for (const ring of rings) {
    ring.r += 1.6;
    stroke(198, 61, 50, map(ring.r, 0, 320, 120, 0));
    circle(ring.x, ring.y, ring.r * 2);
  }
  rings = rings.filter((ring) => ring.r < 320);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
