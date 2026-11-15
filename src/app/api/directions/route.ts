import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { DirectionsError, drivingPath } from "@/lib/directions";
import { ROUTE_MAX_LINE_POINTS, ROUTE_MAX_STOPS } from "@/lib/schema";
import { thin } from "@/lib/route";

export const maxDuration = 60;

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const stops = (Array.isArray(body.stops) ? body.stops : [])
    .map((s) => [Number((s as { lon?: unknown }).lon), Number((s as { lat?: unknown }).lat)] as [number, number])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat) && Math.abs(lon) <= 180 && Math.abs(lat) <= 85);
  if (stops.length < 2) return NextResponse.json({ error: "A route needs at least two stops to follow roads." }, { status: 400 });
  if (stops.length > ROUTE_MAX_STOPS) return NextResponse.json({ error: `At most ${ROUTE_MAX_STOPS} stops.` }, { status: 400 });
  try {
    const line = await drivingPath(stops, `seeaassoonnss (self-hosted; ${config.sourceUrl})`);
    return NextResponse.json({ line: thin(line, ROUTE_MAX_LINE_POINTS) });
  } catch (e) {
    if (e instanceof DirectionsError) return NextResponse.json({ error: e.message }, { status: 502 });
    throw e;
  }
});
