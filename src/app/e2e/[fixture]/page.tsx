import { notFound } from "next/navigation";
import { Fixture, type FixtureName } from "../fixtures";

// Pages for the browser tests (e2e/): the real editor and reader on fixed seasons,
// with no sign-in. They exist only when the server runs with E2E=1 (see
// playwright.config.ts); everywhere else, including the live site, they are 404.
export const dynamic = "force-dynamic";

// Kept here, not in fixtures.tsx: a server page cannot read values from a client module.
const NAMES: FixtureName[] = ["editor-quote", "editor-route", "editor-route-text", "reader-route", "reader-route-text", "reader-series", "reader-series-first", "reader-series-last"];

export default async function E2EFixture({ params }: { params: Promise<{ fixture: string }> }) {
  const { fixture } = await params;
  if (process.env.E2E !== "1" || !NAMES.includes(fixture as FixtureName)) notFound();
  return <Fixture name={fixture as FixtureName} />;
}
