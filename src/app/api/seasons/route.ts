import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createSeason, listSeasons } from "@/lib/seasons";

export const GET = handle(async (request: Request) => {
  await requireOwner(request);
  return NextResponse.json(await listSeasons());
});

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const season = await createSeason(typeof body.title === "string" ? body.title.slice(0, 200) : "");
  return NextResponse.json({ id: season.id, slug: season.slug }, { status: 201 });
});
