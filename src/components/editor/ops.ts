// Pure operations on a season document. Each returns a new document.
// Content is shared by both layouts; placement is separate per layout.
import { CANVAS_WIDTH, DESKTOP_WIDTH, MOBILE_WIDTH, type Item, type Layout, type Placement, type RouteContent, type Scatter, type SeasonDoc } from "../../lib/schema.ts";
import { bottomOf } from "../../lib/layout.ts";
import { ROUTE_SCREEN_UNITS, stopFractions } from "../../lib/route.ts";

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

// ---------- automatic mobile layout ----------

const AUTO_CONTENT = MOBILE_WIDTH - 2 * MOBILE_MARGIN;
/** Desktop width below which an item counts as small, and pairs up on mobile. */
const AUTO_SMALL = 400;
/** A route band's sticky map takes about one phone screen; items scroll over it below this. */
const AUTO_ROUTE_MAP = 600;
const DECORATIONS = new Set<Item["type"]>(["sticker", "shape"]);

const area = (p: Placement) => p.w * p.h;
function overlapArea(a: Placement, b: Placement) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * The editor's guess at a mobile layout, built from the desktop layout:
 * - Items are read in rows: items that sit side by side on desktop form one row,
 *   rows go top to bottom and items in a row left to right.
 * - Big items go full width; small ones (under 400 desktop units wide) pair up two
 *   per line. Quotes keep their line breaks: text scales with the box.
 * - A sticker or shape sitting mostly on a bigger item stays attached to it, at the
 *   same spot and scale.
 * - Items beside a route map go inside its band, below the pinned map, so they
 *   scroll over it as on desktop.
 * Every item is shown; layers follow desktop.
 */
export function autoMobileLayout(doc: SeasonDoc): SeasonDoc {
  const placed = new Map<string, Placement>();
  const items = doc.items;

  // Decorations attached to the item they sit on most.
  const host = new Map<string, Item>();
  for (const it of items) {
    if (!DECORATIONS.has(it.type)) continue;
    let best: Item | null = null;
    let bestShare = 0.5;
    for (const other of items) {
      if (other === it || other.type === "route" || DECORATIONS.has(other.type) || area(other.desktop) <= area(it.desktop)) continue;
      const share = overlapArea(it.desktop, other.desktop) / area(it.desktop);
      if (share >= bestShare) {
        best = other;
        bestShare = share;
      }
    }
    if (best) host.set(it.id, best);
  }

  // Rows, in reading order.
  const flow = items.filter((i) => !host.has(i.id)).sort((a, b) => a.desktop.y - b.desktop.y || a.desktop.x - b.desktop.x);
  const rows: Item[][] = [];
  let rowBottom = -Infinity;
  for (const it of flow) {
    const p = it.desktop;
    // Joins the row when it starts above the middle of the row's lowest-reaching item.
    if (rows.length && p.y < rowBottom) {
      rows[rows.length - 1].push(it);
      rowBottom = Math.max(rowBottom, p.y + p.h / 2);
    } else {
      rows.push([it]);
      rowBottom = p.y + p.h / 2;
    }
  }

  let y = MOBILE_MARGIN;
  const put = (it: Item, x: number, w: number, top: number, keepRotation: boolean) => {
    const ratio = w / it.desktop.w;
    const h = Math.max(1, round(it.desktop.h * ratio));
    const textSize = it.type === "quote" ? round(it.content.size * ratio) : undefined;
    placed.set(it.id, { x: round(x), y: round(top), w: round(w), h, rotation: keepRotation ? it.desktop.rotation : 0, z: it.desktop.z, locked: false, ...(textSize ? { textSize } : {}) });
    return h;
  };
  /** Lays out items in lines from `top`; returns the bottom. */
  const lines = (row: Item[], top: number) => {
    const ordered = [...row].sort((a, b) => a.desktop.x - b.desktop.x);
    let cursor = top;
    for (let i = 0; i < ordered.length; i++) {
      const it = ordered[i];
      const small = it.desktop.w < AUTO_SMALL && it.type !== "quote";
      const next = ordered[i + 1];
      if (small && next && next.desktop.w < AUTO_SMALL && next.type !== "quote") {
        const half = (AUTO_CONTENT - MOBILE_GAP / 2) / 2;
        const h = Math.max(put(it, MOBILE_MARGIN, half, cursor, true), put(next, MOBILE_MARGIN + half + MOBILE_GAP / 2, half, cursor, true));
        cursor += h + MOBILE_GAP;
        i++;
      } else if (small) {
        // A lone small item keeps a modest size, centered.
        const w = Math.min(AUTO_CONTENT, Math.max(120, it.desktop.w * 0.6));
        cursor += put(it, MOBILE_MARGIN + (AUTO_CONTENT - w) / 2, w, cursor, true) + MOBILE_GAP;
      } else {
        cursor += put(it, MOBILE_MARGIN, AUTO_CONTENT, cursor, false) + MOBILE_GAP;
      }
    }
    return cursor;
  };

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const route = row.find((i) => i.type === "route");
    if (!route) {
      y = lines(row, y);
      continue;
    }
    // A route band: full width, with its row and any later rows that start inside
    // the band on desktop laid out below the pinned map.
    const inside = row.filter((i) => i !== route);
    while (r + 1 < rows.length && rows[r + 1][0].desktop.y < route.desktop.y + route.desktop.h) inside.push(...rows[++r]);
    const top = y;
    const bottom = inside.length ? lines(inside, top + AUTO_ROUTE_MAP) : top;
    const h = Math.max(round(route.desktop.h * MOBILE_FACTOR * 3.3), bottom - top + AUTO_ROUTE_MAP / 2);
    placed.set(route.id, { x: 0, y: round(top), w: MOBILE_WIDTH, h: round(h), rotation: 0, z: route.desktop.z, locked: false });
    y = top + h + MOBILE_GAP;
  }

  // Attached decorations follow their host.
  for (const [id, h] of host) {
    const it = items.find((i) => i.id === id)!;
    const hp = placed.get(h.id);
    if (!hp) continue;
    const k = hp.w / h.desktop.w;
    placed.set(id, {
      x: round(hp.x + (it.desktop.x - h.desktop.x) * k),
      y: round(hp.y + (it.desktop.y - h.desktop.y) * k),
      w: Math.max(1, round(it.desktop.w * k)),
      h: Math.max(1, round(it.desktop.h * k)),
      rotation: it.desktop.rotation,
      z: it.desktop.z,
      locked: false,
    });
  }

  const bottom = Math.max(MOBILE_MARGIN, ...[...placed.values()].map((p) => p.y + p.h));
  return {
    ...doc,
    mobileLayout: true,
    mobileHeight: Math.max(200, Math.round(bottom + MOBILE_MARGIN)),
    items: items.map((i) => ({ ...i, mobile: placed.get(i.id)! })),
  };
}

