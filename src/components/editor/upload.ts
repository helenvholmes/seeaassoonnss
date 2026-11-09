// Browser upload pipeline: prepare the file, upload it, ask the server to finish it.
import { api } from "@/lib/client";
import { compressVideo, encodeMp3 } from "./media-browser";

export interface UploadedImage {
  mediaId: string;
  width: number;
  height: number;
  widths: number[];
}

export interface StickerEntry extends UploadedImage {
  id: string;
  name: string;
}

type Kind = "image" | "sticker" | "video" | "audio" | "model";

const DIRECT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const STICKER_TYPES = new Set(["image/png", "image/webp", "image/svg+xml"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

function isHeic(file: File) {
  return /^image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

export function isAcceptedImage(file: File) {
  return DIRECT_TYPES.has(file.type) || isHeic(file);
}
export function isAcceptedVideo(file: File) {
  return VIDEO_TYPES.has(file.type) || /\.(mp4|mov|webm|m4v)$/i.test(file.name);
}
export function isAcceptedSticker(file: File) {
  return STICKER_TYPES.has(file.type) || /\.svg$/i.test(file.name);
}
export function isAudio(file: File) {
  return file.type.startsWith("audio/") || /\.(mp3|m4a|wav|aac|ogg|opus|webm)$/i.test(file.name);
}

export function rejectionReason(file: File): string {
  if (file.type === "image/gif" || /\.gif$/i.test(file.name)) return `${file.name}: GIF is not accepted. Upload the video instead.`;
  return `${file.name}: use JPEG, PNG, HEIC or WebP photos, or MP4, MOV or WebM video.`;
}

/** HEIC becomes JPEG here, because the server's image library usually cannot read HEIC. */
async function toUploadable(file: File): Promise<Blob> {
  if (DIRECT_TYPES.has(file.type)) return file;
  if (!isHeic(file)) throw new Error(rejectionReason(file));
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(out) ? out[0] : out;
}

async function put(kind: Kind, blob: Blob, contentType: string): Promise<string> {
  const { mediaId, upload } = await api<{ mediaId: string; upload: { url: string; method: string; headers: Record<string, string> } }>(
    "/media/upload-url",
    { body: { kind, contentType, size: blob.size } },
  );
  let res: Response;
  try {
    res = await fetch(upload.url, { method: upload.method, headers: upload.headers, body: blob, credentials: "same-origin" });
  } catch {
    // The browser hides the reason ("NetworkError", "Failed to fetch"). By far the usual one: the bucket's CORS rule.
    throw new Error(`storage refused the upload. Add ${location.origin} to AllowedOrigins in the CORS rule of both R2 buckets (README, step 2), or check your connection.`);
  }
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status}).`);
  return mediaId;
}

export async function uploadImageBlob(blob: Blob): Promise<UploadedImage> {
  const mediaId = await put("image", blob, blob.type || "image/jpeg");
  return api<UploadedImage>("/media/process", { body: { mediaId, kind: "image" } });
}

export async function uploadImage(file: File): Promise<UploadedImage> {
  return uploadImageBlob(await toUploadable(file));
}

export async function uploadSticker(file: File): Promise<StickerEntry> {
  const type = file.type || (/\.svg$/i.test(file.name) ? "image/svg+xml" : "");
  if (!STICKER_TYPES.has(type)) throw new Error(`${file.name}: stickers must be PNG, WebP or SVG.`);
  const mediaId = await put("sticker", file, type);
  return api<StickerEntry>("/media/process", { body: { mediaId, kind: "sticker", name: file.name.replace(/\.[^.]+$/, "") } });
}

export interface UploadedVideo {
  mediaId: string;
  poster: UploadedImage;
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

export async function uploadVideo(file: File, onProgress: (fraction: number) => void): Promise<UploadedVideo> {
  const v = await compressVideo(file, (p) => onProgress(p * 0.85));
  const poster = await uploadImageBlob(v.poster);
  onProgress(0.9);
  const mediaId = await put("video", v.video, "video/mp4");
  await api("/media/process", { body: { mediaId, kind: "video", duration: v.duration } });
  onProgress(1);
  return { mediaId, poster, width: v.width, height: v.height, duration: v.duration, hasAudio: v.hasAudio };
}

export interface UploadedAudio {
  mediaId: string;
  duration: number;
  waveform: number[];
}

export async function uploadAudio(blob: Blob): Promise<UploadedAudio> {
  const a = await encodeMp3(blob);
  const mediaId = await put("audio", a.mp3, "audio/mpeg");
  await api("/media/process", { body: { mediaId, kind: "audio", duration: a.duration } });
  return { mediaId, duration: a.duration, waveform: a.waveform };
}

export function isModelFile(file: File) {
  return /\.glb$/i.test(file.name) || file.type === "model/gltf-binary";
}

export interface ModelStats {
  bytes: number;
  vertices: number;
  textures: number;
  largestTexture: number;
  animations: number;
}

export interface UploadedModel {
  mediaId: string;
  bytes: number;
  before: ModelStats;
  after: ModelStats;
  hasAnimation: boolean;
  warnings: string[];
}

/** Uploads a .glb; the server compresses it (textures to WebP at `textureSize` px, geometry with meshopt). */
export async function uploadModel(file: File, textureSize: 1024 | 2048): Promise<UploadedModel> {
  if (!isModelFile(file)) throw new Error(`${file.name}: 3D models must be glTF binary files (.glb).`);
  const mediaId = await put("model", file, "model/gltf-binary");
  return api<UploadedModel>("/media/process", { body: { mediaId, kind: "model", textureSize } });
}

export function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** A one-line report of what compression did, for the editor. */
export function modelReport(m: UploadedModel): string {
  const tex = m.after.textures ? `, textures up to ${m.after.largestTexture} px (were ${m.before.largestTexture} px)` : "";
  return `${formatBytes(m.before.bytes)} → ${formatBytes(m.after.bytes)}${tex}, ${m.after.vertices.toLocaleString("en")} vertices`;
}
