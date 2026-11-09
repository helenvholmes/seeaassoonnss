// scroll lines: horizontal lines that bend more the further down the page you are.
// p5.js global mode. seasons.scroll is 0 at the top of the page and 1 at the end.
function setup() {
  createCanvas(windowWidth, windowHeight);
  noFill();
}

function draw() {
  clear();
  const bend = 10 + 80 * seasons.scroll;
  stroke(29, 29, 27, 40);
  for (let y = 20; y < height; y += 24) {
    beginShape();
    for (let x = 0; x <= width; x += 16) vertex(x, y + sin(x * 0.01 + y * 0.02 + frameCount * 0.01) * bend * noise(y * 0.01));
    endShape();
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
