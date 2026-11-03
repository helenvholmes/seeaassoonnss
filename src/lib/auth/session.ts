import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { BASE_PATH, config } from "../config";
import { sql } from "../db";

const SESSION_COOKIE = "seasons_session";
const SESSION_DAYS = 30;

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config.siteUrl.protocol === "https:",
    sameSite: "lax" as const,
    path: BASE_PATH,
    maxAge: maxAgeSeconds,
  };
}

export async function startSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const maxAge = SESSION_DAYS * 24 * 60 * 60;
  await sql`insert into sessions (token_hash, expires_at) values (${sha256(token)}, now() + ${`${SESSION_DAYS} days`}::interval)`;
  await sql`delete from sessions where expires_at < now()`;
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(maxAge));
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`delete from sessions where token_hash = ${sha256(token)}`;
  jar.set(SESSION_COOKIE, "", cookieOptions(0));
}

/** True when the request carries a valid owner session. */
export async function isOwner(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const [row] = await sql`select 1 from sessions where token_hash = ${sha256(token)} and expires_at > now()`;
  return Boolean(row);
}

export class AuthError extends Error {
  status = 401;
}

/**
 * Every write route calls this first. It checks the session, and that a browser
 * request came from the site itself (a second guard on top of SameSite cookies).
 */
export async function requireOwner(request?: Request): Promise<void> {
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== config.siteUrl.origin) {
      const err = new AuthError(`Request origin ${origin} does not match SITE_URL.`);
      err.status = 403;
      throw err;
    }
  }
  if (!(await isOwner())) throw new AuthError("Sign in first.");
}
