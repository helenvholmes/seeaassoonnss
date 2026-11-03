import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, duplicateItem, moveLayer, normalizeRotation, removeItem, scaledMobileLayout, setMobileVisible, singleColumnMobileLayout, withMobileLayout, MOBILE_FACTOR } from "../src/components/editor/ops.ts";
import { commit, commitGesture, createHistory, redo, replace, undo, HISTORY_LIMIT } from "../src/components/editor/history.ts";
import { emptySeasonDoc, seasonDocSchema, slugify, slugProblem, type Item } from "../src/lib/schema.ts";
import { targetWidths } from "../src/lib/widths.ts";
import { parsePlaylistId } from "../src/lib/spotify.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function quote(n: number): Item {
  return {
    id: id(n),
    type: "quote",
    desktop: { x: 0, y: 0, w: 100, h: 50, rotation: 0, z: 0, locked: false },
    mobile: null,
    content: { markdown: `q${n}`, source: "", font: "serif", size: 24, align: "left", color: "#000000", binding: null },
  };
}

test("addItem puts the new item on top", () => {
  let doc = emptySeasonDoc("t");
  doc = addItem(doc, quote(1));
  doc = addItem(doc, quote(2));
  assert.deepEqual(doc.items.map((i) => i.desktop.z), [1, 2]);
  assert.ok(seasonDocSchema.safeParse(doc).success);
});

test("moveLayer reorders and renumbers", () => {
  let doc = emptySeasonDoc("t");
  for (const n of [1, 2, 3]) doc = addItem(doc, quote(n));
  const z = (d: typeof doc) => Object.fromEntries(d.items.map((i) => [(i.content as { markdown: string }).markdown, i.desktop.z]));
  assert.deepEqual(z(moveLayer(doc, id(1), "front")), { q1: 3, q2: 1, q3: 2 });
  assert.deepEqual(z(moveLayer(doc, id(3), "back")), { q1: 2, q2: 3, q3: 1 });
  assert.deepEqual(z(moveLayer(doc, id(1), "forward")), { q1: 2, q2: 1, q3: 3 });
  assert.deepEqual(z(moveLayer(doc, id(1), "backward")), { q1: 1, q2: 2, q3: 3 });
});

test("duplicate offsets, unlocks and goes on top; remove clears the cover", () => {
  let doc = addItem(emptySeasonDoc("t"), { ...quote(1), desktop: { ...quote(1).desktop, locked: true } });
  doc = duplicateItem(doc, id(1), id(2));
  const copy = doc.items[1];
  assert.equal(copy.desktop.x, 24);
  assert.equal(copy.desktop.locked, false);
  assert.equal(copy.desktop.z, 2);
  doc = { ...doc, coverItemId: id(2) };
  assert.equal(removeItem(doc, id(2)).coverItemId, null);
});

test("rotation normalizes", () => {
  assert.equal(normalizeRotation(370), 10);
  assert.equal(normalizeRotation(-190), 170);
  assert.equal(normalizeRotation(180), 180);
});

test("history: commit, merge, undo, redo, limit, gestures", () => {
  let h = createHistory(0);
  h = commit(h, 1, "a", 1000);
  h = commit(h, 2, "a", 1500); // merges with the previous step
  assert.deepEqual(h.past, [0]);
  h = undo(h);
  assert.equal(h.present, 0);
  h = redo(h);
  assert.equal(h.present, 2);
  for (let i = 3; i < 100; i++) h = commit(h, i);
  assert.equal(h.past.length, HISTORY_LIMIT);
  const before = h.present;
  h = replace(h, 500);
  h = replace(h, 501);
  h = commitGesture(h, before);
  assert.equal(undo(h).present, before);
});

test("slugs", () => {
  assert.equal(slugify("// Leafy Greens!"), "leafy-greens");
  assert.equal(slugify("après la pluie"), "apres-la-pluie");
  assert.equal(slugProblem("edit"), '"edit" is reserved.');
  assert.equal(slugProblem("leafy-greens"), null);
  assert.ok(slugProblem("Leafy"));
});

test("image widths", () => {
  assert.deepEqual(targetWidths(4032), [640, 1280, 2048]);
  assert.deepEqual(targetWidths(1000), [640, 1000]);
  assert.deepEqual(targetWidths(500), [500]);
  assert.deepEqual(targetWidths(2048), [640, 1280, 2048]);
});

test("spotify playlist links", () => {
  const pid = "37i9dQZF1DXcBWIGoYBM5M";
  assert.equal(parsePlaylistId(`https://open.spotify.com/playlist/${pid}?si=abc`), pid);
  assert.equal(parsePlaylistId(`https://open.spotify.com/intl-de/playlist/${pid}`), pid);
  assert.equal(parsePlaylistId(`spotify:playlist:${pid}`), pid);
  assert.equal(parsePlaylistId(`https://open.spotify.com/album/${pid}`), null);
  assert.equal(parsePlaylistId(`https://evil.example/playlist/${pid}`), null);
});

test("new items get a scaled mobile placement on top", () => {
  let doc = addItem(emptySeasonDoc("t"), { ...quote(1), desktop: { ...quote(1).desktop, x: 1440, y: 720, w: 720 } });
  const m = doc.items[0].mobile!;
  assert.equal(m.x, 390);
  assert.equal(m.w, 195);
  assert.equal(m.z, 1);
  assert.equal(m.textSize, Math.round(24 * MOBILE_FACTOR * 10) / 10);
  assert.ok(seasonDocSchema.safeParse(doc).success);
});

test("layers are separate per layout", () => {
  let doc = emptySeasonDoc("t");
  for (const n of [1, 2]) doc = addItem(doc, quote(n));
  doc = moveLayer(doc, id(1), "front", "mobile");
  assert.deepEqual(doc.items.map((i) => [i.desktop.z, i.mobile!.z]), [[1, 2], [2, 1]]);
});

test("hide and show on mobile; duplicates of hidden items stay hidden", () => {
  let doc = addItem(emptySeasonDoc("t"), quote(1));
  doc = setMobileVisible(doc, id(1), false);
  assert.equal(doc.items[0].mobile, null);
  doc = duplicateItem(doc, id(1), id(2));
  assert.equal(doc.items[1].mobile, null);
  doc = setMobileVisible(doc, id(1), true);
  assert.ok(doc.items[0].mobile);
});

test("phase 1 seasons get the scaled layout; single column stacks in reading order", () => {
  let doc = emptySeasonDoc("t");
  doc = { ...doc, mobileLayout: false, items: [{ ...quote(1), desktop: { ...quote(1).desktop, y: 500, w: 720, h: 360 } }, { ...quote(2), desktop: { ...quote(2).desktop, y: 100, w: 360, h: 360 } }] };
  const scaled = withMobileLayout(doc);
  assert.equal(scaled.mobileLayout, true);
  assert.equal(scaled.items[0].mobile!.y, Math.round(500 * MOBILE_FACTOR * 10) / 10);
  assert.equal(withMobileLayout(scaled), scaled);
  const col = singleColumnMobileLayout(doc);
  const [a, b] = col.items.map((i) => i.mobile!);
  assert.equal(b.y, 24); // quote 2 is higher on desktop, so it comes first
  assert.equal(a.y, 24 + 342 + 24);
  assert.equal(a.w, 342);
  assert.equal(a.h, 171);
  assert.equal(col.mobileHeight, 24 + 342 + 24 + 171 + 24);
  assert.ok(seasonDocSchema.safeParse(scaledMobileLayout(doc)).success);
});
