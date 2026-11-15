import assert from "node:assert/strict";
import { test } from "node:test";
import { lightboxPhotos } from "../src/lib/lightbox.ts";
import { emptySeasonDoc, type Item } from "../src/lib/schema.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const at = (x: number, y: number) => ({ x, y, w: 100, h: 100, rotation: 0, z: 0, locked: false });

function photo(n: number, x: number, y: number): Item {
  return {
    id: id(n),
    type: "photo",
    desktop: at(x, y),
    mobile: null,
    content: { mediaId: id(100 + n), width: 4000, height: 3000, widths: [400, 1600, 3200], alt: `photo ${n}`, fit: "cover" },
  };
}

test("lightboxPhotos keeps only photos, in reading order", () => {
  const quote: Item = { id: id(9), type: "quote", desktop: at(0, 0), mobile: null, content: { markdown: "hi", source: "", font: "serif", size: 24, align: "left", color: "#000000", binding: null } };
  const shape: Item = { id: id(8), type: "shape", desktop: at(0, 50), mobile: null, content: { shape: "star", fill: null, stroke: "#123456", strokeWidth: 4 } };
  const doc = { ...emptySeasonDoc("t"), items: [photo(1, 0, 900), quote, photo(2, 500, 100), shape, photo(3, 20, 100)] };
  const photos = lightboxPhotos(doc);
  assert.deepEqual(photos.map((p) => p.alt), ["photo 3", "photo 2", "photo 1"]);
  assert.deepEqual(photos[0], { mediaId: id(103), widths: [400, 1600, 3200], alt: "photo 3", width: 4000, height: 3000 });
});

test("lightboxPhotos is empty for a season without photos", () => {
  assert.deepEqual(lightboxPhotos(emptySeasonDoc("t")), []);
});
