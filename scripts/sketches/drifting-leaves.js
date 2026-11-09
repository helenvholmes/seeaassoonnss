// drifting leaves: soft green shapes that drift down and lean away from the cursor.
// p5.js global mode. seasons.scroll is 0 at the top of the page and 1 at the end.
let leaves = [];

function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
  randomSeed(7);
  for (let i = 0; i < 28; i++) leaves.push(newLeaf(random(height)));
}

function newLeaf(y) {
  return { x: random(width), y, size: random(18, 46), turn: random(TWO_PI), speed: random(0.3, 0.9), hue: random([[159, 191, 138], [201, 207, 122], [111, 143, 92]]) };
}

function draw() {
  clear();
  for (const leaf of leaves) {
    const away = constrain((leaf.x - mouseX) / 200, -1, 1);
    leaf.x += away * 0.6 + sin(frameCount * 0.01 + leaf.turn) * 0.3;
    leaf.y += leaf.speed;
    leaf.turn += 0.01;
    if (leaf.y > height + 60) Object.assign(leaf, newLeaf(-60));
    push();
    translate(leaf.x, leaf.y);
    rotate(leaf.turn);
    fill(...leaf.hue, 90);
    ellipse(0, 0, leaf.size * 0.55, leaf.size);
    pop();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
