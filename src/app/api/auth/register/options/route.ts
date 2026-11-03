import { NextResponse } from "next/server";
import { handle, readJson } from "@/lib/api";
import { registrationOptions } from "@/lib/auth/passkeys";

export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const token = typeof body.setupToken === "string" ? body.setupToken : undefined;
  return NextResponse.json(await registrationOptions(token));
});
