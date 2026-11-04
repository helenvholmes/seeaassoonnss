import assert from "node:assert/strict";
import { test } from "node:test";
import { boxOf, measure } from "../src/components/editor/measure.ts";

const p = (x: number, y: number, w: number, h: number, rotation = 0) => ({ x, y, w, h, rotation, z: 1, locked: false });
const page = { width: 1440, height: 2000 };
const labels = (m: ReturnType<typeof measure>) => m.lines.map((l) => l.label);

test("against the page: distances to all four edges, and centered", () => {
  const m = measure(p(620, 100, 200, 50), page, null);
  assert.deepEqual(labels(m), ["620", "620", "100", "1850"]);
  assert.equal(m.guides[0].centered, true);
  assert.equal(measure(p(621, 100, 200, 50), page, null).guides[0].centered, false);
});

test("against another item: the gaps between them", () => {
  const m = measure(p(100, 100, 200, 100), page, p(400, 120, 100, 100));
  assert.deepEqual(labels(m), ["100"]);
  assert.equal(m.lines[0].y1, 160, "drawn through the middle of their vertical overlap");
  const below = measure(p(100, 100, 200, 100), page, p(100, 260, 200, 50));
  assert.deepEqual(labels(below), ["60"]);
  assert.ok(below.guides.some((g) => g.axis === "x" && g.centered && g.at === 200), "centered on each other");
});

test("inside another item: distances to its edges", () => {
  const m = measure(p(110, 120, 80, 40), page, p(100, 100, 100, 100));
  assert.deepEqual(labels(m), ["10", "10", "20", "40"]);
});

test("rotated items are measured by their outer box", () => {
  const b = boxOf(p(0, 0, 100, 100, 45));
  assert.ok(Math.abs(b.x1 - b.x0 - 100 * Math.SQRT2) < 1e-9);
});
