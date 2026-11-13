import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { BASE_PATH } from "@/lib/config";
import { logPageError } from "@/lib/health";
import { INDEX_TAG } from "@/lib/revalidate";
import { listPublishedSeasons } from "@/lib/seasons";

export const dynamic = "force-dynamic";

// The same cache as the index page, so Publish and Unpublish refresh both.
const cachedSeasons = unstable_cache(listPublishedSeasons, ["published-seasons"], { tags: [INDEX_TAG] });

/**
 * GET /seasons/api/latest: sends the visitor to the first season on the index
 * (pinned seasons first, then the newest). With nothing published, or if the
 * database can't be reached, it sends them to the index instead. The landing
 * page's "see a season" button links here, so the landing page itself stays static.
 */
export async function GET(request: Request) {
  let path = BASE_PATH;
  try {
    const [first] = await cachedSeasons();
    if (first) path = `${BASE_PATH}/${first.slug}`;
  } catch (e) {
    logPageError("latest season redirect", e);
  }
  return NextResponse.redirect(new URL(path, request.url), { status: 307, headers: { "cache-control": "no-store" } });
}
