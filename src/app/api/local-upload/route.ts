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
  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith("originals/")) throw new MediaError("Bad key.");
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > MAX_UPLOAD_BYTES) throw new MediaError("File too large.", 413);
  await writeLocal("private", key, body);
  return new NextResponse(null, { status: 200 });
});
