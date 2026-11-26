import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonCanvas } from "@/components/SeasonCanvas";
import { Lightbox } from "@/components/Lightbox";
import { lightboxPhotos } from "@/lib/lightbox";
import { getPublishedSeason, listSeriesMembers } from "@/lib/seasons";
import { seriesNavigation } from "@/lib/series";
import { SeriesMenu, SeriesNext } from "@/components/SeriesNav";
import { seasonMetadata } from "@/lib/share";
import { logPageError } from "@/lib/health";
import { storage } from "@/lib/storage";

// Each season page renders on its first visit and stays cached until the owner
// publishes, unpublishes, renames or deletes it (see lib/revalidate.ts).
export const dynamicParams = true;
export const revalidate = false;
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const season = await getPublishedSeason((await params).slug);
    if (!season) return {};
    return seasonMetadata(season.slug, season.doc, storage().publicBaseUrl());
  } catch (e) {
    logPageError("season metadata", e);
    throw e;
  }
}

async function load(slug: string) {
  try {
    const season = await getPublishedSeason(slug);
    const series = season?.doc.series;
    const nav = season && series ? seriesNavigation(series.name, { slug: season.slug, title: season.doc.title, part: series.part }, await listSeriesMembers(series.name)) : null;
    return { season, nav, mediaBase: storage().publicBaseUrl() };
  } catch (e) {
    logPageError(`season page /${slug} (see /seasons/api/health)`, e);
    throw e;
  }
}

export default async function SeasonPage({ params }: Props) {
  const { season, nav, mediaBase } = await load((await params).slug);
  if (!season) notFound();
  const { doc } = season;
  return (
    <main className="season-page" style={{ background: doc.background.value }}>
      {nav ? <SeriesMenu nav={nav} /> : null}
      <SeasonCanvas doc={doc} mediaBase={mediaBase} />
      <Lightbox photos={lightboxPhotos(doc)} mediaBase={mediaBase} />
      {nav ? <SeriesNext nav={nav} /> : null}
      <nav className="season-footer">
        <Link href="/">// all seasons</Link>
      </nav>
    </main>
  );
}
