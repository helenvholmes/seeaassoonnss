import "server-only";
import postgres from "postgres";
import { config } from "./config";

declare global {
  // Reuse one pool across hot reloads in development.
  var __seasonsSql: postgres.Sql | undefined;
}

function connect(): postgres.Sql {
  globalThis.__seasonsSql ??= postgres(config.databaseUrl, {
    max: process.env.VERCEL ? 1 : 5,
    onnotice: () => {},
    // Neon's pooled endpoint (pgbouncer) does not support prepared statements.
    prepare: false,
  });
  return globalThis.__seasonsSql;
}

/**
 * The database client. It connects on first use, not on import, so the app builds
 * without DATABASE_URL (CI, or a fresh fork before its database exists).
 */
export const sql = new Proxy((() => {}) as unknown as postgres.Sql, {
  apply: (_target, _this, args) => (connect() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => {
    const client = connect();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
