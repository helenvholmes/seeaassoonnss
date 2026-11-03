import "server-only";
// Development-only storage on the local disk, so the app runs without an R2 account.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BASE_PATH } from "../config";
import type { Storage } from "./index";

const ROOT = path.join(process.cwd(), ".data");

export function localPath(area: "private" | "public", key: string): string {
  if (!/^[a-z]+\/[0-9a-f-]{36}(\/\d+\.webp)?$/.test(key)) throw new Error("Bad storage key.");
  return path.join(ROOT, area, key);
}

export async function writeLocal(area: "private" | "public", key: string, body: Buffer) {
  const file = localPath(area, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export function localStorage(): Storage {
  return {
    async createUpload(key, contentType) {
      return {
        url: `${BASE_PATH}/api/local-upload?key=${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": contentType },
      };
    },
    readPrivate: (key) => readFile(localPath("private", key)),
    writePublic: (key, body) => writeLocal("public", key, body),
    publicBaseUrl: () => `${BASE_PATH}/local-media`,
  };
}
