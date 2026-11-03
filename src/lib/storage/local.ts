import "server-only";
// Development-only storage on the local disk, so the app runs without an R2 account.
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { BASE_PATH } from "../config";
import { KEY_PATTERN, type Area, type Storage } from "./index";

const ROOT = path.join(process.cwd(), ".data");

export function localPath(area: Area, key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("Bad storage key.");
  return path.join(ROOT, area, key);
}

export async function writeLocal(area: Area, key: string, body: Buffer) {
  const file = localPath(area, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body);
}

export function localStorage(): Storage {
  return {
    async createUpload(area, key, contentType) {
      return {
        url: `${BASE_PATH}/api/local-upload?area=${area}&key=${encodeURIComponent(key)}`,
        method: "PUT",
        headers: { "content-type": contentType },
      };
    },
    readPrivate: (key) => readFile(localPath("private", key)),
    async readPublicStart(key, length) {
      try {
        const handle = await open(localPath("public", key));
        try {
          const buf = Buffer.alloc(length);
          const { bytesRead } = await handle.read(buf, 0, length, 0);
          return buf.subarray(0, bytesRead);
        } finally {
          await handle.close();
        }
      } catch {
        return null;
      }
    },
    writePublic: (key, body) => writeLocal("public", key, body),
    publicBaseUrl: () => `${BASE_PATH}/local-media`,
  };
}
