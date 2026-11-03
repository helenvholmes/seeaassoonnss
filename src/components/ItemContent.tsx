import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Item, Layout, Placement, PhotoItem, QuoteItem, SeasonDoc } from "@/lib/schema";
import { CANVAS_WIDTH, MAX_SCALE } from "@/lib/schema";
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

function Photo({ item, mediaBase, layout, placement }: { item: PhotoItem; mediaBase: string; layout: Layout; placement: Placement }) {
  const { mediaId, widths, alt, fit } = item.content;
  const largest = widths[widths.length - 1];
  const share = placement.w / CANVAS_WIDTH[layout];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="item-photo"
      src={imageUrl(mediaBase, mediaId, largest)}
      srcSet={widths.map((w) => `${imageUrl(mediaBase, mediaId, w)} ${w}w`).join(", ")}
      sizes={`min(${(share * 100).toFixed(2)}vw, ${Math.ceil(placement.w * MAX_SCALE)}px)`}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ objectFit: fit }}
    />
  );
}

/** Text size in the layout's design units: desktop uses the content size; mobile its own. */
export function quoteSize(item: QuoteItem, layout: Layout, placement: Placement): number {
  if (layout === "desktop") return item.content.size;
  return placement.textSize ?? item.content.size * (CANVAS_WIDTH.mobile / CANVAS_WIDTH.desktop);
}

function Quote({ item, doc, layout, placement }: { item: QuoteItem; doc: SeasonDoc; layout: Layout; placement: Placement }) {
  const c = item.content;
  const style = {
    fontFamily: FONT_STACKS[c.font],
    fontSize: units(quoteSize(item, layout, placement), CANVAS_WIDTH[layout]),
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
export function ItemContent(props: { item: Item; doc: SeasonDoc; mediaBase: string; interactive: boolean; layout: Layout; placement: Placement }) {
  const { item, doc, mediaBase, interactive, layout, placement } = props;
  switch (item.type) {
    case "photo":
      return <Photo item={item} mediaBase={mediaBase} layout={layout} placement={placement} />;
    case "quote":
      return <Quote item={item} doc={doc} layout={layout} placement={placement} />;
    case "playlist":
      return <PlaylistCard item={item} interactive={interactive} />;
  }
}
