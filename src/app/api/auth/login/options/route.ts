import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { authenticationOptions } from "@/lib/auth/passkeys";

export const POST = handle(async () => NextResponse.json(await authenticationOptions()));
