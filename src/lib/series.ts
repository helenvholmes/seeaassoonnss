// Multi-part series. Seasons whose `series.name` matches (ignoring case and
// spacing) are parts of one series, read in order of `series.part`.
// Pure logic, shared by the public page, the editor and the tests.

/** The form two series names are compared in: trimmed, lowercase, single spaces. */
export function seriesKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export interface SeriesMember {
  slug: string;
  title: string;
  part: number;
}

export interface SeriesNavigation {
  /** The series name as the current season spells it. */
  name: string;
  /** Every part, in reading order. */
  parts: (SeriesMember & { current: boolean })[];
  /** Position of the current season in `parts`, from 0. */
  index: number;
  previous: SeriesMember | null;
  next: SeriesMember | null;
}

/** Reading order: by part, then by slug so two seasons with the same part number stay in a fixed order. */
export function sortParts<T extends { part: number; slug: string }>(members: T[]): T[] {
  return [...members].sort((a, b) => a.part - b.part || a.slug.localeCompare(b.slug));
}

/**
 * The menu and next/previous links for one season. `members` are the published
 * seasons in the series; the current one is added if it is missing (a preview).
 * Null when the season is alone in its series: there is nothing to link to.
 */
export function seriesNavigation(name: string, current: SeriesMember, members: SeriesMember[]): SeriesNavigation | null {
  const others = members.filter((m) => m.slug !== current.slug);
  if (others.length === 0) return null;
  const parts = sortParts([...others, current]).map((m) => ({ ...m, current: m.slug === current.slug }));
  const index = parts.findIndex((m) => m.current);
  const strip = (m: SeriesMember & { current: boolean }): SeriesMember => ({ slug: m.slug, title: m.title, part: m.part });
  return {
    name,
    parts,
    index,
    previous: index > 0 ? strip(parts[index - 1]) : null,
    next: index < parts.length - 1 ? strip(parts[index + 1]) : null,
  };
}

/** A series as the editor sees it: every season whose draft is in it, published or not. */
export interface SeriesOption {
  name: string;
  members: { id: string; title: string; part: number; status: "draft" | "published" }[];
}

/** The part number a season gets when it joins a series: one after the last part. */
export function nextPartNumber(parts: number[]): number {
  return Math.min(999, parts.reduce((max, p) => Math.max(max, p), 0) + 1);
}