/** True when two documents differ only in their mobile layout (the owner arranged mobile by hand). */
export function onlyMobileDiffers(a: SeasonDoc, b: SeasonDoc): boolean {
  const strip = (d: SeasonDoc) => JSON.stringify({ ...d, mobileHeight: 0, mobileAuto: null, items: d.items.map((i) => ({ ...i, mobile: null })) });
  return strip(a) === strip(b);
}

/** True when the mobile layouts of two documents are the same. */
export function sameMobileLayout(a: SeasonDoc, b: SeasonDoc): boolean {
  return a.mobileHeight === b.mobileHeight && a.items.length === b.items.length && a.items.every((i, n) => JSON.stringify(i.mobile) === JSON.stringify(b.items[n].mobile));
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

/**
 * Moves several items together by (dx, dy) design units in one layout, rounded to
 * whole units. Locked items, and items hidden in that layout, stay where they are.
 */
export function moveItems(doc: SeasonDoc, ids: readonly string[], dx: number, dy: number, layout: Layout = "desktop"): SeasonDoc {
  const set = new Set(ids);
  return {
    ...doc,
    items: doc.items.map((i) => {
      const p = set.has(i.id) ? placementOf(i, layout) : null;
      if (!p || p.locked) return i;
      const moved = { ...p, x: Math.round(p.x + dx), y: Math.round(p.y + dy) };
      return layout === "desktop" ? { ...i, desktop: moved } : { ...i, mobile: moved };
    }),
  };
}

/**
 * Replaces a route's stops. `order[newIndex]` is the stop's old index, or -1 for a
 * new stop. Items linked to a stop follow it to its new number; links to removed
 * stops are cleared.
 */
export function setRouteStops(doc: SeasonDoc, routeId: string, stops: RouteContent["stops"], order: readonly number[]): SeasonDoc {
  return {
    ...doc,
    items: doc.items.map((i) => {
      if (i.id === routeId && i.type === "route") return { ...i, content: { ...i.content, stops } };
      if (i.routeStop?.routeId !== routeId) return i;
      const index = order.indexOf(i.routeStop.index);
      return { ...i, routeStop: index < 0 ? null : { routeId, index } };
    }),
  };
}

/**
 * Where on the page (design units) an item's top must be for it to reach the middle
 * of the screen just as the route's line reaches stop `index`. Null when the band is
 * no taller than a screen (the line then draws with no pinned scroll to line up with).
 */
export function routeStopTop(route: Item & { type: "route" }, layout: Layout, index: number): number | null {
  const p = placementOf(route, layout);
  if (!p) return null;
  const screen = ROUTE_SCREEN_UNITS[layout];
  const travel = p.h - screen;
  if (travel <= 0) return null;
  const start = Math.min(0.9, Math.max(0, route.content.drawStart ?? 0));
  const at = stopFractions(route.content)[index] ?? 0;
  return round(p.y + screen / 2 + (start + at * (1 - start)) * travel);
}

/**
 * Moves an item linked to a route stop up or down, in every layout it shows in,
 * so it reaches mid-screen as the line reaches its stop. The map stays still; the
 * text comes to it.
 */
export function alignToRouteStop(doc: SeasonDoc, id: string): SeasonDoc {
  const item = doc.items.find((i) => i.id === id);
  const link = item?.routeStop;
  const route = link && doc.items.find((i) => i.id === link.routeId);
  if (!item || !link || route?.type !== "route") return doc;
  const moved = { ...item };
  for (const layout of ["desktop", "mobile"] as const) {
    const p = placementOf(item, layout);
    const y = routeStopTop(route, layout, link.index);
    if (!p || y === null || p.locked) continue;
    if (layout === "desktop") moved.desktop = { ...p, y };
    else moved.mobile = { ...p, y };
  }
  return { ...doc, items: doc.items.map((i) => (i.id === id ? moved : i)) };
}

/** Lines up every item linked to a stop on this route. */
export function alignAllToRoute(doc: SeasonDoc, routeId: string): SeasonDoc {
  return doc.items.filter((i) => i.routeStop?.routeId === routeId).reduce((d, i) => alignToRouteStop(d, i.id), doc);
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

/** Copies an item on top of the others. With `offset`, the copy sits a little down and right of the original; without, exactly on it. */
export function duplicateItem(doc: SeasonDoc, id: string, newId: string, layout: Layout = "desktop", offset = true): SeasonDoc {
  const source = doc.items.find((i) => i.id === id);
  if (!source) return doc;
  const copy = structuredClone(source) as Item;
  copy.id = newId;
  const shift = (p: Placement, d: number): Placement => ({ ...p, x: p.x + d, y: p.y + d, locked: false });
  copy.desktop = shift(copy.desktop, offset && layout === "desktop" ? 24 : 0);
  copy.mobile = copy.mobile ? shift(copy.mobile, offset && layout === "mobile" ? 12 : 0) : null;
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

// ---------- seeded random placement ----------

/** A small, fast seeded random generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A 32-bit hash of a text (FNV-1a), so each item gets its own random stream. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Item types whose size the random scale changes. Others keep their size and only move. */
const SCALED = new Set<Item["type"]>(["photo", "video", "sticker", "model_3d", "shape"]);
/** The width a scale of 1 means: the width new photos get. */
export const SCATTER_BASE_WIDTH: Record<Layout, number> = { desktop: 360, mobile: 180 };

/**
 * Places every unlocked item of one layout at a random position, and gives
 * photos, videos, stickers and 3D models a random width between
 * minScale and maxScale times the base width (keeping their aspect ratio).
 * Locked items, hidden items and route maps stay where they are. Each item's
 * random numbers come from the seed and the item's id, so the same seed gives
 * the same layout.
 *
 * Items spread over the page's minimum length, or down to the lowest item that
 * stays put if that is lower, and further when they would cover more than
 * SCATTER_COVERAGE of that area: with many items the page grows so they do not
 * pile up. The area depends only on the items' sizes after scaling, never on
 * where they happen to be, so scattering twice with one seed gives the same result.
 */
export const SCATTER_COVERAGE = 0.35;

/** Each scattered item's random numbers: two for its position, and its new size. */
function scatterDraw(item: Item, p: Placement, layout: Layout, scatter: Scatter) {
  const lo = Math.min(scatter.minScale, scatter.maxScale);
  const hi = Math.max(scatter.minScale, scatter.maxScale);
  const rand = seededRandom(hash(`${scatter.seed}:${layout}:${item.id}`));
  let { w, h } = p;
  if (SCALED.has(item.type)) {
    w = SCATTER_BASE_WIDTH[layout] * (lo + (hi - lo) * rand());
    h = w * (p.h / p.w);
  }
  return { w, h, rx: rand(), ry: rand() };
}

const scatters = (item: Item, p: Placement): boolean => !p.locked && item.type !== "route";

export function scatterArea(doc: SeasonDoc, layout: Layout, scatter: Scatter = doc.scatter): { width: number; height: number } {
  const width = CANVAS_WIDTH[layout];
  let height = layout === "desktop" ? doc.desktopHeight : doc.mobileHeight;
  let covered = 0;
  for (const item of doc.items) {
    const p = placementOf(item, layout);
    if (!p) continue;
    if (scatters(item, p)) {
      const { w, h } = scatterDraw(item, p, layout, scatter);
      covered += Math.min(w, width) * h;
    } else {
      height = Math.max(height, bottomOf(p));
      if (item.type !== "route") covered += p.w * p.h;
    }
  }
  return { width, height: Math.ceil(Math.max(height, covered / (width * SCATTER_COVERAGE))) };
}

export function scatterLayout(doc: SeasonDoc, layout: Layout, scatter: Scatter): SeasonDoc {
  const { width, height } = scatterArea(doc, layout, scatter);
  return {
    ...doc,
    scatter,
    items: doc.items.map((item) => {
      const p = placementOf(item, layout);
      if (!p || !scatters(item, p)) return item;
      const { w, h, rx, ry } = scatterDraw(item, p, layout, scatter);
      // Keep the item on the page when it is narrower or shorter than the page.
      const x = (width - Math.min(w, width)) * rx;
      const y = (height - Math.min(h, height)) * ry;
      const next = roundPlacement({ ...p, x, y, w, h });
      return layout === "desktop" ? { ...item, desktop: next } : { ...item, mobile: next };
    }),
  };
}
