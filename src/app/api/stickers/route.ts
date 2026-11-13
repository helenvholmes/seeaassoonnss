import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { listStickers } from "@/lib/media";

export const GET = handle(async (request: Request) => {
  await requireOwner(request);
  return NextResponse.json(await listStickers());
});
