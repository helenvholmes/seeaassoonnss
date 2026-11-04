// Alt-key measuring, as in Figma: distances from the selected item to the page
// edges or to a hovered item, and whether it is centered. Pure geometry in design
// units, so it can be tested; MeasureOverlay draws the result.
import type { Placement } from "../../lib/schema.ts";

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance shown next to the line, in design units. */
  label: string;
}

export interface CenterGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
  /** True when the selection is exactly centered on this guide. */
  centered: boolean;
}

export interface Measurement {
  selection: Box;
  target: Box | null;
  lines: Line[];
  guides: CenterGuide[];
}

/** Within half a unit counts as centered. */
const CENTER_TOLERANCE = 0.5;
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/** The axis-aligned box around a placement, including the corners of a rotated item. */
export function boxOf(p: Placement): Box {
  const rad = (p.rotation * Math.PI) / 180;
  const halfW = (Math.abs(p.w * Math.cos(rad)) + Math.abs(p.h * Math.sin(rad))) / 2;
  const halfH = (Math.abs(p.w * Math.sin(rad)) + Math.abs(p.h * Math.cos(rad))) / 2;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  return { x0: cx - halfW, y0: cy - halfH, x1: cx + halfW, y1: cy + halfH };
}

const mid = (a: number, b: number) => (a + b) / 2;
const centerX = (b: Box) => mid(b.x0, b.x1);
const centerY = (b: Box) => mid(b.y0, b.y1);

/** Distances from the selection to the edges of a box that contains it (the page, or a larger item). */
function inside(a: Box, outer: Box): Line[] {
  const cy = centerY(a);
  const cx = centerX(a);
  const lines: Line[] = [];
  if (a.x0 > outer.x0) lines.push({ x1: outer.x0, y1: cy, x2: a.x0, y2: cy, label: fmt(a.x0 - outer.x0) });
  if (a.x1 < outer.x1) lines.push({ x1: a.x1, y1: cy, x2: outer.x1, y2: cy, label: fmt(outer.x1 - a.x1) });
  if (a.y0 > outer.y0) lines.push({ x1: cx, y1: outer.y0, x2: cx, y2: a.y0, label: fmt(a.y0 - outer.y0) });
  if (a.y1 < outer.y1) lines.push({ x1: cx, y1: a.y1, x2: cx, y2: outer.y1, label: fmt(outer.y1 - a.y1) });
  return lines;
}

/** Gaps between two boxes along each axis where they do not overlap. */
function between(a: Box, b: Box): Line[] {
  const lines: Line[] = [];
  // Horizontal gap, drawn at the middle of the vertical overlap (or the selection's center).
  const yOverlap0 = Math.max(a.y0, b.y0);
  const yOverlap1 = Math.min(a.y1, b.y1);
  const y = yOverlap0 < yOverlap1 ? mid(yOverlap0, yOverlap1) : centerY(a);
  if (b.x0 >= a.x1) lines.push({ x1: a.x1, y1: y, x2: b.x0, y2: y, label: fmt(b.x0 - a.x1) });
  else if (a.x0 >= b.x1) lines.push({ x1: b.x1, y1: y, x2: a.x0, y2: y, label: fmt(a.x0 - b.x1) });
  // Vertical gap.
  const xOverlap0 = Math.max(a.x0, b.x0);
  const xOverlap1 = Math.min(a.x1, b.x1);
  const x = xOverlap0 < xOverlap1 ? mid(xOverlap0, xOverlap1) : centerX(a);
  if (b.y0 >= a.y1) lines.push({ x1: x, y1: a.y1, x2: x, y2: b.y0, label: fmt(b.y0 - a.y1) });
  else if (a.y0 >= b.y1) lines.push({ x1: x, y1: b.y1, x2: x, y2: a.y0, label: fmt(a.y0 - b.y1) });
  return lines;
}

const contains = (outer: Box, a: Box) => a.x0 >= outer.x0 && a.x1 <= outer.x1 && a.y0 >= outer.y0 && a.y1 <= outer.y1;

/**
 * What to show while Alt is held. Against a hovered item: the gaps between them, or
 * the distances to its edges when one contains the other. Against the page: the
 * distances to its edges. Center guides show whether the selection is centered on
 * the page (horizontally) and on the hovered item (both ways).
 */
export function measure(selected: Placement, page: { width: number; height: number }, hovered: Placement | null): Measurement {
  const a = boxOf(selected);
  const pageBox = { x0: 0, y0: 0, x1: page.width, y1: page.height };
  const guides: CenterGuide[] = [];
  const pageCenter = page.width / 2;
  guides.push({ axis: "x", at: pageCenter, from: 0, to: page.height, centered: Math.abs(centerX(a) - pageCenter) <= CENTER_TOLERANCE });

  if (!hovered) return { selection: a, target: null, lines: inside(a, pageBox), guides };

  const b = boxOf(hovered);
  const lines = contains(b, a) ? inside(a, b) : contains(a, b) ? inside(b, a) : between(a, b);
  const top = Math.min(a.y0, b.y0);
  const bottom = Math.max(a.y1, b.y1);
  const left = Math.min(a.x0, b.x0);
  const right = Math.max(a.x1, b.x1);
  if (Math.abs(centerX(a) - centerX(b)) <= CENTER_TOLERANCE) guides.push({ axis: "x", at: centerX(b), from: top, to: bottom, centered: true });
  if (Math.abs(centerY(a) - centerY(b)) <= CENTER_TOLERANCE) guides.push({ axis: "y", at: centerY(b), from: left, to: right, centered: true });
  return { selection: a, target: b, lines, guides };
}

/**
 * Exact snapping in design units. Moveable snaps in whole screen pixels, which can
 * leave an item a fraction of a unit off (569.9 instead of 570). After a snapped
 * move, this nudges the item onto the nearest page or item edge/center within
 * `tolerance` units, separately on each axis.
 */
export function refineSnap(p: Placement, page: { width: number; height: number }, others: Placement[], tolerance = 1.5): { x: number; y: number } {
  const a = boxOf(p);
  const xs = [0, page.width / 2, page.width];
  const ys = [0, page.height];
  for (const o of others) {
    const b = boxOf(o);
    xs.push(b.x0, centerX(b), b.x1);
    ys.push(b.y0, centerY(b), b.y1);
  }
  const nearest = (own: number[], targets: number[]) => {
    let best = 0;
    let bestAbs = Infinity;
    for (const v of own) {
      for (const t of targets) {
        const d = t - v;
        if (Math.abs(d) <= tolerance && Math.abs(d) < bestAbs) {
          best = d;
          bestAbs = Math.abs(d);
        }
      }
    }
    return best;
  };
  return {
    x: p.x + nearest([a.x0, centerX(a), a.x1], xs),
    y: p.y + nearest([a.y0, centerY(a), a.y1], ys),
  };
}
