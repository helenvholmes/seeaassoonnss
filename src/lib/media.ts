import "server-only";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata, type Sharp } from "sharp";
import { sql } from "./db";
import { audioKey, imageKey, modelKey, originalKey, storage, videoKey, type Area, type UploadTarget } from "./storage";
import { compressModel, ModelError, type ModelStats, type TextureSize } from "./gltf";
import { looksLike } from "./magic";
import { targetWidths } from "./widths";

export type MediaKind = "image" | "sticker" | "video" | "audio" | "model";

/**
 * What each kind accepts. HEIC is converted to JPEG, video compressed to MP4 and
 * audio encoded to MP3 in the browser before upload; GIF is not accepted.
 * Images and stickers go to private storage and are processed on the server;
 * video and audio are already in their final form and go straight to public storage.
 */
const KINDS: Record<MediaKind, { types: string[]; maxBytes: number; area: Area; label: string }> = {
  image: { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 30 * 1024 * 1024, area: "private", label: "JPEG, PNG, HEIC or WebP" },
  sticker: { types: ["image/png", "image/webp", "image/svg+xml"], maxBytes: 10 * 1024 * 1024, area: "private", label: "PNG, WebP or SVG" },
  video: { types: ["video/mp4"], maxBytes: 80 * 1024 * 1024, area: "public", label: "MP4 (compressed in the browser)" },
  audio: { types: ["audio/mpeg"], maxBytes: 20 * 1024 * 1024, area: "public", label: "MP3 (encoded in the browser)" },
  // Browsers often give .glb files no type, or a generic one.
  model: { types: ["model/gltf-binary", "application/octet-stream"], maxBytes: 50 * 1024 * 1024, area: "private", label: "glTF binary (.glb)" },
};

export const MAX_UPLOAD_BYTES = Math.max(...Object.values(KINDS).map((k) => k.maxBytes));

export class MediaError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && value in KINDS;
}

function uploadKey(kind: MediaKind, mediaId: string) {
  return kind === "video" ? videoKey(mediaId) : kind === "audio" ? audioKey(mediaId) : originalKey(mediaId);
}

export async function createUpload(kind: MediaKind, contentType: string, size: number): Promise<{ mediaId: string; upload: UploadTarget }> {
  const rules = KINDS[kind];
  if (!rules.types.includes(contentType)) {
    throw new MediaError(`File type ${contentType || "unknown"} is not accepted here. Use ${rules.label}.`);
  }
  if (!Number.isInteger(size) || size <= 0 || size > rules.maxBytes) {
    throw new MediaError(`Files must be under ${rules.maxBytes / 1024 / 1024} MB.`);
  }
  const mediaId = randomUUID();
  const key = uploadKey(kind, mediaId);
  await sql`insert into media (id, kind, content_type, original_key, size_bytes) values (${mediaId}, ${kind}, ${contentType}, ${key}, ${size})`;
  const upload = await storage().createUpload(rules.area, key, contentType, size);
  return { mediaId, upload };
}

export interface ProcessedImage {
  mediaId: string;
  width: number;
  height: number;
  widths: number[];
}

export interface StickerEntry extends ProcessedImage {
  id: string;
  name: string;
}

export interface ProcessedTimed {
  mediaId: string;
  duration: number;
}

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

async function loadRow(mediaId: string, kind: MediaKind) {
  const [row] = await sql`select * from media where id = ${mediaId} and kind = ${kind}`;
  if (!row) throw new MediaError("Upload not found.", 404);
  return row;
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

/** Video and audio arrive in final form; check they are what they claim and record them. */
export async function finishTimed(mediaId: string, kind: "video" | "audio", duration: number): Promise<ProcessedTimed> {
  const row = await loadRow(mediaId, kind);
  if (row.processed_at) return { mediaId, duration: row.duration };
  const head = await storage().readPublicStart(row.original_key as string, 16);
  if (!head) throw new MediaError("The upload did not arrive. Try again.", 409);
  if (!looksLike(kind, head)) throw new MediaError(kind === "video" ? "This is not an MP4 file." : "This is not an MP3 file.");
  const d = Number.isFinite(duration) && duration >= 0 ? Math.min(duration, 24 * 3600) : 0;
  await sql`update media set duration = ${d}, processed_at = now() where id = ${mediaId}`;
  return { mediaId, duration: d };
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

export async function listStickers(): Promise<StickerEntry[]> {
  const rows = await sql`select id, media_id, name, width, height, widths from stickers order by created_at desc`;
  return rows.map((r) => ({ id: r.id, mediaId: r.media_id, name: r.name, width: r.width, height: r.height, widths: r.widths }));
}

/** Removes a sticker from the library. Seasons that use it keep working: items hold their own copy of the media reference. */
export async function deleteSticker(id: string): Promise<void> {
  const [row] = await sql`delete from stickers where id = ${id} returning id`;
  if (!row) throw new MediaError("Sticker not found.", 404);
}
