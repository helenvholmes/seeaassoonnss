import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, scatterArea, scatterLayout, seededRandom, SCATTER_BASE_WIDTH, SCATTER_COVERAGE } from "../src/components/editor/ops.ts";
import { DEFAULT_SCATTER, emptySeasonDoc, MAX_MODEL_ITEMS, seasonDocSchema, type Item, type SeasonDoc } from "../src/lib/schema.ts";
import { escapeInlineScript, sketchDocument } from "../src/lib/sketch-frame.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = { x: 10, y: 10, w: 400, h: 300, rotation: 5, z: 0, locked: false };

function photo(n: number, locked = false): Item {
  return {
    id: id(n),
    type: "photo",
    desktop: { ...at, locked },
    mobile: null,
    content: { mediaId: id(900 + n), width: 4000, height: 3000, widths: [640], alt: "", fit: "cover" },
  };
}
function quote(n: number): Item {
  return { id: id(n), type: "quote", desktop: { ...at }, mobile: null, content: { markdown: "q", source: "", font: "serif", size: 24, align: "left", color: "#000000", binding: null } };
}
function model(n: number): Item {
  return {
    id: id(n),
    type: "model_3d",
    desktop: { ...at },
    mobile: null,
    content: { mediaId: id(800 + n), posterMediaId: null, posterWidths: [], bytes: 1000, scale: 1, rotation: [0, 0, 0], spin: 0, follow: false, animate: false, hasAnimation: false, alt: "" },
  };
}

function season(items: Item[]): SeasonDoc {
  let doc = { ...emptySeasonDoc("t"), desktopHeight: 2000 };
  for (const i of items) doc = addItem(doc, i);
  return doc;
}

