import assert from "node:assert/strict";
import { test } from "node:test";
import { BOTTOM_SPACE, bottomOf, formatMonth, pageHeight } from "../src/lib/layout.ts";
import { emptySeasonDoc, seasonDocSchema, type Item } from "../src/lib/schema.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const quote = (n: number, y: number, h: number, rotation = 0, mobile = true): Item => ({
  id: id(n),
  type: "quote",
  desktop: { x: 0, y, w: 100, h, rotation, z: n, locked: false },
  mobile: mobile ? { x: 0, y: y / 4, w: 50, h: h / 4, rotation: 0, z: n, locked: false } : null,
  content: { markdown: "", source: "", font: "serif", size: 20, align: "left", color: "#000000", binding: null },
});

test("the page grows past its minimum to fit the lowest item, with no limit", () => {
  const doc = { ...emptySeasonDoc("t"), desktopHeight: 900, items: [quote(1, 100, 100), quote(2, 250_000, 400)] };
  assert.equal(pageHeight(doc, "desktop"), 250_400 + BOTTOM_SPACE.desktop);
  assert.ok(seasonDocSchema.safeParse(doc).success, "items far down the page are valid");
});

test("the minimum height still applies to a short page", () => {
  const doc = { ...emptySeasonDoc("t"), desktopHeight: 900, items: [quote(1, 0, 100)] };
  assert.equal(pageHeight(doc, "desktop"), 900);
  assert.equal(pageHeight({ ...doc, items: [] }, "desktop"), 900);
});

test("rotated items count by their lowest corner; hidden mobile items do not count", () => {
  assert.equal(Math.round(bottomOf({ x: 0, y: 0, w: 100, h: 100, rotation: 45, z: 1, locked: false })), Math.round(50 + 50 * Math.SQRT2));
  const doc = { ...emptySeasonDoc("t"), mobileHeight: 200, items: [quote(1, 0, 100), quote(2, 8000, 100, 0, false)] };
  assert.equal(pageHeight(doc, "mobile"), 200);
});

test("months", () => {
  assert.equal(formatMonth("2025-10"), "october 2025");
  assert.equal(formatMonth(null), "");
  const base = emptySeasonDoc("t");
  assert.ok(seasonDocSchema.safeParse({ ...base, month: "2025-10" }).success);
  assert.ok(!seasonDocSchema.safeParse({ ...base, month: "2025-13" }).success);
  const old = { ...base } as Record<string, unknown>;
  delete old.month;
  assert.equal(seasonDocSchema.parse(old).month, null, "seasons saved before the month field still load");
});
