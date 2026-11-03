// Applies db/migrations/*.sql in name order, once each.
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.env.VERCEL) {
    // The first deploy of a fork usually happens before its database exists.
    console.warn("\n⚠ DATABASE_URL is not set: skipping database migrations. Add a database (README step 3), then redeploy.\n");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
// prepare: false works with pooled connections (Neon's pgbouncer endpoint).
const sql = postgres(url, { onnotice: () => {}, prepare: false, max: 1 });
const dir = new URL("../db/migrations/", import.meta.url);

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(new URL(file, dir), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
  }
  console.log("database is up to date");
} finally {
  await sql.end();
}
