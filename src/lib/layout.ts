// Page length: a season's canvas grows to fit its lowest item, with no upper limit.
import { CANVAS_WIDTH, type Item, type Layout, type Placement, type SeasonDoc } from "./schema.ts";

/** Empty space kept below the lowest item, in design units. */
export const BOTTOM_SPACE: Record<Layout, number> = { desktop: 120, mobile: 40 };

/** The lowest point of a placement, including the corners of a rotated box. */
export function bottomOf(p: Placement): number {
  const rad = (p.rotation * Math.PI) / 180;
  const halfHeight = (Math.abs(p.w * Math.sin(rad)) + Math.abs(p.h * Math.cos(rad))) / 2;
  return p.y + p.h / 2 + halfHeight;
}

/** The page length for a layout: the lowest item plus some space, never less than the minimum height. */
export function pageHeight(doc: SeasonDoc, layout: Layout): number {
  const minimum = layout === "desktop" ? doc.desktopHeight : doc.mobileHeight;
  let lowest = 0;
  for (const item of doc.items as Item[]) {
    const p = layout === "desktop" ? item.desktop : item.mobile;
    if (p) lowest = Math.max(lowest, bottomOf(p));
  }
  return Math.ceil(Math.max(minimum, lowest > 0 ? lowest + BOTTOM_SPACE[layout] : 0));
}

/** "// leafy greens": the lowercase // title format, without doubling an existing //. */
export function slashTitle(title: string): string {
  const t = title.trim() || "untitled";
  return t.startsWith("//") ? t : `// ${t}`;
}

/** "2025-10" → "october 2025" (lowercase, like season titles). */
export function formatMonth(month: string | null | undefined): string {
  if (!month) return "";
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en", { month: "long", timeZone: "UTC" }).toLowerCase();
  return `${name} ${y}`;
}

export const canvasWidth = (layout: Layout) => CANVAS_WIDTH[layout];
