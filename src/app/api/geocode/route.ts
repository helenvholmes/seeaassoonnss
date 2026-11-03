import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { GeoError, searchPlaces } from "@/lib/geo";

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  try {
    const places = await searchPlaces(String(body.q ?? ""), `Seasons (self-hosted; ${config.sourceUrl})`);
    return NextResponse.json(places);
  } catch (e) {
    if (e instanceof GeoError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
});
