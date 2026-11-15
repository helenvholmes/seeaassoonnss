import type { PhotoItem, SeasonDoc } from "./schema.ts";

/** What the full-screen viewer needs to show one photo. */
export type LightboxPhoto = Pick<PhotoItem["content"], "mediaId" | "widths" | "alt" | "width" | "height">;

/**
 * The season's photos for the full-screen viewer, in reading order on the desktop
 * layout: top to bottom, then left to right for photos that start at the same height.
 */
export function lightboxPhotos(doc: SeasonDoc): LightboxPhoto[] {
  return doc.items
    .filter((i): i is PhotoItem => i.type === "photo")
    .sort((a, b) => a.desktop.y - b.desktop.y || a.desktop.x - b.desktop.x)
    .map(({ content: { mediaId, widths, alt, width, height } }) => ({ mediaId, widths, alt, width, height }));
}

/** Whether a key press happened while the visitor was typing, so shortcuts should ignore it. */
export function isTyping(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).closest !== "function") return false;
  const el = target as HTMLElement;
  if (el.isContentEditable) return true;
  return !!el.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
}
