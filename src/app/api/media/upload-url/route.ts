import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { requireOwner } from "@/lib/auth/session";
import { createImageUpload } from "@/lib/media";

export const POST = handle(async (request: Request) => {
  await requireOwner(request);
  const body = await readJson(request);
  const result = await createImageUpload(String(body.contentType ?? ""), Number(body.size));
  return NextResponse.json(result);
});
