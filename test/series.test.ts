import assert from "node:assert/strict";
import { test } from "node:test";
import { nextPartNumber, seriesKey, seriesNavigation, sortParts } from "../src/lib/series.ts";
import { emptySeasonDoc, seasonDocSchema } from "../src/lib/schema.ts";

const part = (n: number, slug = `odyssey-p-${n}`) => ({ slug, title: `Odyssey p ${n}`, part: n });

test("series names match ignoring case and spacing", () => {
  assert.equal(seriesKey("  The  Odyssey "), "the odyssey");
  assert.equal(seriesKey("ODYSSEY"), seriesKey("odyssey"));
});

test("the parts are read in order of part number, the slug breaking ties", () => {
  const sorted = sortParts([part(3), part(1), { ...part(2), slug: "b" }, { ...part(2), slug: "a" }]);
  assert.deepEqual(sorted.map((p) => p.slug), ["odyssey-p-1", "a", "b", "odyssey-p-3"]);
});

test("a middle part links back and forward", () => {
  const nav = seriesNavigation("Odyssey", part(2), [part(3), part(1), part(2)])!;
  assert.deepEqual(nav.parts.map((p) => p.part), [1, 2, 3]);
  assert.equal(nav.index, 1);
  assert.equal(nav.parts[1].current, true);
  assert.equal(nav.previous?.slug, "odyssey-p-1");
  assert.equal(nav.next?.slug, "odyssey-p-3");
});

test("the first part has no previous, the last no next", () => {
  assert.equal(seriesNavigation("Odyssey", part(1), [part(1), part(2)])!.previous, null);
  assert.equal(seriesNavigation("Odyssey", part(2), [part(1), part(2)])!.next, null);
});

test("a season alone in its series gets no navigation", () => {
  assert.equal(seriesNavigation("Odyssey", part(1), []), null);
  assert.equal(seriesNavigation("Odyssey", part(1), [part(1)]), null);
});

test("a season missing from the published list (a preview) is added in its place", () => {
  const nav = seriesNavigation("Odyssey", part(2), [part(1), part(3)])!;
  assert.deepEqual(nav.parts.map((p) => p.slug), ["odyssey-p-1", "odyssey-p-2", "odyssey-p-3"]);
});

test("a season joining a series goes after its last part", () => {
  assert.equal(nextPartNumber([]), 1);
  assert.equal(nextPartNumber([1, 4, 2]), 5);
  assert.equal(nextPartNumber([999]), 999);
});

test("seasons saved before series existed load with no series", () => {
  const { series: _, ...old } = emptySeasonDoc("old");
  assert.equal(seasonDocSchema.parse(old).series, null);
  assert.deepEqual(seasonDocSchema.parse({ ...old, series: { name: " Odyssey ", part: 2 } }).series, { name: "Odyssey", part: 2 });
  assert.equal(seasonDocSchema.safeParse({ ...old, series: { name: "  ", part: 1 } }).success, false);
  assert.equal(seasonDocSchema.safeParse({ ...old, series: { name: "Odyssey", part: 0 } }).success, false);
});
