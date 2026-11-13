import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { discardDraft } from "@/lib/seasons";

type Ctx = { params: Promise<{ id: string }> };

/** Discard changes: copy the published snapshot back into the draft. */
export const POST = handle(async (request: Request, { params }: Ctx) => {
  await requireOwner(request);
  const season = await discardDraft((await params).id);
  return NextResponse.json({ doc: season.draft, version: season.version });
});
