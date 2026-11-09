// Serves p5.js from this app, so sketch backgrounds need no CDN. The URL carries
// the p5 version (see lib/sketch-frame.ts), so the file can be cached for good.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { IMMUTABLE } from "@/lib/storage";

const FILES: Record<string, string> = { "p5.min.js": "node_modules/p5/lib/p5.min.js" };

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const file = FILES[(await params).file];
  if (!file) return new Response(null, { status: 404 });
  const body = await readFile(path.join(process.cwd(), file));
  return new Response(new Uint8Array(body), {
    headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": IMMUTABLE, "access-control-allow-origin": "*" },
  });
}
