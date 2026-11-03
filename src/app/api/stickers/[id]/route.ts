import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { deleteSticker, MediaError } from "@/lib/media";
import { isUuid } from "@/lib/seasons";

export const DELETE = handle(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  await requireOwner(request);
  const { id } = await params;
  if (!isUuid(id)) throw new MediaError("Bad sticker id.");
  await deleteSticker(id);
  return NextResponse.json({ ok: true });
});
