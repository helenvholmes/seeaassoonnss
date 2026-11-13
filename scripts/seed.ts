// npm run seed: creates one demo season ("/seasons/demo") with placeholder items,
// as a draft, and adds example p5.js sketches to the sketch library. The editor's
// "Create demo season" button does the same (see src/lib/demo.ts).
// Uses the same database and storage as the app (reads .env.local / .env).
//
//   npm run seed            create the demo season
//   npm run seed -- --force replace an existing demo season
import { config } from "../src/lib/config";
import { sql } from "../src/lib/db";
import { createDemoSeason, DEMO_SLUG } from "../src/lib/demo";

async function main() {
  console.log(`database: ${new URL(config.databaseUrl).host}`);
  console.log(`storage:  ${config.storageDriver}`);
  const { id, created } = await createDemoSeason({ replace: process.argv.includes("--force"), log: (line) => console.log(line) });
  const editor = new URL(`/seasons/edit/${id}`, config.siteUrl);
  if (!created) {
    console.log(`A season at /seasons/${DEMO_SLUG} already exists: ${editor}\nRun "npm run seed -- --force" to replace it.`);
    return;
  }
  console.log(`\ncreated the demo season as a draft.\nopen it in the editor: ${editor}\npublish it there to see /seasons/${DEMO_SLUG}, or delete it from the season settings.`);
}

main()
  .catch((e) => {
    console.error(`\nseed failed: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
