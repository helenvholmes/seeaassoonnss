import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCoordinates } from "../src/lib/geo.ts";
import { itemSchema } from "../src/lib/schema.ts";
import { peaks } from "../src/components/editor/media-browser.ts";
import { looksLike } from "../src/lib/magic.ts";

const uuid = "00000000-0000-4000-8000-000000000001";
const place = { x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 1, locked: false };

test("coordinates parse; out-of-range and text do not", () => {
  assert.deepEqual(parseCoordinates("40.7128, -74.006"), { lat: 40.7128, lon: -74.006, label: "" });
  assert.deepEqual(parseCoordinates("-33.9 151.2"), { lat: -33.9, lon: 151.2, label: "" });
  assert.equal(parseCoordinates("91, 10"), null);
  assert.equal(parseCoordinates("Brooklyn"), null);
});

test("waveform peaks are normalized", () => {
  const samples = new Float32Array([0, 0.5, -0.25, 0.1, 0, -1, 0.2, 0.2]);
  assert.deepEqual(peaks(samples, 4), [0.5, 0.25, 1, 0.2]);
});

test("new item types validate", () => {
  const items = [
    { type: "video", content: { mediaId: uuid, posterMediaId: uuid, posterWidths: [640], width: 1080, height: 1920, duration: 3.2, hasAudio: true, alt: "", fit: "cover" } },
    { type: "sticker", content: { stickerId: uuid, mediaId: uuid, width: 500, height: 400, widths: [500], alt: "" } },
    { type: "map", content: { lat: 40.7, lon: -74, zoom: 6, label: "nyc", borders: true } },
    { type: "voice_note", content: { mediaId: uuid, duration: 12.5, caption: "", waveform: [0, 0.5, 1] } },
  ];
  for (const i of items) {
    const r = itemSchema.safeParse({ id: uuid, desktop: place, mobile: null, ...i });
    assert.ok(r.success, `${i.type}: ${!r.success && r.error.issues[0]?.message}`);
  }
  assert.ok(!itemSchema.safeParse({ id: uuid, desktop: place, mobile: null, type: "map", content: { lat: 89, lon: 0, zoom: 1, label: "", borders: false } }).success);
});

test("magic bytes: MP4 and MP3", () => {
  assert.ok(looksLike("video", Buffer.from("000000206674797069736f6d", "hex")));
  assert.ok(!looksLike("video", Buffer.from("1a45dfa3a3428681a3428681", "hex"))); // WebM
  assert.ok(looksLike("audio", Buffer.from("ID3\x04\x00", "latin1")));
  assert.ok(looksLike("audio", Buffer.from([0xff, 0xfb, 0x90, 0x00])));
  assert.ok(!looksLike("audio", Buffer.from("RIFF", "latin1")));
});
