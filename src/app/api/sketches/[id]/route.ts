import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { isUuid, SeasonError } from "@/lib/seasons";
import { deleteSketch, updateSketch } from "@/lib/sketches";

type Ctx = { params: Promise<{ id: string }> };

async function idOf(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new SeasonError("Bad sketch id.", 400);
  return id;
}

export const PUT = handle(async (request: Request, ctx: Ctx) => {
  await requireOwner(request);
  const body = await readJson(request);
  return NextResponse.json(await updateSketch(await idOf(ctx), body.name, body.code));
});

export const DELETE = handle(async (request: Request, ctx: Ctx) => {
  await requireOwner(request);
  await deleteSketch(await idOf(ctx));
  return NextResponse.json({ ok: true });
});
