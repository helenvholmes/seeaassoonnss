import "server-only";
// Image and model processing. Kept apart from lib/media.ts so that only the routes
// that process uploads bundle sharp and the glTF tools: every other API route
// imports lib/media.ts (through lib/api.ts) and would otherwise ship them too,
// tens of megabytes per function in every deployment.
import sharp, { type Metadata, type Sharp } from "sharp";
import { sql } from "./db";
import { imageKey, modelKey, storage } from "./storage";
import { compressModel, ModelError, type ModelStats, type TextureSize } from "./gltf";
import { loadRow, MediaError, type ProcessedImage, type StickerEntry } from "./media";
import { targetWidths } from "./widths";

/**
 * Reads the original from private storage and writes WebP copies to public storage.
 * sharp drops all metadata (EXIF, GPS, XMP) unless asked to keep it, so the public
 * files carry no location. rotate() applies the EXIF orientation first. WebP keeps
 * transparency, which stickers need.
 */
async function processImageRow(row: Record<string, unknown>, formats: string[]): Promise<ProcessedImage> {
  const mediaId = row.id as string;
  const store = storage();
  let original: Buffer;
  try {
    original = await store.readPrivate(row.original_key as string);
  } catch {
    throw new MediaError("The upload did not arrive. Try again.", 409);
  }
  let meta: Metadata;
  try {
    meta = await sharp(original).metadata();
  } catch {
    throw new MediaError("This file is not an image that can be read.");
  }
  if (!meta.format || !formats.includes(meta.format)) {
    throw new MediaError(`Image format ${meta.format ?? "unknown"} is not accepted.`);
  }

  // SVG has no pixel size of its own: render it large enough for the biggest width.
  let input = (): Sharp => sharp(original);
  if (meta.format === "svg") {
    // Long side about 2048 px (72 dpi is 1 px per SVG unit).
    const longSide = Math.max(1, meta.width ?? 512, meta.height ?? 512);
    const density = Math.min(5000, Math.max(72, (72 * 2048) / longSide));
    input = () => sharp(original, { density });
    meta = await input().metadata();
  }

  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height! : meta.width!;
  const height = rotated ? meta.width! : meta.height!;
  const widths = targetWidths(width);
  for (const w of widths) {
    const out = await input().rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
    await store.writePublic(imageKey(mediaId, w), out, "image/webp");
  }
  await sql`update media set width = ${width}, height = ${height}, widths = ${widths}, processed_at = now() where id = ${mediaId}`;
  return { mediaId, width, height, widths };
}

export async function processImage(mediaId: string): Promise<ProcessedImage> {
  const row = await loadRow(mediaId, "image");
  if (row.processed_at) return { mediaId, width: row.width, height: row.height, widths: row.widths };
  return processImageRow(row, ["jpeg", "png", "webp"]);
}

/** Processes a sticker upload and adds it to the sticker library. */
export async function processSticker(mediaId: string, name: string): Promise<StickerEntry> {
  const row = await loadRow(mediaId, "sticker");
  const image = row.processed_at
    ? { mediaId, width: row.width, height: row.height, widths: row.widths }
    : await processImageRow(row, ["png", "webp", "svg"]);
  const [sticker] = await sql`
    insert into stickers (media_id, name, width, height, widths)
    values (${mediaId}, ${name.slice(0, 200)}, ${image.width}, ${image.height}, ${image.widths})
    returning id, name`;
  return { ...image, id: sticker.id, name: sticker.name };
}

export interface ProcessedModel {
  mediaId: string;
  bytes: number;
  before: ModelStats;
  after: ModelStats;
  hasAnimation: boolean;
  warnings: string[];
}

/**
 * Compresses a .glb upload (see lib/gltf.ts) into public storage. The original
 * stays in private storage, so a model can be processed again with other settings.
 */
export async function processModel(mediaId: string, textureSize: TextureSize): Promise<ProcessedModel> {
  const row = await loadRow(mediaId, "model");
  let original: Buffer;
  try {
    original = await storage().readPrivate(row.original_key as string);
  } catch {
    throw new MediaError("The upload did not arrive. Try again.", 409);
  }
  let out;
  try {
    out = await compressModel(original, textureSize);
  } catch (e) {
    if (e instanceof ModelError) throw new MediaError(e.message);
    throw e;
  }
  await storage().writePublic(modelKey(mediaId), Buffer.from(out.glb), "model/gltf-binary");
  await sql`update media set public_bytes = ${out.after.bytes}, processed_at = now() where id = ${mediaId}`;
  return { mediaId, bytes: out.after.bytes, before: out.before, after: out.after, hasAnimation: out.after.animations > 0, warnings: out.warnings };
}
