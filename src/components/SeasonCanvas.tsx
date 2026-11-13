import { withMobileLayout } from "@/components/editor/ops";
import { CANVAS_WIDTH, MAX_SCALE, type Layout, type SeasonDoc } from "@/lib/schema";
import { pageHeight } from "@/lib/layout";
import { placementStyle } from "./geometry";
import { ItemContent, modelPoster } from "./ItemContent";
import { BackgroundLayer } from "./BackgroundLayer";
import { MotionLayer } from "./MotionLayer";

/** One layout of a season: the editor canvas without the controls. */
export function LayoutCanvas({ doc, mediaBase, layout, className = "" }: { doc: SeasonDoc; mediaBase: string; layout: Layout; className?: string }) {
  const width = CANVAS_WIDTH[layout];
  const height = pageHeight(doc, layout);
  const items = doc.items
    .map((item) => ({ item, p: layout === "desktop" ? item.desktop : item.mobile }))
    .filter((x): x is { item: typeof x.item; p: NonNullable<typeof x.p> } => x.p !== null)
    .sort((a, b) => a.p.z - b.p.z);
  return (
    <div
      className={`canvas canvas-${layout} ${className}`}
      style={{ maxWidth: width * MAX_SCALE, aspectRatio: `${width} / ${height}`, background: doc.background.value }}
    >
      {doc.backgroundLayer ? (
        <BackgroundLayer layer={doc.backgroundLayer} mediaBase={mediaBase} live poster={doc.backgroundLayer.kind === "model" ? modelPoster(mediaBase, doc.backgroundLayer.model) : null} />
      ) : null}
      {items.map(({ item, p }) => (
        <div
          key={item.id}
          className={`item item-${item.type}`}
          style={placementStyle(p, height, width)}
          data-route-stop={item.routeStop ? `${item.routeStop.routeId}:${item.routeStop.index}` : undefined}
          data-follow={item.follow ? item.follow : undefined}
        >
          <ItemContent item={item} doc={doc} mediaBase={mediaBase} interactive layout={layout} placement={p} />
        </div>
      ))}
      {hasMotion(doc) ? <MotionLayer canvasWidth={width} /> : null}
    </div>
  );
}

/** Whether any item follows the cursor or has generative type. */
function hasMotion(doc: SeasonDoc) {
  return doc.items.some((i) => !!i.follow || (i.type === "quote" && !!i.content.effect && i.content.effect !== "none"));
}

/**
 * The public view: both layouts are in the HTML, and CSS shows one by screen width
 * (breakpoint 960 px, see globals.css). Lazy images in the hidden layout never load.
 */
export function SeasonCanvas({ doc, mediaBase }: { doc: SeasonDoc; mediaBase: string }) {
  const full = withMobileLayout(doc);
  return (
    <>
      <LayoutCanvas doc={full} mediaBase={mediaBase} layout="desktop" className="only-desktop" />
      <LayoutCanvas doc={full} mediaBase={mediaBase} layout="mobile" className="only-mobile" />
    </>
  );
}
