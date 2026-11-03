import "server-only";
import { randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { sql } from "./db";
import { targetWidths } from "./widths";
import { imageKey, originalKey, storage, type UploadTarget } from "./storage";

/** HEIC is converted to JPEG in the browser before upload; GIF is not accepted. */
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export class MediaError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export async function createImageUpload(contentType: string, size: number): Promise<{ mediaId: string; upload: UploadTarget }> {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
    throw new MediaError(`File type ${contentType || "unknown"} is not accepted. Use JPEG, PNG, HEIC or WebP.`);
  }
  if (!Number.isInteger(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    throw new MediaError(`Files must be under ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);
  }
  const mediaId = randomUUID();
  const key = originalKey(mediaId);
  await sql`insert into media (id, kind, content_type, original_key) values (${mediaId}, 'image', ${contentType}, ${key})`;
  const upload = await storage().createUpload(key, contentType, size);
  return { mediaId, upload };
}

export interface ProcessedImage {
  mediaId: string;
  width: number;
  height: number;
  widths: number[];
}

/**
 * Reads the original from private storage and writes WebP copies to public storage.
 * sharp drops all metadata (EXIF, GPS, XMP) unless asked to keep it, so the public
 * files carry no location. rotate() applies the EXIF orientation first.
 */
export async function processImage(mediaId: string): Promise<ProcessedImage> {
  const [row] = await sql`select * from media where id = ${mediaId} and kind = 'image'`;
  if (!row) throw new MediaError("Upload not found.", 404);
  if (row.processed_at) return { mediaId, width: row.width, height: row.height, widths: row.widths };

  const store = storage();
  let original: Buffer;
  try {
    original = await store.readPrivate(row.original_key);
  } catch {
    throw new MediaError("The upload did not arrive. Try again.", 409);
  }

  let meta: Metadata;
  try {
    meta = await sharp(original).metadata();
  } catch {
    throw new MediaError("This file is not an image sharp can read.");
  }
  if (!meta.format || !["jpeg", "png", "webp"].includes(meta.format)) {
    throw new MediaError(`Image format ${meta.format ?? "unknown"} is not accepted.`);
  }
  const rotated = (meta.orientation ?? 1) >= 5;
  const width = rotated ? meta.height! : meta.width!;
  const height = rotated ? meta.width! : meta.height!;
  const widths = targetWidths(width);

  for (const w of widths) {
    const out = await sharp(original).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    await store.writePublic(imageKey(mediaId, w), out, "image/webp");
  }

  await sql`update media set width = ${width}, height = ${height}, widths = ${widths}, processed_at = now() where id = ${mediaId}`;
  return { mediaId, width, height, widths };
}
