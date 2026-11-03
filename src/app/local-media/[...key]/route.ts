// Development only: serves public media when STORAGE_DRIVER=local, with Range
// support so video and audio can seek (Safari requires it).
import { stat, open } from "node:fs/promises";
import { config } from "@/lib/config";
import { contentTypeForKey, IMMUTABLE } from "@/lib/storage";
import { localPath } from "@/lib/storage/local";

export async function GET(request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (config.storageDriver !== "local") return new Response(null, { status: 404 });
  const key = (await params).key.join("/");
  let file: string;
  let size: number;
  try {
    file = localPath("public", key);
    size = (await stat(file)).size;
  } catch {
    return new Response(null, { status: 404 });
  }
  const headers: Record<string, string> = { "content-type": contentTypeForKey(key), "cache-control": IMMUTABLE, "accept-ranges": "bytes" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${size}`;
  }
  const handle = await open(file);
  try {
    const buf = Buffer.alloc(end - start + 1);
    await handle.read(buf, 0, buf.length, start);
    headers["content-length"] = String(buf.length);
    return new Response(new Uint8Array(buf), { status, headers });
  } finally {
    await handle.close();
  }
}
