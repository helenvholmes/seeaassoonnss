import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createUpload, isMediaKind, MediaError } from "@/lib/media";

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const kind = body.kind ?? "image";
  if (!isMediaKind(kind)) throw new MediaError("Unknown media kind.");
  return NextResponse.json(await createUpload(kind, String(body.contentType ?? ""), Number(body.size)));
});
