// Pure operations on a season document. Each returns a new document.
// Content is shared by both layouts; placement is separate per layout.
import { CANVAS_WIDTH, DESKTOP_WIDTH, MOBILE_WIDTH, type Item, type Layout, type Placement, type SeasonDoc } from "../../lib/schema.ts";

export type LayerMove = "front" | "forward" | "backward" | "back";

/** Mobile-to-desktop size ratio, about 0.27. */
export const MOBILE_FACTOR = MOBILE_WIDTH / DESKTOP_WIDTH;
const MOBILE_MARGIN = 24;
const MOBILE_GAP = 24;

export function placementOf(item: Item, layout: Layout): Placement | null {
  return layout === "desktop" ? item.desktop : item.mobile;
}

export function topZ(doc: SeasonDoc, layout: Layout = "desktop"): number {
  return doc.items.reduce((max, i) => Math.max(max, placementOf(i, layout)?.z ?? 0), 0);
}

const round = (n: number) => Math.round(n * 10) / 10;

/** The desktop placement shrunk onto the mobile canvas. */
export function scaledToMobile(p: Placement, item: Item): Placement {
  const textSize = item.type === "quote" ? round(item.content.size * MOBILE_FACTOR) : undefined;
  return {
    x: round(p.x * MOBILE_FACTOR),
    y: round(p.y * MOBILE_FACTOR),
    w: Math.max(1, round(p.w * MOBILE_FACTOR)),
    h: Math.max(1, round(p.h * MOBILE_FACTOR)),
    rotation: p.rotation,
    z: p.z,
    locked: false,
    ...(textSize ? { textSize } : {}),
  };
}

/** Converts a point between the two canvases. */
export function convertPoint(pt: { x: number; y: number }, from: Layout, to: Layout) {
  if (from === to) return pt;
  const f = CANVAS_WIDTH[to] / CANVAS_WIDTH[from];
  return { x: pt.x * f, y: pt.y * f };
}

/** Rule 1 of the mobile layout: start from the desktop layout, scaled down. */
export function scaledMobileLayout(doc: SeasonDoc): SeasonDoc {
  return {
    ...doc,
    mobileLayout: true,
    mobileHeight: Math.max(200, Math.round(doc.desktopHeight * MOBILE_FACTOR)),
    items: doc.items.map((i) => ({ ...i, mobile: scaledToMobile(i.desktop, i) })),
  };
}

/**
 * The other reset choice: every item in one column, full width, in reading order
 * (top to bottom, then left to right on desktop). Rotation is removed.
 */
export function singleColumnMobileLayout(doc: SeasonDoc): SeasonDoc {
  const width = MOBILE_WIDTH - 2 * MOBILE_MARGIN;
  const order = [...doc.items].sort((a, b) => a.desktop.y - b.desktop.y || a.desktop.x - b.desktop.x);
  let y = MOBILE_MARGIN;
  const placed = new Map<string, Placement>();
  order.forEach((item, index) => {
    const ratio = width / item.desktop.w;
    const h = round(item.desktop.h * ratio);
    const textSize = item.type === "quote" ? round(item.content.size * ratio) : undefined;
    placed.set(item.id, { x: MOBILE_MARGIN, y: round(y), w: width, h: Math.max(1, h), rotation: 0, z: index + 1, locked: false, ...(textSize ? { textSize } : {}) });
    y += h + MOBILE_GAP;
  });
  return {
    ...doc,
    mobileLayout: true,
    mobileHeight: Math.max(200, Math.round(y - MOBILE_GAP + MOBILE_MARGIN)),
    items: doc.items.map((i) => ({ ...i, mobile: placed.get(i.id)! })),
  };
}

/** Seasons from before phase 2 get their first mobile layout: the scaled desktop layout. */
export function withMobileLayout(doc: SeasonDoc): SeasonDoc {
  return doc.mobileLayout ? doc : scaledMobileLayout(doc);
}

/**
 * Adds an item on top in both layouts. Its mobile placement starts as the scaled
 * desktop placement, unless one is given.
 */
