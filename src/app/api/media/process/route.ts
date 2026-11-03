import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { MediaError, processImage } from "@/lib/media";
import { isUuid } from "@/lib/seasons";

export const maxDuration = 60;

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const mediaId = String(body.mediaId ?? "");
  if (!isUuid(mediaId)) throw new MediaError("Bad media id.");
  return NextResponse.json(await processImage(mediaId));
});
