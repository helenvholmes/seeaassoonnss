import "server-only";
import { sql } from "./db";
import { emptySeasonDoc, seasonDocSchema, slugify, slugProblem, type SeasonDoc } from "./schema";

export type SeasonStatus = "draft" | "published";

export interface SeasonRow {
  id: string;
  slug: string;
  status: SeasonStatus;
  draft: SeasonDoc;
  published: SeasonDoc | null;
  version: number;
  publishedAt: Date | null;
  sortOrder: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeasonSummary {
  id: string;
  slug: string;
  status: SeasonStatus;
  title: string;
  period: string;
  hasUnpublishedChanges: boolean;
  updatedAt: Date;
}

export class SeasonError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function toRow(r: Record<string, unknown>): SeasonRow {
  return {
    id: r.id as string,
    slug: r.slug as string,
    status: r.status as SeasonStatus,
    draft: r.draft as SeasonDoc,
    published: (r.published as SeasonDoc | null) ?? null,
    version: r.version as number,
    publishedAt: (r.published_at as Date | null) ?? null,
    sortOrder: (r.sort_order as number | null) ?? null,
    createdAt: r.created_at as Date,
    updatedAt: r.updated_at as Date,
  };
}

export async function listSeasons(): Promise<SeasonSummary[]> {
  const rows = await sql`
    select id, slug, status, draft->>'title' as title, draft->>'period' as period,
           (published is null or draft <> published) as changed, updated_at
    from seasons order by updated_at desc`;
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    status: r.status,
    title: r.title,
    period: r.period,
    hasUnpublishedChanges: r.status === "published" && r.changed,
    updatedAt: r.updated_at,
  }));
}

export async function getSeason(id: string): Promise<SeasonRow | null> {
  if (!isUuid(id)) return null;
  const [r] = await sql`select * from seasons where id = ${id}`;
  return r ? toRow(r) : null;
}

/** The public view: only the published snapshot of a published season. */
export async function getPublishedSeason(slug: string): Promise<{ slug: string; doc: SeasonDoc } | null> {
  if (slugProblem(slug)) return null;
  const [r] = await sql`select slug, published from seasons where slug = ${slug} and status = 'published' and published is not null`;
  return r ? { slug: r.slug, doc: r.published as SeasonDoc } : null;
}

export interface IndexEntry {
  slug: string;
  doc: SeasonDoc;
}

/** Published seasons for the public index: pinned ones by position, then by month (newest first), then newest created. */
export async function listPublishedSeasons(): Promise<IndexEntry[]> {
  const rows = await sql`
    select slug, published from seasons
    where status = 'published' and published is not null
    order by sort_order asc nulls last,
             published->>'month' desc nulls last,
             created_at desc`;
  return rows.map((r) => ({ slug: r.slug, doc: r.published as SeasonDoc }));
}

/** Position on the index page; null = listed by date. */
export async function setSortOrder(id: string, sortOrder: number | null): Promise<string> {
  if (sortOrder !== null && (!Number.isInteger(sortOrder) || sortOrder < 1 || sortOrder > 9999)) {
    throw new SeasonError("Position must be a whole number from 1 to 9999, or empty.", 400);
  }
  const [r] = await sql`update seasons set sort_order = ${sortOrder}, updated_at = now() where id = ${id} returning slug`;
  if (!r) throw new SeasonError("Season not found.", 404);
  return r.slug;
}

export async function createSeason(title: string): Promise<SeasonRow> {
  const clean = title.trim() || "untitled season";
  const doc = emptySeasonDoc(clean);
  const baseSlug = slugify(clean) || "season";
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? baseSlug : `${baseSlug}-${n}`;
    if (slugProblem(slug)) continue;
    const [r] = await sql`
      insert into seasons (slug, draft) values (${slug}, ${sql.json(doc as never)})
      on conflict (slug) do nothing returning *`;
    if (r) return toRow(r);
  }
  throw new SeasonError("Could not find a free slug.", 409);
}

/** Autosave. Rejects the save when another tab saved in between. */
export async function saveDraft(id: string, expectedVersion: number, input: unknown): Promise<{ version: number; updatedAt: Date }> {
  const parsed = seasonDocSchema.safeParse(input);
  if (!parsed.success) throw new SeasonError(`Invalid season: ${parsed.error.issues[0]?.path.join(".")} ${parsed.error.issues[0]?.message}`, 400);
  const doc = parsed.data;
  if (doc.coverItemId && !doc.items.some((i) => i.id === doc.coverItemId)) doc.coverItemId = null;
  const ids = new Set(doc.items.map((i) => i.id));
  if (ids.size !== doc.items.length) throw new SeasonError("Two items share an id.", 400);

  const [r] = await sql`
    update seasons set draft = ${sql.json(doc as never)}, version = version + 1, updated_at = now()
    where id = ${id} and version = ${expectedVersion}
    returning version, updated_at`;
  if (r) return { version: r.version, updatedAt: r.updated_at };
  const [exists] = await sql`select 1 from seasons where id = ${id}`;
  if (!exists) throw new SeasonError("Season not found.", 404);
  throw new SeasonError("This season was saved from another tab. Reload to get the latest version.", 409);
}

/** Copies the draft into the public snapshot. */
export async function publishSeason(id: string): Promise<SeasonRow> {
  const [r] = await sql`
    update seasons set published = draft, status = 'published', published_at = now()
    where id = ${id} returning *`;
  if (!r) throw new SeasonError("Season not found.", 404);
  return toRow(r);
}

export async function unpublishSeason(id: string): Promise<SeasonRow> {
  const [r] = await sql`update seasons set status = 'draft' where id = ${id} returning *`;
  if (!r) throw new SeasonError("Season not found.", 404);
  return toRow(r);
}

/** Copies the public snapshot back into the draft. */
export async function discardDraft(id: string): Promise<SeasonRow> {
  const [r] = await sql`
    update seasons set draft = published, version = version + 1, updated_at = now()
    where id = ${id} and published is not null returning *`;
  if (!r) throw new SeasonError("Nothing published to go back to.", 404);
  return toRow(r);
}

export async function renameSlug(id: string, slug: string): Promise<{ oldSlug: string; slug: string }> {
  const problem = slugProblem(slug);
  if (problem) throw new SeasonError(problem, 400);
  const [old] = await sql`select slug from seasons where id = ${id}`;
  if (!old) throw new SeasonError("Season not found.", 404);
  try {
    await sql`update seasons set slug = ${slug}, updated_at = now() where id = ${id}`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw new SeasonError(`Another season already uses "${slug}".`, 409);
    throw e;
  }
  return { oldSlug: old.slug, slug };
}

export async function deleteSeason(id: string): Promise<string | null> {
  const [r] = await sql`delete from seasons where id = ${id} returning slug`;
  return r?.slug ?? null;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