test("seededRandom repeats for the same seed and differs between seeds", () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const c = seededRandom(43);
  const xs = [a(), a(), a()];
  assert.deepEqual(xs, [b(), b(), b()]);
  assert.notDeepEqual(xs, [c(), c(), c()]);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test("scatter: the same seed gives the same layout; another seed a different one", () => {
  const doc = season([photo(1), photo(2), quote(3)]);
  const s = { seed: 7, minScale: 0.5, maxScale: 1.5 };
  const a = scatterLayout(doc, "desktop", s);
  const b = scatterLayout(doc, "desktop", s);
  assert.deepEqual(a.items, b.items);
  assert.deepEqual(a.scatter, s);
  const c = scatterLayout(doc, "desktop", { ...s, seed: 8 });
  assert.notDeepEqual(a.items.map((i) => i.desktop), c.items.map((i) => i.desktop));
});

test("scatter leaves locked items alone and keeps everything on the page", () => {
  const doc = season([photo(1, true), photo(2), quote(3), photo(4)]);
  const out = scatterLayout(doc, "desktop", { seed: 3, minScale: 0.5, maxScale: 2 });
  assert.deepEqual(out.items[0].desktop, doc.items[0].desktop);
  for (const item of out.items) {
    const p = item.desktop;
    assert.ok(p.x >= 0 && p.x + p.w <= 1440 + 1, `x in page: ${JSON.stringify(p)}`);
    assert.ok(p.y >= 0, "y in page");
    assert.equal(p.rotation, 5, "rotation is kept");
  }
  assert.ok(seasonDocSchema.safeParse(out).success);
});

test("scatter scales images within the range and keeps their aspect ratio; quotes keep their size", () => {
  const doc = season([photo(1), photo(2), photo(3), quote(4), model(5)]);
  const out = scatterLayout(doc, "desktop", { seed: 11, minScale: 0.5, maxScale: 1.5 });
  for (const item of out.items) {
    const p = item.desktop;
    if (item.type === "quote") {
      assert.equal(p.w, 400);
      assert.equal(p.h, 300);
    } else {
      assert.ok(p.w >= SCATTER_BASE_WIDTH.desktop * 0.5 - 1 && p.w <= SCATTER_BASE_WIDTH.desktop * 1.5 + 1, `width ${p.w}`);
      assert.ok(Math.abs(p.h / p.w - 0.75) < 0.01, "aspect ratio");
    }
  }
});

test("scattering twice with one seed gives the same layout", () => {
  const s = { seed: 9, minScale: 0.5, maxScale: 1.5 };
  const once = scatterLayout(season([photo(1), photo(2), quote(3)]), "desktop", s);
  const twice = scatterLayout(once, "desktop", s);
  assert.deepEqual(twice.items, once.items);
});

test("scatter spreads over the minimum page length", () => {
  const out = scatterLayout(season([photo(1), photo(2), photo(3), photo(4)]), "desktop", DEFAULT_SCATTER);
  for (const i of out.items) assert.ok(i.desktop.y + i.desktop.h <= 2000 + 1);
});

test("with many items, scatter makes the page longer instead of piling them up", () => {
  const many = season(Array.from({ length: 60 }, (_, n) => photo(n + 1)));
  const area = scatterArea(many, "desktop", DEFAULT_SCATTER);
  assert.ok(area.height > 2000, `area grows: ${area.height}`);
  const out = scatterLayout(many, "desktop", DEFAULT_SCATTER);
  const covered = out.items.reduce((sum, i) => sum + i.desktop.w * i.desktop.h, 0);
  assert.ok(covered / (1440 * area.height) <= SCATTER_COVERAGE + 0.01, "coverage stays at the target");
  const lowest = Math.max(...out.items.map((i) => i.desktop.y + i.desktop.h));
  assert.ok(lowest > 2000 && lowest <= area.height + 1, `items use the longer page: ${lowest}`);
  // A few items still fit in the minimum length.
  assert.equal(scatterArea(season([photo(1), photo(2)]), "desktop", DEFAULT_SCATTER).height, 2000);
});

test("scatter in one layout does not touch the other", () => {
  const doc = season([photo(1), photo(2)]);
  const out = scatterLayout(doc, "mobile", DEFAULT_SCATTER);
  assert.deepEqual(out.items.map((i) => i.desktop), doc.items.map((i) => i.desktop));
  assert.notDeepEqual(out.items.map((i) => i.mobile), doc.items.map((i) => i.mobile));
  for (const i of out.items) assert.ok(i.mobile!.x + i.mobile!.w <= 390 + 1);
});

test("adding an item does not move the others on the next scatter", () => {
  const s = { seed: 5, minScale: 1, maxScale: 1 };
  const before = scatterLayout(season([photo(1), photo(2)]), "desktop", s);
  const after = scatterLayout(season([photo(1), photo(2), photo(3)]), "desktop", s);
  assert.deepEqual(after.items[0].desktop.x, before.items[0].desktop.x);
});

test("old season documents get the new fields by default", () => {
  const old = JSON.parse(JSON.stringify(emptySeasonDoc("t")));
  delete old.backgroundLayer;
  delete old.scatter;
  const parsed = seasonDocSchema.parse(old);
  assert.equal(parsed.backgroundLayer, null);
  assert.deepEqual(parsed.scatter, DEFAULT_SCATTER);
});

test(`a season holds at most ${MAX_MODEL_ITEMS} 3D models`, () => {
  const ok = season(Array.from({ length: MAX_MODEL_ITEMS }, (_, i) => model(i + 1)));
  assert.ok(seasonDocSchema.safeParse(ok).success);
  const tooMany = addItem(ok, model(99));
  assert.equal(seasonDocSchema.safeParse(tooMany).success, false);
});

test("sketch code cannot close its script tag", () => {
  const code = 'let s = "</script><script>alert(1)</script>"; // <!-- x';
  const html = sketchDocument(code, "/seasons/vendor/p5.min.js?v=1");
  const body = html.slice(html.indexOf("<body>"));
  assert.equal((body.match(/<\/script/gi) ?? []).length, 1, "only the frame's own closing tag");
  assert.ok(!escapeInlineScript(code).includes("<!--"));
  assert.ok(html.includes('src="/seasons/vendor/p5.min.js?v=1"'));
});
