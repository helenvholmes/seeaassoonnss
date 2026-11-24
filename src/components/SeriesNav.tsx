import Link from "next/link";
import { slashTitle } from "@/lib/layout";
import type { SeriesNavigation } from "@/lib/series";

/**
 * The menu of a series' parts, in the corner of each part. A <details> element, so
 * it opens without JavaScript.
 */
export function SeriesMenu({ nav }: { nav: SeriesNavigation }) {
  return (
    <details className="series-menu">
      <summary aria-label={`${nav.name}: part ${nav.index + 1} of ${nav.parts.length}. Show all parts`}>
        <span className="series-menu-name">{nav.name}</span>
        <span className="series-menu-count">
          {nav.index + 1}/{nav.parts.length}
        </span>
      </summary>
      <ol className="series-menu-parts">
        {nav.parts.map((p) => (
          <li key={p.slug}>
            {p.current ? (
              <span aria-current="page">{slashTitle(p.title)}</span>
            ) : (
              <Link href={`/${p.slug}`}>{slashTitle(p.title)}</Link>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** At the end of each part: on to the next one, or back to the start after the last. */
export function SeriesNext({ nav }: { nav: SeriesNavigation }) {
  const first = nav.parts[0];
  return (
    <nav className="series-next" aria-label={`${nav.name}, the series`}>
      {nav.next ? (
        <Link href={`/${nav.next.slug}`} className="series-next-link" rel="next">
          <span className="series-next-label">
            next in {nav.name} · part {nav.index + 2} of {nav.parts.length}
          </span>
          <span className="series-next-title">{slashTitle(nav.next.title)} →</span>
        </Link>
      ) : (
        <Link href={`/${first.slug}`} className="series-next-link">
          <span className="series-next-label">the end of {nav.name}</span>
          <span className="series-next-title">← back to {slashTitle(first.title)}</span>
        </Link>
      )}
      {nav.previous ? (
        <Link href={`/${nav.previous.slug}`} className="series-previous" rel="prev">
          ← previous: {slashTitle(nav.previous.title)}
        </Link>
      ) : null}
    </nav>
  );
}
