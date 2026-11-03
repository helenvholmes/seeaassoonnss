import "server-only";
import { sql } from "./db";

export interface Check {
  ok: boolean;
  detail: string;
}

/** Tables the current migrations create. A missing one means migrations did not run. */
const TABLES = ["seasons", "media", "passkeys", "sessions", "auth_challenges", "used_setup_tokens", "stickers"];

const env = (name: string) => Boolean(process.env[name]?.trim());

function checkSiteUrl(): Check {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return { ok: false, detail: "SITE_URL is not set." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, detail: `SITE_URL is not a full address. It must start with https://, for example https://example.com.` };
  }
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (url.protocol !== "https:" && !local) return { ok: false, detail: "SITE_URL must start with https://." };
  if (url.pathname !== "/") return { ok: false, detail: `SITE_URL must not have a path (found "${url.pathname}"). Use only the origin, without /seasons.` };
  return { ok: true, detail: url.origin };
}

function checkStorage(): Check {
  const driver = process.env.STORAGE_DRIVER?.trim() || "local";
  if (driver === "local") {
    return process.env.VERCEL ? { ok: false, detail: "STORAGE_DRIVER is local (or not set). Set it to r2." } : { ok: true, detail: "local (development)" };
  }
  if (driver !== "r2") return { ok: false, detail: `STORAGE_DRIVER "${driver}" is unknown. Use r2.` };
  const missing = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET", "R2_PUBLIC_BUCKET", "R2_PUBLIC_URL"].filter((n) => !env(n));
  if (missing.length) return { ok: false, detail: `Missing: ${missing.join(", ")}.` };
  try {
    const u = new URL(process.env.R2_PUBLIC_URL!);
    if (u.protocol !== "https:") return { ok: false, detail: "R2_PUBLIC_URL must start with https://." };
  } catch {
    return { ok: false, detail: "R2_PUBLIC_URL is not a full address. Copy the https://pub-….r2.dev URL." };
  }
  return { ok: true, detail: "r2, all settings present" };
}

/** Explains a database failure without revealing the connection string. */
function describeDbError(e: unknown): string {
  const code = (e as { code?: string }).code ?? "";
  const known: Record<string, string> = {
    "28P01": "the password in DATABASE_URL was refused",
    "3D000": "the database named in DATABASE_URL does not exist",
    ENOTFOUND: "the database host in DATABASE_URL was not found",
    ECONNREFUSED: "the database refused the connection",
    ETIMEDOUT: "the database did not answer in time",
  };
  if (known[code]) return `Cannot connect: ${known[code]}.`;
  if ((e as Error).message?.includes("DATABASE_URL")) return "DATABASE_URL is not set.";
  return `Cannot connect${code ? ` (error ${code})` : ""}. Check DATABASE_URL.`;
}

async function checkDatabase(): Promise<{ database: Check; tables: Check }> {
  if (!env("DATABASE_URL")) {
    const no = { ok: false, detail: "DATABASE_URL is not set." };
    return { database: no, tables: { ok: false, detail: "Not checked." } };
  }
  try {
    const rows = await sql`select t, to_regclass(t) is not null as present from unnest(${TABLES}::text[]) as t`;
    const missing = rows.filter((r) => !r.present).map((r) => r.t as string);
    return {
      database: { ok: true, detail: "connected" },
      tables: missing.length
        ? { ok: false, detail: `Missing tables: ${missing.join(", ")}. The database setup did not run: check the build log, or run npm run db:migrate.` }
        : { ok: true, detail: "all present" },
    };
  } catch (e) {
    return { database: { ok: false, detail: describeDbError(e) }, tables: { ok: false, detail: "Not checked." } };
  }
}

export async function healthReport() {
  const { database, tables } = await checkDatabase();
  const checks = {
    siteUrl: checkSiteUrl(),
    database,
    tables,
    storage: checkStorage(),
    setupToken: env("SETUP_TOKEN") ? { ok: true, detail: "set" } : { ok: true, detail: "not set (only needed to register a passkey)" },
  };
  return { ok: Object.values(checks).every((c) => c.ok), checks };
}

/** Logs a page failure with its real message; production hides it from visitors. */
export function logPageError(where: string, e: unknown) {
  console.error(`[seasons] ${where} failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
  if (e instanceof Error && e.stack) console.error(e.stack);
}
