import { notFound, redirect } from "next/navigation";
import { DevicePreview } from "@/components/owner/DevicePreview";
import { isOwner } from "@/lib/auth/session";
import { getSeason } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ device?: string; full?: string }> }) {
  if (!(await isOwner())) redirect("/edit/sign-in");
  const season = await getSeason((await params).id);
  if (!season) notFound();
  const query = await searchParams;
  return <DevicePreview id={season.id} title={season.draft.title} initialDevice={query.device ?? "laptop"} initialFull={query.full === "1"} />;
}
