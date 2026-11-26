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

/**
 * Along the bottom of each part: the previous part on the left, the next on the
 * right. Each side shows only when there is a part to go to.
 */
export function SeriesNext({ nav }: { nav: SeriesNavigation }) {
  const count = nav.parts.length;
  return (
    <nav className="series-next" aria-label={`${nav.name}, the series`}>
      {nav.previous ? (
        <Link href={`/${nav.previous.slug}`} className="series-step series-previous" rel="prev" aria-label={`Previous: ${slashTitle(nav.previous.title)}, part ${nav.index} of ${count}`}>
          <span className="series-step-label">
            ← part {nav.index} of {count}
          </span>
          <span className="series-step-title">{slashTitle(nav.previous.title)}</span>
        </Link>
      ) : null}
      {nav.next ? (
        <Link href={`/${nav.next.slug}`} className="series-step series-next-link" rel="next" aria-label={`Next: ${slashTitle(nav.next.title)}, part ${nav.index + 2} of ${count}`}>
          <span className="series-step-label">
            part {nav.index + 2} of {count} →
          </span>
          <span className="series-step-title">{slashTitle(nav.next.title)}</span>
        </Link>
      ) : null}
    </nav>
  );
}
