import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import type { Item, Layout, MapItem, ModelContent, Placement, PhotoItem, QuoteItem, SeasonDoc, StickerItem } from "@/lib/schema";
import { BASE_PATH } from "@/lib/client";
import { CANVAS_WIDTH, MAX_SCALE } from "@/lib/schema";
import { units } from "./geometry";
import { photoRect } from "@/lib/crop";
import { PlaylistCard } from "./PlaylistCard";
import { VideoView } from "./items/VideoView";
import { VoiceNoteView } from "./items/VoiceNoteView";
import { RouteView } from "./items/RouteView";
import { ModelView } from "./items/ModelView";

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

/** Image attributes for a 3D model's poster, or null if it has none yet. */
export function modelPoster(mediaBase: string, c: ModelContent) {
  if (!c.posterMediaId || !c.posterWidths.length) return null;
  const widths = c.posterWidths;
  return {
    src: imageUrl(mediaBase, c.posterMediaId, widths[Math.min(1, widths.length - 1)]),
    srcSet: widths.map((w) => `${imageUrl(mediaBase, c.posterMediaId!, w)} ${w}w`).join(", "),
  };
}

function Photo({ item, mediaBase, layout, placement, cropping }: { item: PhotoItem; mediaBase: string; layout: Layout; placement: Placement; cropping?: boolean }) {
  const { mediaId, widths, alt, fit, width, height, crop } = item.content;
  const largest = widths[widths.length - 1];
  if (fit === "contain") {
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
        style={{ objectFit: "contain" }}
      />
    );
  }
  // Cover, with the owner's crop: the photo is positioned inside a clipping frame.
  const rect = photoRect(width, height, placement.w, placement.h, crop);
  const shown = placement.w * rect.width;
  const share = shown / CANVAS_WIDTH[layout];
  const style = { left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` };
  const attrs = {
    src: imageUrl(mediaBase, mediaId, largest),
    srcSet: widths.map((w) => `${imageUrl(mediaBase, mediaId, w)} ${w}w`).join(", "),
    sizes: `min(${(share * 100).toFixed(2)}vw, ${Math.ceil(shown * MAX_SCALE)}px)`,
    decoding: "async" as const,
    draggable: false,
  };
  return (
    <>
      {cropping ? (
        // The whole photo, faint, so the owner sees what the crop hides.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="photo-ghost" {...attrs} alt="" style={style} />
      ) : null}
      <div className="photo-frame">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="photo-cropped" {...attrs} alt={alt} loading="lazy" style={style} />
      </div>
    </>
  );
}

/** Text size in the layout's design units: desktop uses the content size; mobile its own. */
export function quoteSize(item: QuoteItem, layout: Layout, placement: Placement): number {
  if (layout === "desktop") return item.content.size;
  return placement.textSize ?? item.content.size * (CANVAS_WIDTH.mobile / CANVAS_WIDTH.desktop);
}

/** Responsive image attributes for a stored image shown in a box `placement.w` units wide. */
function imageAttrs(mediaBase: string, mediaId: string, widths: number[], layout: Layout, placement: Placement) {
  const share = placement.w / CANVAS_WIDTH[layout];
  return {
    src: imageUrl(mediaBase, mediaId, widths[widths.length - 1]),
    srcSet: widths.map((w) => `${imageUrl(mediaBase, mediaId, w)} ${w}w`).join(", "),
    sizes: `min(${(share * 100).toFixed(2)}vw, ${Math.ceil(placement.w * MAX_SCALE)}px)`,
  };
}

function Sticker({ item, mediaBase, layout, placement }: { item: StickerItem; mediaBase: string; layout: Layout; placement: Placement }) {
  const c = item.content;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="item-photo" {...imageAttrs(mediaBase, c.mediaId, c.widths, layout, placement)} alt={c.alt} loading="lazy" decoding="async" draggable={false} style={{ objectFit: "contain" }} />;
}

export function mapUrl(c: MapItem["content"]) {
  return `${BASE_PATH}/map?lat=${c.lat.toFixed(4)}&lon=${c.lon.toFixed(4)}&zoom=${Math.round(c.zoom * 4) / 4}${c.borders ? "&borders=1" : ""}`;
}

function MapView({ item, layout }: { item: MapItem; layout: Layout }) {
  const c = item.content;
  return (
    <div className="map-item">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mapUrl(c)} alt={c.label ? `Map: ${c.label}` : "Map"} loading="lazy" decoding="async" draggable={false} />
      {c.label ? (
        <span className="map-label" style={{ fontSize: units(layout === "desktop" ? 14 : 11, CANVAS_WIDTH[layout]) }}>
          {c.label}
        </span>
      ) : null}
    </div>
  );
}

function Quote({ item, doc, layout, placement, interactive }: { item: QuoteItem; doc: SeasonDoc; layout: Layout; placement: Placement; interactive: boolean }) {
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
  const body = (
    <>
      <SafeMarkdown text={text} />
      {c.source && !c.binding ? <p className="item-quote-source">— {c.source}</p> : null}
    </>
  );
  const effect = c.effect && c.effect !== "none" && interactive ? c.effect : null;
  if (!effect) {
    return (
      <div className="item-quote" style={style}>
        {body}
      </div>
    );
  }
  // Generative type: screen readers read the plain copy; the moving copy is split
  // into letters by the motion layer (components/MotionLayer.tsx).
  return (
    <div className="item-quote" style={style}>
      <div className="sr-only">{body}</div>
      <div data-effect={effect} aria-hidden>
        {body}
      </div>
    </div>
  );
}

/** What an item shows, without its position. The editor and the public page share it. */
export function ItemContent(props: { item: Item; doc: SeasonDoc; mediaBase: string; interactive: boolean; layout: Layout; placement: Placement; cropping?: boolean }) {
  const { item, doc, mediaBase, interactive, layout, placement } = props;
  switch (item.type) {
    case "photo":
      return <Photo item={item} mediaBase={mediaBase} layout={layout} placement={placement} cropping={props.cropping} />;
    case "quote":
      return <Quote item={item} doc={doc} layout={layout} placement={placement} interactive={interactive} />;
    case "playlist":
      return <PlaylistCard item={item} interactive={interactive} />;
    case "sticker":
      return <Sticker item={item} mediaBase={mediaBase} layout={layout} placement={placement} />;
    case "map":
      return <MapView item={item} layout={layout} />;
    case "video": {
      const c = item.content;
      const posterWidth = c.posterWidths.find((w) => w >= Math.min(1280, placement.w * 2)) ?? c.posterWidths[c.posterWidths.length - 1];
      return <VideoView item={item} mediaBase={mediaBase} posterUrl={imageUrl(mediaBase, c.posterMediaId, posterWidth)} interactive={interactive} />;
    }
    case "voice_note":
      return <VoiceNoteView item={item} mediaBase={mediaBase} interactive={interactive} />;
    case "route":
      return <RouteView item={item} interactive={interactive} layout={layout} placement={placement} />;
    case "model_3d":
      return <ModelView content={item.content} mediaBase={mediaBase} live={interactive} poster={modelPoster(mediaBase, item.content)} />;
  }
}
