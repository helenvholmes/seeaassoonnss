import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { refreshPublicPage } from "@/lib/revalidate";
import { getSeason, publishSeason, seriesSlugs, unpublishSeason } from "@/lib/seasons";

type Ctx = { params: Promise<{ id: string }> };

/** Publish: copy the draft to the public snapshot and refresh that page, and the other parts of its series (old and new). */
export const POST = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const { id } = await params;
  const before = await getSeason(id);
  const season = await publishSeason(id);
  refreshPublicPage(season.slug, ...(await seriesSlugs(before?.published?.series?.name, season.published?.series?.name)));
  return NextResponse.json({ status: season.status, publishedAt: season.publishedAt });
});

/** Unpublish: the page returns 404 again. The snapshot is kept. */
export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const season = await unpublishSeason((await params).id);
  refreshPublicPage(season.slug, ...(await seriesSlugs(season.published?.series?.name)));
  return NextResponse.json({ status: season.status });
});
