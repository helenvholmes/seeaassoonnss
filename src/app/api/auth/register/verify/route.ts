import { NextResponse } from "next/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { handle, readJson } from "@/lib/api";
import { verifyRegistration } from "@/lib/auth/passkeys";

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const token = typeof body.setupToken === "string" ? body.setupToken : undefined;
  await verifyRegistration(body.response as RegistrationResponseJSON, token);
  return NextResponse.json({ ok: true });
});
