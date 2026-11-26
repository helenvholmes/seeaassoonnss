import Link from "next/link";
import { slashTitle } from "@/lib/layout";
import type { SeriesNavigation } from "@/lib/series";

/**
 * The menu of a series' parts, in the upper right corner of each part: just the
 * part count ("1/2"), opening to the list of parts. A <details> element, so
 * it opens without JavaScript.
 */
export function SeriesMenu({ nav }: { nav: SeriesNavigation }) {
  return (
    <details className="series-menu">
      <summary aria-label={`${nav.name}: part ${nav.index + 1} of ${nav.parts.length}. Show all parts`}>
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

/**
 * Along the bottom of each part: the previous part on the left, the next on the
 * right, set in italics like a quote. Each side shows only when there is a part
 * to go to.
 */
export function SeriesNext({ nav }: { nav: SeriesNavigation }) {
  const count = nav.parts.length;
  return (
    <nav className="series-next" aria-label={`${nav.name}, the series`}>
      {nav.previous ? (
        <Link href={`/${nav.previous.slug}`} className="series-step series-previous" rel="prev" aria-label={`Previous: ${nav.previous.title}, part ${nav.index} of ${count}`}>
          <span aria-hidden="true">← </span>
          {nav.previous.title}
        </Link>
      ) : null}
      {nav.next ? (
        <Link href={`/${nav.next.slug}`} className="series-step series-next-link" rel="next" aria-label={`Next: ${nav.next.title}, part ${nav.index + 2} of ${count}`}>
          {nav.next.title}
          <span aria-hidden="true"> →</span>
        </Link>
      ) : null}
    </nav>
  );
}
