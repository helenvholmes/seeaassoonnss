import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { fetchSpotify } from "@/lib/spotify";

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  return NextResponse.json(await fetchSpotify(String(body.url ?? "")));
});
