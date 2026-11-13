import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "./auth/session";
import { PasskeyError } from "./auth/passkeys";
import { MediaError } from "./media";
import { SeasonError } from "./seasons";
import { SpotifyError } from "./spotify";

/** Wraps a route handler: known errors become JSON with their status; others become 500. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError || e instanceof PasskeyError || e instanceof SeasonError || e instanceof MediaError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      if (e instanceof SpotifyError) return NextResponse.json({ error: e.message }, { status: 422 });
      console.error(e);
      return NextResponse.json({ error: "Something went wrong on the server." }, { status: 500 });
    }
  };
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}
