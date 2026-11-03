// Development only: serves processed images when STORAGE_DRIVER=local.
import { readFile } from "node:fs/promises";
import { config } from "@/lib/config";
import { localPath } from "@/lib/storage/local";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (config.storageDriver !== "local") return new Response(null, { status: 404 });
  try {
    const file = await readFile(localPath("public", (await params).key.join("/")));
    return new Response(new Uint8Array(file), { headers: { "content-type": "image/webp", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
