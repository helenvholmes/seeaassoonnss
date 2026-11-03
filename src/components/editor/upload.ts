// Browser upload pipeline: convert HEIC, upload the original, ask the server to make sizes.
import { api } from "@/lib/client";

export interface UploadedImage {
  mediaId: string;
  width: number;
  height: number;
  widths: number[];
}

const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function isHeic(file: File) {
  return /^image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function isAcceptedImage(file: File) {
  return DIRECT_TYPES.has(file.type) || isHeic(file);
}

/** HEIC becomes JPEG here, because the server's image library usually cannot read HEIC. */
async function toUploadable(file: File): Promise<Blob> {
  if (DIRECT_TYPES.has(file.type)) return file;
  if (!isHeic(file)) throw new Error(`${file.name}: use JPEG, PNG, HEIC or WebP${file.type === "image/gif" ? " (GIF is not accepted)" : ""}.`);
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  const blob = await toUploadable(file);
  const contentType = blob.type || "image/jpeg";
  const { mediaId, upload } = await api<{ mediaId: string; upload: { url: string; method: string; headers: Record<string, string> } }>(
    "/media/upload-url",
    { body: { contentType, size: blob.size } },
  );
  const put = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: blob, credentials: "same-origin" });
  if (!put.ok) throw new Error(`${file.name}: upload failed (HTTP ${put.status}).`);
  return api<UploadedImage>("/media/process", { body: { mediaId } });
}
