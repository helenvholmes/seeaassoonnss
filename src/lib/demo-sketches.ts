// Example p5.js sketches for the demo season and the sketch library. Each is plain
// p5.js in global mode, as you would paste it from the p5.js web editor.

export const DEMO_SKETCHES: { name: string; code: string }[] = [
  {
    name: "cursor rings",
    code: `// cursor rings: thin circles that grow from wherever the cursor rests.
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
`,
  },
  {
    name: "drifting leaves",
    code: `// drifting leaves: soft green shapes that drift down and lean away from the cursor.
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
`,
  },
  {
    name: "scroll lines",
    code: `// scroll lines: horizontal lines that bend more the further down the page you are.
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
`,
  },
];
