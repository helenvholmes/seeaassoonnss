import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SeasonCanvas } from "@/components/SeasonCanvas";
import { config } from "@/lib/config";
import { getPublishedSeason } from "@/lib/seasons";
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
  const season = await getPublishedSeason((await params).slug);
  if (!season) return {};
  return { title: season.doc.title, description: season.doc.period || undefined };
}

export default async function SeasonPage({ params }: Props) {
  const season = await getPublishedSeason((await params).slug);
  if (!season) notFound();
  const { doc } = season;
  return (
    <main className="season-page" style={{ background: doc.background.value }}>
      <SeasonCanvas doc={doc} mediaBase={storage().publicBaseUrl()} />
      <a className="source-link" href={config.sourceUrl}>
        Seasons is open source
      </a>
    </main>
  );
}
