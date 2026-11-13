import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_CROP, panCrop, photoRect, zoomCrop } from "../src/lib/crop.ts";
import { photoSchema } from "../src/lib/schema.ts";

const close = (a: number, b: number, m = "") => assert.ok(Math.abs(a - b) < 1e-9, `${m} ${a} ≈ ${b}`);
const covers = (r: ReturnType<typeof photoRect>) => r.left <= 1e-9 && r.top <= 1e-9 && r.left + r.width >= 1 - 1e-9 && r.top + r.height >= 1 - 1e-9;

test("with no crop a wide photo covers its box, centered", () => {
  const r = photoRect(2000, 1000, 100, 100, null); // 2:1 photo in a square box
  close(r.width, 2);
  close(r.height, 1);
  close(r.left, -0.5);
  close(r.top, 0);
});

test("x and y choose the edge shown; zoom enlarges; the box is always covered", () => {
  close(photoRect(2000, 1000, 100, 100, { x: 0, y: 0.5, zoom: 1 }).left, 0, "x = 0 shows the left edge");
  close(photoRect(2000, 1000, 100, 100, { x: 1, y: 0.5, zoom: 1 }).left, -1, "x = 1 shows the right edge");
  for (const crop of [NO_CROP, { x: 0, y: 1, zoom: 3 }, { x: 0.3, y: 0.8, zoom: 8 }]) {
    for (const [w, h] of [[100, 100], [300, 50], [40, 400]]) assert.ok(covers(photoRect(1600, 1200, w, h, crop)), JSON.stringify({ crop, w, h }));
  }
});

test("panning follows the pointer and stops at the photo's edges", () => {
  const r = photoRect(2000, 1000, 100, 100, NO_CROP);
  const moved = panCrop(NO_CROP, r, 0.25, 0); // pointer right by a quarter box: photo moves right
  close(photoRect(2000, 1000, 100, 100, moved).left, r.left + 0.25);
  assert.equal(panCrop(NO_CROP, r, 5, 0).x, 0, "clamped at the left edge");
  assert.equal(panCrop(NO_CROP, r, 0, 0.3).y, 0.5, "no spare height: vertical pan does nothing");
});

test("zooming keeps the middle of the box on the same part of the photo", () => {
  const start = { x: 0.2, y: 0.5, zoom: 1 };
  const before = photoRect(2000, 1000, 100, 100, start);
  const u = (0.5 - before.left) / before.width;
  const z = zoomCrop(start, 2000, 1000, 100, 100, 2.5);
  const after = photoRect(2000, 1000, 100, 100, z);
  close((0.5 - after.left) / after.width, u, "same photo point at the center");
  assert.equal(zoomCrop(start, 2000, 1000, 100, 100, 99).zoom, 8, "zoom is capped");
});

test("photos saved before cropping existed still validate", () => {
  const base = { id: "00000000-0000-4000-8000-000000000001", type: "photo", desktop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 1, locked: false }, mobile: null };
  const content = { mediaId: "00000000-0000-4000-8000-000000000002", width: 10, height: 10, widths: [10], alt: "", fit: "cover" };
  assert.ok(photoSchema.safeParse({ ...base, content }).success);
  assert.ok(photoSchema.safeParse({ ...base, content: { ...content, crop: { x: 0.1, y: 0.9, zoom: 2 } } }).success);
  assert.ok(!photoSchema.safeParse({ ...base, content: { ...content, crop: { x: 2, y: 0, zoom: 1 } } }).success);
});
