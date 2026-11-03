import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SeasonCanvas } from "@/components/SeasonCanvas";
import { config } from "@/lib/config";
import { getPublishedSeason } from "@/lib/seasons";
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
    return { season: await getPublishedSeason(slug), mediaBase: storage().publicBaseUrl(), sourceUrl: config.sourceUrl };
  } catch (e) {
    logPageError(`season page /${slug} (see /seasons/api/health)`, e);
    throw e;
  }
}

export default async function SeasonPage({ params }: Props) {
  const { season, mediaBase, sourceUrl } = await load((await params).slug);
  if (!season) notFound();
  const { doc } = season;
  return (
    <main className="season-page" style={{ background: doc.background.value }}>
      <SeasonCanvas doc={doc} mediaBase={mediaBase} />
      <nav className="season-footer">
        <Link href="/">// all seasons</Link>
        <a href={sourceUrl}>Seasons is open source</a>
      </nav>
    </main>
  );
}
