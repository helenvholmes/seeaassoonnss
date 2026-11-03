// npm run seed: creates one demo season ("/seasons/demo") with placeholder items,
// as a draft. Open it in the editor to try things, then publish or delete it.
// Uses the same database and storage as the app (reads .env.local / .env).
//
//   npm run seed            create the demo season
//   npm run seed -- --force replace an existing demo season
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { scaledMobileLayout, addItem } from "../src/components/editor/ops";
import { config } from "../src/lib/config";
import { sql } from "../src/lib/db";
import { processImage } from "../src/lib/media";
import { emptySeasonDoc, type Item, type Placement } from "../src/lib/schema";
import { createSeason, deleteSeason, renameSlug, saveDraft } from "../src/lib/seasons";
import { originalKey, storage } from "../src/lib/storage";

const SLUG = "demo";
const force = process.argv.includes("--force");

/** Simple flat-lay placeholders, drawn here so the repository ships no photos. */
const PLACEHOLDERS = [
  {
    name: "leaf",
    alt: "Placeholder: a pale green leaf on a white background",
    width: 1600,
    height: 2000,
    svg: `<rect width="1600" height="2000" fill="#f4f4f0"/><path d="M800 260 C1240 560 1240 1300 800 1740 C360 1300 360 560 800 260Z" fill="#9fbf8a"/><path d="M800 360 V1720" stroke="#6f8f5c" stroke-width="18" fill="none"/>`,
  },
  {
    name: "pear",
    alt: "Placeholder: a yellow-green pear on a pale grey background",
    width: 1600,
    height: 2000,
    svg: `<rect width="1600" height="2000" fill="#ecece8"/><circle cx="800" cy="1260" r="420" fill="#c9cf7a"/><circle cx="800" cy="820" r="250" fill="#c9cf7a"/><path d="M800 580 C810 480 850 420 900 380" stroke="#6b5a3a" stroke-width="22" fill="none" stroke-linecap="round"/>`,
  },
  {
    name: "envelope",
    alt: "Placeholder: a red envelope on a white background",
    width: 1600,
    height: 1200,
    svg: `<rect width="1600" height="1200" fill="#f7f7f4"/><rect x="260" y="260" width="1080" height="680" fill="#c63d32"/><path d="M260 260 L800 640 L1340 260" stroke="#a12f26" stroke-width="16" fill="none"/>`,
  },
];

async function uploadPlaceholder(p: (typeof PLACEHOLDERS)[number]) {
  const jpeg = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.width}" height="${p.height}">${p.svg}</svg>`))
    .jpeg({ quality: 88 })
    .toBuffer();
  const mediaId = randomUUID();
  const key = originalKey(mediaId);
  await sql`insert into media (id, kind, content_type, original_key, size_bytes) values (${mediaId}, 'image', 'image/jpeg', ${key}, ${jpeg.length})`;
  await storage().writePrivate(key, jpeg, "image/jpeg");
  return processImage(mediaId);
}

const at = (x: number, y: number, w: number, h: number, rotation = 0): Placement => ({ x, y, w, h, rotation, z: 0, locked: false });

async function main() {
  console.log(`database: ${new URL(config.databaseUrl).host}`);
  console.log(`storage:  ${config.storageDriver}`);

  const [existing] = await sql`select id from seasons where slug = ${SLUG}`;
  if (existing) {
    if (!force) {
      console.log(`A season at /seasons/${SLUG} already exists. Run "npm run seed -- --force" to replace it.`);
      return;
    }
    await deleteSeason(existing.id);
    console.log("removed the old demo season");
  }

  console.log("drawing and uploading 3 placeholder photos…");
  const photos: ((typeof PLACEHOLDERS)[number] & { image: Awaited<ReturnType<typeof processImage>> })[] = [];
  for (const p of PLACEHOLDERS) photos.push({ ...p, image: await uploadPlaceholder(p) });

  const season = await createSeason("demo season");
  await renameSlug(season.id, SLUG);

  let doc = { ...emptySeasonDoc("demo season"), subtitle: "placeholder items to *try the editor with*", period: "any time", desktopHeight: 1500 };
  const quote = (markdown: string, placement: Placement, size: number, font: "serif" | "mono" | "sans", binding: "title" | "subtitle" | null = null): Item => ({
    id: randomUUID(),
    type: "quote",
    desktop: placement,
    mobile: null,
    content: { markdown, source: "", font, size, align: "left", color: "#1d1d1b", binding },
  });
  const photo = (i: number, placement: Placement): Item => {
    const { image, alt } = photos[i];
    return {
      id: randomUUID(),
      type: "photo",
      desktop: placement,
      mobile: null,
      content: { mediaId: image.mediaId, width: image.width, height: image.height, widths: image.widths, alt, fit: "cover" },
    };
  };

  const items: Item[] = [
    quote("", at(120, 110, 820, 110), 72, "serif", "title"),
    quote("", at(124, 225, 620, 60), 26, "serif", "subtitle"),
    photo(1, at(170, 380, 380, 475, -3)),
    photo(0, at(760, 120, 420, 525, 4)),
    photo(2, at(600, 730, 380, 285, 8)),
    quote(
      "Replace these placeholders with your own photos.\nDrag, rotate, resize, then **lock**.",
      at(1030, 760, 300, 150),
      17,
      "mono",
    ),
    {
      id: randomUUID(),
      type: "map",
      desktop: at(1070, 1040, 240, 240, -2),
      mobile: null,
      content: { lat: 51.4769, lon: -0.0005, zoom: 2, label: "somewhere", borders: false },
    },
  ];
  for (const item of items) doc = addItem(doc, item);
  doc = scaledMobileLayout({ ...doc, coverItemId: items[3].id });

  await saveDraft(season.id, season.version, doc);
  const editor = new URL(`/seasons/edit/${season.id}`, config.siteUrl);
  console.log(`\ncreated the demo season as a draft.\nopen it in the editor: ${editor}\npublish it there to see /seasons/${SLUG}, or delete it from the season settings.`);
}

main()
  .catch((e) => {
    console.error(`\nseed failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
