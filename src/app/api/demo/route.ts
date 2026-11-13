import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createDemoSeason, DEMO_SLUG } from "@/lib/demo";
import { refreshPublicPage } from "@/lib/revalidate";

// Uploading the placeholders and compressing the 3D pear takes a few seconds.
export const maxDuration = 60;

/** Creates the demo season (owner only). With { replace: true }, replaces an existing one. */
export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const replace = body.replace === true;
  const result = await createDemoSeason({ replace });
  if (replace && result.created) refreshPublicPage(DEMO_SLUG);
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});
