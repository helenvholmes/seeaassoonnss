import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const packs = JSON.parse(readFileSync(new URL("../src/lib/sticker-packs.json", import.meta.url), "utf8")) as {
  id: string;
  name: string;
  credit: string;
  license: string;
  items: { id: string; file: string; name: string; alt: string }[];
}[];

test("every pack sticker has its file, a thumbnail, a name and alt text", () => {
  assert.ok(packs.length >= 4);
  for (const pack of packs) {
    assert.ok(pack.credit && pack.license, `${pack.id} is credited`);
    const ids = new Set<string>();
    for (const item of pack.items) {
      assert.ok(!ids.has(item.id), `${pack.id}/${item.id} is unique`);
      ids.add(item.id);
      assert.match(item.file, /^[a-z0-9-]+\.(svg|webp)$/);
      assert.ok(existsSync(new URL(`../public/sticker-packs/${pack.id}/${item.file}`, import.meta.url)), `${pack.id}/${item.file}`);
      assert.ok(existsSync(new URL(`../public/sticker-packs/${pack.id}/thumbs/${item.id}.webp`, import.meta.url)), `${pack.id} thumb ${item.id}`);
      assert.ok(item.name && item.alt, `${pack.id}/${item.id} has a name and alt text`);
    }
  }
});

test("pack SVGs carry no scripts", () => {
  for (const pack of packs)
    for (const item of pack.items.filter((i) => i.file.endsWith(".svg"))) {
      const svg = readFileSync(new URL(`../public/sticker-packs/${pack.id}/${item.file}`, import.meta.url), "utf8");
      assert.doesNotMatch(svg, /<script|on[a-z]+=|javascript:/i, `${pack.id}/${item.file}`);
    }
});
