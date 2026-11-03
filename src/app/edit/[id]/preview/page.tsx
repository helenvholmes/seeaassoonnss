import { notFound, redirect } from "next/navigation";
import { SeasonCanvas } from "@/components/SeasonCanvas";
import { isOwner } from "@/lib/auth/session";
import { getSeason } from "@/lib/seasons";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

/** The draft exactly as visitors would see it after Publish. Owner only. */
export default async function Preview({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) redirect("/edit/sign-in");
  const season = await getSeason((await params).id);
  if (!season) notFound();
  return (
    <main className="season-page" style={{ background: season.draft.background.value }}>
      <SeasonCanvas doc={season.draft} mediaBase={storage().publicBaseUrl()} />
    </main>
  );
}
