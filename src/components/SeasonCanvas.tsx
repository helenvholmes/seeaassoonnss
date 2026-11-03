import { DESKTOP_WIDTH, MAX_SCALE, type SeasonDoc } from "@/lib/schema";
import { placementStyle } from "./geometry";
import { ItemContent } from "./ItemContent";

/**
 * The public view of a season: the editor canvas without the controls.
 * Phase 1 shows the desktop layout at every width, scaled to fit.
 */
export function SeasonCanvas({ doc, mediaBase }: { doc: SeasonDoc; mediaBase: string }) {
  const items = [...doc.items].sort((a, b) => a.desktop.z - b.desktop.z);
  return (
    <div
      className="canvas"
      style={{
        maxWidth: DESKTOP_WIDTH * MAX_SCALE,
        aspectRatio: `${DESKTOP_WIDTH} / ${doc.desktopHeight}`,
        background: doc.background.value,
      }}
    >
      {items.map((item) => (
        <div key={item.id} className={`item item-${item.type}`} style={placementStyle(item.desktop, doc.desktopHeight)}>
          <ItemContent item={item} doc={doc} mediaBase={mediaBase} interactive />
        </div>
      ))}
    </div>
  );
}
