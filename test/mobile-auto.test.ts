import assert from "node:assert/strict";
import { test } from "node:test";
import { autoMobileLayout, onlyMobileDiffers, sameMobileLayout, setPlacement } from "../src/components/editor/ops.ts";
import { emptySeasonDoc, seasonDocSchema, type Item, type Placement } from "../src/lib/schema.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (x: number, y: number, w: number, h: number, z = 1): Placement => ({ x, y, w, h, rotation: 0, z, locked: false });
const photo = (n: number, p: Placement): Item => ({ id: id(n), type: "photo", desktop: p, mobile: null, content: { mediaId: id(900 + n), width: 4, height: 3, widths: [640], alt: "", fit: "cover" } });
const sticker = (n: number, p: Placement): Item => ({ id: id(n), type: "sticker", desktop: p, mobile: null, content: { stickerId: id(800 + n), mediaId: id(700 + n), width: 1, height: 1, widths: [640], alt: "" } });
const quote = (n: number, p: Placement): Item => ({ id: id(n), type: "quote", desktop: p, mobile: null, content: { markdown: "q", source: "", font: "serif", size: 30, align: "left", color: "#000000", binding: null } });
const doc = (items: Item[]) => ({ ...emptySeasonDoc("t"), items });
const m = (d: ReturnType<typeof autoMobileLayout>, n: number) => d.items.find((i) => i.id === id(n))!.mobile!;

test("side-by-side big items stack in reading order, full width", () => {
  const d = autoMobileLayout(doc([photo(2, at(760, 100, 600, 450)), photo(1, at(80, 120, 600, 450)), quote(3, at(80, 700, 480, 180))]));
  assert.ok(seasonDocSchema.safeParse(d).success);
  // Left before right, even though the right one is a little higher.
  assert.ok(m(d, 1).y < m(d, 2).y && m(d, 2).y < m(d, 3).y);
  for (const n of [1, 2, 3]) assert.deepEqual([m(d, n).x, m(d, n).w], [24, 342]);
  // A quote's text scales with its box, so its lines break the same way.
  assert.equal(m(d, 3).textSize, Math.round(30 * (342 / 480) * 10) / 10);
  assert.ok(d.mobileHeight >= m(d, 3).y + m(d, 3).h);
});

test("small items in one row pair up", () => {
  const d = autoMobileLayout(doc([photo(1, at(100, 100, 300, 300)), photo(2, at(500, 100, 300, 300))]));
  assert.equal(m(d, 1).y, m(d, 2).y);
  assert.ok(m(d, 1).x + m(d, 1).w <= m(d, 2).x);
  assert.ok(m(d, 2).x + m(d, 2).w <= 390 - 24 + 0.5);
});

test("a sticker on a photo stays on it", () => {
  const d = autoMobileLayout(doc([photo(1, at(100, 100, 600, 400)), sticker(2, at(550, 80, 100, 100, 2))]));
  const p = m(d, 1);
  const s = m(d, 2);
  const k = p.w / 600;
  assert.deepEqual([s.x, s.y, s.w], [Math.round((p.x + 450 * k) * 10) / 10, Math.round((p.y - 20 * k) * 10) / 10, Math.round(100 * k * 10) / 10]);
  assert.ok(s.z > p.z);
});

test("items beside a route map go inside its band, below the pinned map", () => {
  const route: Item = { id: id(1), type: "route", desktop: at(720, 0, 720, 2700), mobile: null, content: { stops: [{ name: "a", lon: 0, lat: 0 }], line: [], color: "#c63d32", borders: true, stepZoom: 3 } };
  const d = autoMobileLayout(doc([route, quote(2, at(80, 300, 480, 180)), quote(3, at(80, 1500, 480, 180)), photo(4, at(80, 3000, 600, 400))]));
  const band = m(d, 1);
  assert.deepEqual([band.x, band.w], [0, 390]);
  for (const n of [2, 3]) assert.ok(m(d, n).y >= band.y + 600 && m(d, n).y + m(d, n).h <= band.y + band.h);
  assert.ok(m(d, 4).y >= band.y + band.h);
});

test("a hand edit to mobile is told apart from a desktop edit", () => {
  const d = autoMobileLayout(doc([photo(1, at(100, 100, 600, 400))]));
  assert.ok(sameMobileLayout(d, autoMobileLayout(d)), "rebuilding is stable");
  const mobileEdit = setPlacement(d, id(1), { x: 50 }, "mobile");
  assert.ok(onlyMobileDiffers(d, mobileEdit) && !sameMobileLayout(d, mobileEdit));
  const desktopEdit = setPlacement(d, id(1), { x: 50 }, "desktop");
  assert.equal(onlyMobileDiffers(d, desktopEdit), false);
});
