import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createSketch, listSketches } from "@/lib/sketches";

export const GET = handle(async (request: Request) => {
  await requireOwner(request);
  return NextResponse.json(await listSketches());
});

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  return NextResponse.json(await createSketch(body.name, body.code));
});
