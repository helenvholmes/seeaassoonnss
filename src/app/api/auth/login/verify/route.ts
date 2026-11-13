import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { handle, readJson } from "@/lib/api";
import { verifyAuthentication } from "@/lib/auth/passkeys";

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  await verifyAuthentication(body.response as AuthenticationResponseJSON);
  return NextResponse.json({ ok: true });
});
