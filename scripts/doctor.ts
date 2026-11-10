// npm run doctor: checks a seeaassoonnss setup and says what to fix.
// Run it with the same environment as your deployment, for example after
// `vercel env pull .env.local`. It writes and deletes one small test file in each
// R2 bucket; it changes nothing else.
import { createHash, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import postgres from "postgres";

type Level = "ok" | "warn" | "fail";
const results: Level[] = [];
const mark = { ok: "✓", warn: "!", fail: "✗" };
function report(level: Level, message: string, fix?: string) {
  results.push(level);
  console.log(`${mark[level]} ${message}${fix ? `\n    → ${fix}` : ""}`);
}
const env = (name: string) => process.env[name]?.trim() || "";

async function checkEnv(): Promise<URL | null> {
  console.log("\nEnvironment");
  const [major] = process.versions.node.split(".").map(Number);
  report(major >= 20 ? "ok" : "fail", `Node.js ${process.versions.node}`, major >= 20 ? undefined : "Use Node.js 20 or later.");

  let site: URL | null = null;
  if (!env("SITE_URL")) report("fail", "SITE_URL is not set", "Set it to the address visitors use, without /seasons, for example https://example.com.");
  else {
    try {
      site = new URL(env("SITE_URL"));
      const local = ["localhost", "127.0.0.1"].includes(site.hostname);
      if (site.protocol !== "https:" && !local) report("fail", `SITE_URL ${site.origin} is not https`, "Passkeys need https outside localhost.");
      else if (site.pathname !== "/") report("fail", `SITE_URL has a path (${site.pathname})`, "Use only the origin, for example https://example.com. The app adds /seasons itself.");
      else report("ok", `SITE_URL ${site.origin}${local ? " (local)" : ""}`);
      if (site.hostname.endsWith(".vercel.app")) {
        report("warn", "SITE_URL is a *.vercel.app address", "That works, but passkeys are bound to it. If you later move to your own domain, you will register passkeys again (with a new SETUP_TOKEN).");
      }
    } catch {
      report("fail", `SITE_URL "${env("SITE_URL")}" is not a URL`);
    }
  }

  const token = env("SETUP_TOKEN");
  if (!token) report("warn", "SETUP_TOKEN is not set", "Without it nobody can register a passkey. Set one before the first sign-in: openssl rand -base64 32");
  else report(token.length >= 16 ? "ok" : "warn", `SETUP_TOKEN is set (${token.length} characters)`, token.length >= 16 ? undefined : "Use at least 16 random characters.");

  const source = env("SOURCE_URL");
  if (!source) report("warn", "SOURCE_URL is not set", "The 'seeaassoonnss is open source' link points at the original repository. Under AGPL-3.0, point it at your fork if you change the code.");
  else report("ok", `SOURCE_URL ${source}`);
  return site;
}

async function checkDatabase() {
  console.log("\nDatabase");
  if (!env("DATABASE_URL")) {
    report("fail", "DATABASE_URL is not set", "Create a Postgres database (for example Neon from Vercel's Storage tab) and set DATABASE_URL.");
    return;
  }
  const sql = postgres(env("DATABASE_URL"), { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 10 });
  try {
    await sql`select 1`;
    report("ok", `connected to ${new URL(env("DATABASE_URL")).host}`);
    const files = (await readdir(new URL("../db/migrations/", import.meta.url))).filter((f) => f.endsWith(".sql")).sort();
    const [table] = await sql`select to_regclass('schema_migrations') as t`;
    const done = table.t ? new Set((await sql`select name from schema_migrations`).map((r) => r.name)) : new Set<string>();
    const missing = files.filter((f) => !done.has(f));
    if (missing.length) report("fail", `${missing.length} migration(s) not applied: ${missing.join(", ")}`, 'Run "npm run db:migrate" (Vercel builds run it automatically).');
    else report("ok", `all ${files.length} migrations applied`);
    if (!missing.length) {
      const [{ n }] = await sql`select count(*)::int as n from passkeys`;
      if (n === 0) report("warn", "no passkey registered yet", "Open SITE_URL/seasons/edit and register one with the setup token.");
      else report("ok", `${n} passkey(s) registered`);
      if (env("SETUP_TOKEN")) {
        const hash = createHash("sha256").update(env("SETUP_TOKEN")).digest("hex");
        const [used] = await sql`select used_at from used_setup_tokens where token_hash = ${hash}`;
        if (used) report(n === 0 ? "fail" : "ok", `SETUP_TOKEN was used on ${used.used_at.toISOString().slice(0, 10)}`, n === 0 ? "Set a new SETUP_TOKEN to register a passkey." : "To register again later (for recovery), set a new one.");
      }
    }
  } catch (e) {
    report("fail", `cannot use the database: ${(e as Error).message}`, "Check DATABASE_URL. Neon URLs need ?sslmode=require.");
  } finally {
    await sql.end();
  }
}

async function preflight(url: string, origin: string, headers: string): Promise<string | null> {
  const res = await fetch(url, {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": "PUT", "access-control-request-headers": headers },
  }).catch(() => null);
  if (!res) return "no response";
  const allowed = res.headers.get("access-control-allow-origin");
  if (!res.ok || (allowed !== origin && allowed !== "*")) return `HTTP ${res.status}, allow-origin ${allowed ?? "missing"}`;
  return null;
}

async function checkStorage(site: URL | null) {
  console.log("\nMedia storage");
  const driver = env("STORAGE_DRIVER") || "local";
  if (driver === "local") {
    report(process.env.VERCEL ? "fail" : "warn", "STORAGE_DRIVER=local", "Local storage is for development only. Set STORAGE_DRIVER=r2 for a deployment.");
    return;
  }
  if (driver !== "r2") {
    report("fail", `STORAGE_DRIVER "${driver}" is unknown`, "Use r2 (or local in development).");
    return;
  }
  const names = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PRIVATE_BUCKET", "R2_PUBLIC_BUCKET", "R2_PUBLIC_URL"];
  const missing = names.filter((n) => !env(n));
  if (missing.length) {
    report("fail", `missing ${missing.join(", ")}`, "See the R2 steps in the README.");
    return;
  }
  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: env("R2_ACCESS_KEY_ID"), secretAccessKey: env("R2_SECRET_ACCESS_KEY") },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const key = `doctor/${randomUUID()}.txt`;
  const body = `seasons doctor ${new Date().toISOString()}`;
  for (const [label, bucket] of [
    ["private", env("R2_PRIVATE_BUCKET")],
    ["public", env("R2_PUBLIC_BUCKET")],
  ] as const) {
    try {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: "text/plain" }));
      const got = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const text = await got.Body?.transformToString();
      report(text === body ? "ok" : "fail", `${label} bucket "${bucket}": write and read`);
    } catch (e) {
      report("fail", `${label} bucket "${bucket}": ${(e as Error).name}: ${(e as Error).message}`, "Check the bucket name and that the API token can read and write it.");
      continue;
    }
    if (label === "public") {
      const url = `${env("R2_PUBLIC_URL").replace(/\/+$/, "")}/${key}`;
      const res = await fetch(url).catch(() => null);
      if (res?.ok && (await res.text()) === body) report("ok", `public URL serves files (${env("R2_PUBLIC_URL")})`);
      else report("fail", `public URL does not serve the test file (${res ? `HTTP ${res.status}` : "no response"})`, "Turn on public access for the public bucket (r2.dev or a custom domain) and set R2_PUBLIC_URL to it.");
      if (site && res?.ok) {
        // 3D models are fetched by script, so the page's origin must be allowed to read them.
        const cors = await fetch(url, { headers: { Origin: site.origin } }).catch(() => null);
        const allowed = cors?.headers.get("access-control-allow-origin");
        if (allowed === "*" || allowed === site.origin) report("ok", `public bucket lets ${site.origin} load files by script (3D models)`);
        else report("warn", `public bucket does not let ${site.origin} load files by script`, 'Add "GET" to AllowedMethods in the public bucket\'s CORS rule (README step 2). Without it, 3D models show only their poster.');
      }
    }
    if (site) {
      const signed = await getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: "text/plain" }), { expiresIn: 60 });
      const problem = await preflight(signed, site.origin, label === "public" ? "content-type,cache-control" : "content-type");
      if (problem) report("fail", `${label} bucket does not allow uploads from ${site.origin} (${problem})`, "Add the CORS rule from the README to this bucket.");
      else report("ok", `${label} bucket allows uploads from ${site.origin}`);
    }
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {});
  }
}

async function checkServices() {
  console.log("\nOutside services (optional)");
  const spotify = await fetch("https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M", { signal: AbortSignal.timeout(8000) }).catch(() => null);
  report(spotify?.ok ? "ok" : "warn", `Spotify oEmbed ${spotify?.ok ? "reachable" : "not reachable from here"}`, spotify?.ok ? undefined : "Playlist cards need it; this may only be this network.");
}

async function main() {
  console.log("seeaassoonnss setup check");
  const site = await checkEnv();
  await checkDatabase();
  await checkStorage(site);
  await checkServices();
  const fails = results.filter((r) => r === "fail").length;
  const warns = results.filter((r) => r === "warn").length;
  console.log(`\n${fails ? `${fails} problem(s) to fix` : "No problems found"}${warns ? `, ${warns} warning(s)` : ""}.`);
  process.exitCode = fails ? 1 : 0;
}

main();
