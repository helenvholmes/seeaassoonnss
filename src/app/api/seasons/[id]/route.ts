import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { refreshPublicPage } from "@/lib/revalidate";
import { deleteSeason, getSeason, renameSlug, saveDraft, SeasonError, seriesSlugs, setSortOrder } from "@/lib/seasons";

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

/** Settings that are not part of the document: the slug and the index position. */
export const PATCH = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const { id } = await params;
  const body = await readJson(request);
  if (typeof body.slug === "string") {
    const result = await renameSlug(id, body.slug.trim());
    // The other parts of its series link to this season by slug.
    const season = await getSeason(id);
    refreshPublicPage(result.oldSlug, result.slug, ...(await seriesSlugs(season?.published?.series?.name)));
    return NextResponse.json(result);
  }
  if ("sortOrder" in body && (body.sortOrder === null || typeof body.sortOrder === "number")) {
    const slug = await setSortOrder(id, body.sortOrder as number | null);
    refreshPublicPage(slug);
    return NextResponse.json({ sortOrder: body.sortOrder });
  }
  throw new SeasonError("Nothing to change.", 400);
});

export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const { id } = await params;
  const before = await getSeason(id);
  const slug = await deleteSeason(id);
  if (!slug) throw new SeasonError("Season not found.", 404);
  refreshPublicPage(slug, ...(await seriesSlugs(before?.status === "published" ? before.published?.series?.name : null)));
  return NextResponse.json({ ok: true });
});
