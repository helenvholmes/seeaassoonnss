import "server-only";
import postgres from "postgres";
import { config } from "./config";

declare global {
  // Reuse one pool across hot reloads in development.
  var __seasonsSql: postgres.Sql | undefined;
}

export const sql: postgres.Sql =
  globalThis.__seasonsSql ??
  postgres(config.databaseUrl, {
    max: process.env.VERCEL ? 1 : 5,
    onnotice: () => {},
    // Neon's pooled endpoint (pgbouncer) does not support prepared statements.
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalThis.__seasonsSql = sql;
