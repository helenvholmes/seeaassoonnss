import { notFound, redirect } from "next/navigation";
import { DevicePreview } from "@/components/owner/DevicePreview";
import { isOwner } from "@/lib/auth/session";
import { getSeason } from "@/lib/seasons";

export const dynamic = "force-dynamic";

export default async function Preview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ device?: string }> }) {
  if (!(await isOwner())) redirect("/edit/sign-in");
  const season = await getSeason((await params).id);
  if (!season) notFound();
  return <DevicePreview id={season.id} title={season.draft.title} initialDevice={(await searchParams).device ?? "laptop"} />;
}
