// Development only: receives uploads when STORAGE_DRIVER=local.
import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { MAX_UPLOAD_BYTES, MediaError } from "@/lib/media";
import { writeLocal } from "@/lib/storage/local";

export const PUT = handle(async (request: Request) => {
  if (config.storageDriver !== "local") return new NextResponse(null, { status: 404 });
  await requireOwner(request);
  const params = new URL(request.url).searchParams;
  const key = params.get("key") ?? "";
  const area = params.get("area");
  // Browsers upload originals to private storage, and finished video/audio to public storage.
  const ok = area === "private" ? key.startsWith("originals/") : area === "public" ? /\/(video\.mp4|audio\.mp3)$/.test(key) : false;
  if (!ok) throw new MediaError("Bad key.");
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_UPLOAD_BYTES) throw new MediaError("File too large.", 413);
  await writeLocal(area as "private" | "public", key, body);
  return new NextResponse(null, { status: 200 });
});
