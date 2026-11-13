import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { finishTimed, isMediaKind, MediaError, processImage, processModel, processSticker } from "@/lib/media";
import { isUuid } from "@/lib/seasons";

export const maxDuration = 60;

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const mediaId = String(body.mediaId ?? "");
  const kind = body.kind ?? "image";
  if (!isUuid(mediaId)) throw new MediaError("Bad media id.");
  if (!isMediaKind(kind)) throw new MediaError("Unknown media kind.");
  switch (kind) {
    case "image":
      return NextResponse.json(await processImage(mediaId));
    case "sticker":
      return NextResponse.json(await processSticker(mediaId, typeof body.name === "string" ? body.name : ""));
    case "model":
      return NextResponse.json(await processModel(mediaId, body.textureSize === 1024 ? 1024 : 2048));
    case "video":
    case "audio":
      return NextResponse.json(await finishTimed(mediaId, kind, Number(body.duration)));
  }
});
