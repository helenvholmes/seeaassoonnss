import "server-only";
// The demo season: placeholder photos, a 3D pear, a type effect, cursor follow and
// a p5.js sketch background, plus example sketches in the sketch library. Used by
// "Create demo season" in the editor and by `npm run seed`. Everything is drawn or
// built here, so the repository ships no photos or model files.
import { randomUUID } from "node:crypto";
import { Document, NodeIO } from "@gltf-transform/core";
import sharp from "sharp";
import { addItem, scaledMobileLayout } from "../components/editor/ops";
import { DEMO_SKETCHES } from "./demo-sketches";
import { sql } from "./db";
import { processImage, processModel } from "./media";
import { emptySeasonDoc, type Item, type Placement, type SeasonDoc } from "./schema";
import { createSeason, deleteSeason, renameSlug, saveDraft } from "./seasons";
import { originalKey, storage } from "./storage";

export const DEMO_SLUG = "demo";

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

/**
 * A pear, built here as a lathe (a profile turned around the vertical axis) with a
 * stem, so the repository ships no model files. Returns a .glb.
 */
async function pearGlb(): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const segments = 48;
  // Radius along the height (0 = bottom, 1 = top): wide below, narrowing to the stem.
  const profile = (t: number) => Math.max(0.0001, 0.3 * Math.sin(Math.PI * t) ** 0.6 * (1 + 0.55 * Math.cos(Math.PI * t)));
  function lathe(name: string, rings: number, radius: (t: number) => number, y0: number, h: number, color: [number, number, number, number], roughness: number) {
    const pos: number[] = [];
    const idx: number[] = [];
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      for (let s = 0; s <= segments; s++) {
        const a = (s / segments) * Math.PI * 2;
        pos.push(Math.cos(a) * radius(t), y0 + t * h, Math.sin(a) * radius(t));
      }
    }
    for (let r = 0; r < rings; r++)
      for (let s = 0; s < segments; s++) {
        const a = r * (segments + 1) + s;
        const b = a + segments + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    const material = doc.createMaterial(name).setBaseColorFactor(color).setRoughnessFactor(roughness).setMetallicFactor(0);
    const prim = doc
      .createPrimitive()
      .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(idx)).setBuffer(buffer))
      .setMaterial(material);
    return doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  }
  const body = lathe("pear", 64, profile, 0, 1, [0.42, 0.5, 0.12, 1], 0.6);
  const stem = lathe("stem", 4, () => 0.025, 0.95, 0.18, [0.3, 0.22, 0.12, 1], 0.8);
  stem.setRotation([0, 0, Math.sin(0.12), Math.cos(0.12)]);
  doc.createScene().addChild(body).addChild(stem);
  return new NodeIO().writeBinary(doc);
}

async function uploadPear() {
  const glb = Buffer.from(await pearGlb());
  const mediaId = randomUUID();
  const key = originalKey(mediaId);
  await sql`insert into media (id, kind, content_type, original_key, size_bytes) values (${mediaId}, 'model', 'model/gltf-binary', ${key}, ${glb.length})`;
  await storage().writePrivate(key, glb, "model/gltf-binary");
  return processModel(mediaId, 1024);
}

/** Adds the example sketches to the sketch library, once each (by name). */
async function seedSketches(): Promise<{ name: string; code: string; id: string }[]> {
  const out = [];
  for (const { name, code } of DEMO_SKETCHES) {
    const [existing] = await sql`select id from sketches where name = ${name}`;
    const id = existing ? existing.id : (await sql`insert into sketches (name, code) values (${name}, ${code}) returning id`)[0].id;
    out.push({ name, code, id });
  }
  return out;
}

const at = (x: number, y: number, w: number, h: number, rotation = 0): Placement => ({ x, y, w, h, rotation, z: 0, locked: false });

/**
 * Creates the demo season at /seasons/demo as a draft. If one exists, it is kept
 * (created: false) unless `replace` is set. The 3D pear gets its poster when the
 * season is first opened in the editor (posters are drawn in the browser).
 */
export async function createDemoSeason({ replace = false, log = (_: string) => {} }: { replace?: boolean; log?: (line: string) => void } = {}): Promise<{ id: string; created: boolean }> {
  const [existing] = await sql`select id from seasons where slug = ${DEMO_SLUG}`;
  if (existing) {
    if (!replace) return { id: existing.id as string, created: false };
    await deleteSeason(existing.id);
    log("removed the old demo season");
  }

  log("drawing and uploading 3 placeholder photos…");
  const photos: ((typeof PLACEHOLDERS)[number] & { image: Awaited<ReturnType<typeof processImage>> })[] = [];
  for (const p of PLACEHOLDERS) photos.push({ ...p, image: await uploadPlaceholder(p) });

  log("building and compressing a 3D pear…");
  const pear = await uploadPear();
  const sketches = await seedSketches();
  log(`sketch library: ${sketches.map((s) => s.name).join(", ")}`);
  const leaves = sketches.find((s) => s.name === "drifting leaves") ?? sketches[0];

  const season = await createSeason("demo season");
  await renameSlug(season.id, DEMO_SLUG);

  let doc: SeasonDoc = {
    ...emptySeasonDoc("demo season"),
    subtitle: "placeholder items to *try the editor with*",
    period: "any time",
    desktopHeight: 1500,
    backgroundLayer: leaves ? { kind: "sketch" as const, sketchId: leaves.id, name: leaves.name, code: leaves.code } : null,
  };
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
      ...quote("move the cursor through these letters", at(170, 1000, 420, 120), 34, "serif"),
      content: { markdown: "move the cursor through these letters", source: "", font: "serif", size: 34, align: "left", color: "#1d1d1b", binding: null, effect: "repel" },
    } as Item,
    {
      id: randomUUID(),
      type: "model_3d",
      desktop: at(700, 1080, 300, 340),
      mobile: null,
      follow: 0.5,
      content: {
        mediaId: pear.mediaId,
        posterMediaId: null,
        posterWidths: [],
        bytes: pear.bytes,
        scale: 1,
        rotation: [10, 0, 0],
        spin: 12,
        follow: true,
        animate: false,
        hasAnimation: false,
        alt: "Placeholder: a 3D pear that turns toward the cursor",
      },
    },
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
  return { id: season.id, created: true };
}
