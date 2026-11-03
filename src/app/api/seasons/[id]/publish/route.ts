import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { refreshPublicPage } from "@/lib/revalidate";
import { publishSeason, unpublishSeason } from "@/lib/seasons";

type Ctx = { params: Promise<{ id: string }> };

/** Publish: copy the draft to the public snapshot and refresh that page. */
export const POST = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const season = await publishSeason((await params).id);
  refreshPublicPage(season.slug);
  return NextResponse.json({ status: season.status, publishedAt: season.publishedAt });
});

/** Unpublish: the page returns 404 again. The snapshot is kept. */
export const DELETE = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const season = await unpublishSeason((await params).id);
  refreshPublicPage(season.slug);
  return NextResponse.json({ status: season.status });
});
