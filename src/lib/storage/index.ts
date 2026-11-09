import "server-only";
import { config } from "../config";
import { localStorage } from "./local";
import { r2Storage } from "./r2";

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

/** private = originals nobody else sees; public = files pages load. */
export type Area = "private" | "public";

export interface Storage {
  /** A URL the browser can PUT a file to, valid for a few minutes. */
  createUpload(area: Area, key: string, contentType: string, size: number): Promise<UploadTarget>;
  readPrivate(key: string): Promise<Buffer>;
  writePrivate(key: string, body: Buffer, contentType: string): Promise<void>;
  /** The first `length` bytes of a public file, or null if it does not exist. */
  readPublicStart(key: string, length: number): Promise<Buffer | null>;
  writePublic(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Base URL for public files; a file's URL is `${base}/${key}`. */
  publicBaseUrl(): string;
}

export function storage(): Storage {
  return config.storageDriver === "r2" ? r2Storage() : localStorage();
}

/** Files in public storage never change once written, because each key holds a fresh UUID. */
export const IMMUTABLE = "public, max-age=31536000, immutable";

export const originalKey = (mediaId: string) => `originals/${mediaId}`;
export const imageKey = (mediaId: string, width: number) => `media/${mediaId}/${width}.webp`;
export const videoKey = (mediaId: string) => `media/${mediaId}/video.mp4`;
export const audioKey = (mediaId: string) => `media/${mediaId}/audio.mp3`;
export const modelKey = (mediaId: string) => `media/${mediaId}/model.glb`;

/** Every key the app writes; anything else is refused. */
export const KEY_PATTERN = /^(originals\/[0-9a-f-]{36}|media\/[0-9a-f-]{36}\/(\d+\.webp|video\.mp4|audio\.mp3|model\.glb))$/;

export function contentTypeForKey(key: string): string {
  if (key.endsWith(".webp")) return "image/webp";
  if (key.endsWith(".mp4")) return "video/mp4";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".glb")) return "model/gltf-binary";
  return "application/octet-stream";
}
