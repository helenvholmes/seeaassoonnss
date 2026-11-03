import "server-only";
import { config } from "../config";
import { localStorage } from "./local";
import { r2Storage } from "./r2";

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

export interface Storage {
  /** A URL the browser can PUT the original file to, valid for a few minutes. */
  createUpload(key: string, contentType: string, size: number): Promise<UploadTarget>;
  readPrivate(key: string): Promise<Buffer>;
  writePublic(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Base URL for public files; a file's URL is `${base}/${key}`. */
  publicBaseUrl(): string;
}

export function storage(): Storage {
  return config.storageDriver === "r2" ? r2Storage() : localStorage();
}

export const originalKey = (mediaId: string) => `originals/${mediaId}`;
export const imageKey = (mediaId: string, width: number) => `media/${mediaId}/${width}.webp`;