export function addItem(doc: SeasonDoc, item: Item): SeasonDoc {
  const desktop = { ...item.desktop, z: topZ(doc, "desktop") + 1 };
  const mobile = { ...(item.mobile ?? scaledToMobile(desktop, item)), z: topZ(doc, "mobile") + 1 };
  return { ...doc, items: [...doc.items, { ...item, desktop, mobile }] };
}

export function updateItem(doc: SeasonDoc, id: string, change: (item: Item) => Item): SeasonDoc {
  return { ...doc, items: doc.items.map((i) => (i.id === id ? change(i) : i)) };
}

export function setPlacement(doc: SeasonDoc, id: string, patch: Partial<Placement>, layout: Layout = "desktop"): SeasonDoc {
  return updateItem(doc, id, (i) => {
    if (layout === "desktop") return { ...i, desktop: { ...i.desktop, ...patch } };
    if (!i.mobile) return i;
    return { ...i, mobile: { ...i.mobile, ...patch } };
  });
}

/** Hides an item on mobile, or shows it again at its scaled desktop position. */
export function setMobileVisible(doc: SeasonDoc, id: string, visible: boolean): SeasonDoc {
  return updateItem(doc, id, (i) => {
    if (!visible) return { ...i, mobile: null };
    if (i.mobile) return i;
    return { ...i, mobile: { ...scaledToMobile(i.desktop, i), z: topZ(doc, "mobile") + 1 } };
  });
}

export function removeItem(doc: SeasonDoc, id: string): SeasonDoc {
  return {
    ...doc,
    coverItemId: doc.coverItemId === id ? null : doc.coverItemId,
    // Links to a removed route map go too.
    items: doc.items.filter((i) => i.id !== id).map((i) => (i.routeStop?.routeId === id ? { ...i, routeStop: null } : i)),
  };
}

export function duplicateItem(doc: SeasonDoc, id: string, newId: string, layout: Layout = "desktop"): SeasonDoc {
  const source = doc.items.find((i) => i.id === id);
  if (!source) return doc;
  const copy = structuredClone(source) as Item;
  copy.id = newId;
  const shift = (p: Placement, d: number): Placement => ({ ...p, x: p.x + d, y: p.y + d, locked: false });
  copy.desktop = shift(copy.desktop, layout === "desktop" ? 24 : 0);
  copy.mobile = copy.mobile ? shift(copy.mobile, layout === "mobile" ? 12 : 0) : null;
  const added = addItem(doc, { ...copy, mobile: copy.mobile ?? scaledToMobile(copy.desktop, copy) });
  // A copy of an item hidden on mobile stays hidden there.
  return source.mobile ? added : setMobileVisible(added, newId, false);
}

/** Changes the layer order in one layout, then renumbers z as 1..n so values stay small. */
export function moveLayer(doc: SeasonDoc, id: string, move: LayerMove, layout: Layout = "desktop"): SeasonDoc {
  const visible = doc.items.filter((i) => placementOf(i, layout));
  const order = [...visible].sort((a, b) => placementOf(a, layout)!.z - placementOf(b, layout)!.z).map((i) => i.id);
  const at = order.indexOf(id);
  if (at < 0) return doc;
  order.splice(at, 1);
  const to = move === "front" ? order.length : move === "back" ? 0 : move === "forward" ? Math.min(at + 1, order.length) : Math.max(at - 1, 0);
  order.splice(to, 0, id);
  const z = new Map(order.map((itemId, index) => [itemId, index + 1]));
  return {
    ...doc,
    items: doc.items.map((i) => {
      const p = placementOf(i, layout);
      if (!p) return i;
      const next = { ...p, z: z.get(i.id)! };
      return layout === "desktop" ? { ...i, desktop: next } : { ...i, mobile: next };
    }),
  };
}

/** Rotation kept in (-180, 180]. */
export function normalizeRotation(deg: number): number {
  let r = deg % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.round(r * 100) / 100;
}

/** Rounds geometry to whole design units after a gesture (1 unit is 1 px on a 1440 px desktop screen). */
export function roundPlacement(p: Placement): Placement {
  return { ...p, x: Math.round(p.x), y: Math.round(p.y), w: Math.max(1, Math.round(p.w)), h: Math.max(1, Math.round(p.h)), rotation: normalizeRotation(p.rotation) };
}
