import type { Metadata } from "next";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import { imageUrl } from "@/components/ItemContent";
import { BASE_PATH, config } from "@/lib/config";
import { INDEX_TAG } from "@/lib/revalidate";
import { listPublishedSeasons } from "@/lib/seasons";
import { absoluteUrl, coverPhoto, slashTitle } from "@/lib/share";
import { storage } from "@/lib/storage";
import { formatMonth } from "@/lib/layout";
import { logPageError } from "@/lib/health";

// Rendered per request from cached data; Publish, Unpublish, renames, pins and
// deletes refresh the cache (see lib/revalidate.ts). Nothing touches the database
// at build time, so a fresh fork builds before its database is set up.
export const dynamic = "force-dynamic";

const cachedSeasons = unstable_cache(listPublishedSeasons, ["published-seasons"], { tags: [INDEX_TAG] });

export async function generateMetadata(): Promise<Metadata> {
  try {
    const url = absoluteUrl(BASE_PATH);
    return { title: "seasons", alternates: { canonical: url }, openGraph: { title: "seasons", url, siteName: "seeaassoonnss", type: "website" } };
  } catch (e) {
    logPageError("index metadata", e);
    throw e;
  }
}

async function load() {
  try {
    return { seasons: await cachedSeasons(), mediaBase: storage().publicBaseUrl() };
  } catch (e) {
    logPageError("index page (see /seasons/api/health)", e);
    throw e;
  }
}

export default async function Index() {
  const { seasons, mediaBase } = await load();
  return (
    <main className="index-page">
      <h1 className="index-heading">// seasons</h1>
      {seasons.length === 0 ? <p className="muted">Nothing published yet.</p> : null}
      <ul className="index-grid">
        {seasons.map(({ slug, doc }) => {
          const cover = coverPhoto(doc);
          const c = cover?.content;
          return (
            <li key={slug}>
              <Link href={`/${slug}`} className="index-entry">
                <span className="index-cover">
                  {c ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl(mediaBase, c.mediaId, c.widths.find((w) => w >= 640) ?? c.widths[c.widths.length - 1])}
                      srcSet={c.widths.map((w) => `${imageUrl(mediaBase, c.mediaId, w)} ${w}w`).join(", ")}
                      sizes="(max-width: 640px) calc(100vw - 32px), 360px"
                      alt={c.alt}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
                </span>
                <span className="index-title">{slashTitle(doc.title)}</span>
                {doc.period || doc.month ? <span className="index-period">{doc.period || formatMonth(doc.month)}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <a className="source-link" href={config.sourceUrl}>
        seeaassoonnss is open source
      </a>
    </main>
  );
}
