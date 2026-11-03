import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { refreshPublicPage } from "@/lib/revalidate";
import { deleteSeason, getSeason, renameSlug, saveDraft, SeasonError } from "@/lib/seasons";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const season = await getSeason((await params).id);
  if (!season) throw new SeasonError("Season not found.", 404);
  return NextResponse.json(season);
});

/** Autosave of the draft. Never changes the public page. */
export const PUT = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body.version !== "number") throw new SeasonError("Missing version.", 400);
  return NextResponse.json(await saveDraft(id, body.version, body.doc));
});

/** Settings that are not part of the document: the slug. */
export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body.slug !== "string") throw new SeasonError("Nothing to change.", 400);
  const result = await renameSlug(id, body.slug.trim());
  refreshPublicPage(result.oldSlug, result.slug);
  return NextResponse.json(result);
});

export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const slug = await deleteSeason((await params).id);
  if (!slug) throw new SeasonError("Season not found.", 404);
  refreshPublicPage(slug);
  return NextResponse.json({ ok: true });
});
