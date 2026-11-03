import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Item, PhotoItem, QuoteItem, SeasonDoc } from "@/lib/schema";
import { DESKTOP_WIDTH, MAX_SCALE } from "@/lib/schema";
import { units } from "./geometry";
import { PlaylistCard } from "./PlaylistCard";

export const FONT_STACKS: Record<QuoteItem["content"]["font"], string> = {
  serif: '"EB Garamond", Garamond, "Times New Roman", serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/** Quote Markdown: bold, italic, links and line breaks. Raw HTML is never rendered. */
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      allowedElements={["p", "strong", "em", "a", "br"]}
      unwrapDisallowed
      skipHtml
      components={{
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function imageUrl(mediaBase: string, mediaId: string, width: number) {
  return `${mediaBase}/media/${mediaId}/${width}.webp`;
}

function Photo({ item, mediaBase }: { item: PhotoItem; mediaBase: string }) {
  const { mediaId, widths, alt, fit } = item.content;
  const largest = widths[widths.length - 1];
  const share = item.desktop.w / DESKTOP_WIDTH;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="item-photo"
      src={imageUrl(mediaBase, mediaId, largest)}
      srcSet={widths.map((w) => `${imageUrl(mediaBase, mediaId, w)} ${w}w`).join(", ")}
      sizes={`min(${(share * 100).toFixed(2)}vw, ${Math.ceil(item.desktop.w * MAX_SCALE)}px)`}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ objectFit: fit }}
    />
  );
}

function Quote({ item, doc }: { item: QuoteItem; doc: SeasonDoc }) {
  const c = item.content;
  const style = {
    fontFamily: FONT_STACKS[c.font],
    fontSize: units(c.size),
    color: c.color,
    textAlign: c.align,
  } as const;
  if (c.binding === "title") {
    return (
      <h1 className="item-quote item-title" style={style}>
        {doc.title}
      </h1>
    );
  }
  const text = c.binding === "subtitle" ? doc.subtitle : c.markdown;
  return (
    <div className="item-quote" style={style}>
      <SafeMarkdown text={text} />
      {c.source && !c.binding ? <p className="item-quote-source">— {c.source}</p> : null}
    </div>
  );
}

/** What an item shows, without its position. The editor and the public page share it. */
export function ItemContent({ item, doc, mediaBase, interactive }: { item: Item; doc: SeasonDoc; mediaBase: string; interactive: boolean }) {
  switch (item.type) {
    case "photo":
      return <Photo item={item} mediaBase={mediaBase} />;
    case "quote":
      return <Quote item={item} doc={doc} />;
    case "playlist":
      return <PlaylistCard item={item} interactive={interactive} />;
  }
}
