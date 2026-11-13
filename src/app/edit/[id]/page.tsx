import { notFound, redirect } from "next/navigation";
import { Editor } from "@/components/editor/Editor";
import { isOwner } from "@/lib/auth/session";
import { getSeason } from "@/lib/seasons";
import { storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function EditSeason({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isOwner())) redirect("/edit/sign-in");
  const season = await getSeason((await params).id);
  if (!season) notFound();
  return (
    <Editor
      id={season.id}
      initialSlug={season.slug}
      initialDoc={season.draft}
      initialVersion={season.version}
      initialStatus={season.status}
      initialPublished={season.published}
      initialSortOrder={season.sortOrder}
      mediaBase={storage().publicBaseUrl()}
    />
  );
}
