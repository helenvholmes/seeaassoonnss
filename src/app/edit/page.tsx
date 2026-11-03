import Link from "next/link";
import { redirect } from "next/navigation";
import { NewSeason, OwnerActions } from "@/components/owner/OwnerActions";
import { isOwner } from "@/lib/auth/session";
import { listSeasons } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function EditIndex() {
  if (!(await isOwner())) redirect("/edit/sign-in");
  const seasons = await listSeasons();
  return (
    <main className="owner">
      <h1>// seasons</h1>
      <NewSeason />
      <ul className="owner-list">
        {seasons.length === 0 ? <li className="muted">No seasons yet.</li> : null}
        {seasons.map((s) => (
          <li key={s.id}>
            <span>
              <Link href={`/edit/${s.id}`}>{s.title || "untitled"}</Link>
              {s.period ? <span className="muted"> · {s.period}</span> : null}
            </span>
            <span className="muted">
              {s.status === "published" ? (
                <>
                  <Link href={`/${s.slug}`}>/{s.slug}</Link> · published{s.hasUnpublishedChanges ? " · unpublished changes" : ""}
                </>
              ) : (
                "draft"
              )}
            </span>
          </li>
        ))}
      </ul>
      <OwnerActions />
    </main>
  );
}
