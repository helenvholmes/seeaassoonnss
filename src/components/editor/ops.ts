// Pure operations on a season document. Each returns a new document.
import type { Item, Placement, SeasonDoc } from "../../lib/schema.ts";

export type LayerMove = "front" | "forward" | "backward" | "back";

export function topZ(doc: SeasonDoc): number {
  return doc.items.reduce((max, i) => Math.max(max, i.desktop.z), 0);
}

export function addItem(doc: SeasonDoc, item: Item): SeasonDoc {
  const placed = { ...item, desktop: { ...item.desktop, z: topZ(doc) + 1 } };
  return { ...doc, items: [...doc.items, placed] };
}

export function updateItem(doc: SeasonDoc, id: string, change: (item: Item) => Item): SeasonDoc {
  return { ...doc, items: doc.items.map((i) => (i.id === id ? change(i) : i)) };
}

export function setPlacement(doc: SeasonDoc, id: string, patch: Partial<Placement>): SeasonDoc {
  return updateItem(doc, id, (i) => ({ ...i, desktop: { ...i.desktop, ...patch } }));
}

export function removeItem(doc: SeasonDoc, id: string): SeasonDoc {
  return {
    ...doc,
    coverItemId: doc.coverItemId === id ? null : doc.coverItemId,
    items: doc.items.filter((i) => i.id !== id),
  };
}

export function duplicateItem(doc: SeasonDoc, id: string, newId: string, offset = 24): SeasonDoc {
  const source = doc.items.find((i) => i.id === id);
  if (!source) return doc;
  const copy = structuredClone(source) as Item;
  copy.id = newId;
  copy.desktop = { ...copy.desktop, x: copy.desktop.x + offset, y: copy.desktop.y + offset, locked: false };
  copy.mobile = null;
  return addItem(doc, copy);
}

/** Changes the layer order, then renumbers z as 1..n so values stay small. */
export function moveLayer(doc: SeasonDoc, id: string, move: LayerMove): SeasonDoc {
  const order = [...doc.items].sort((a, b) => a.desktop.z - b.desktop.z).map((i) => i.id);
  const at = order.indexOf(id);
  if (at < 0) return doc;
  order.splice(at, 1);
  const to = move === "front" ? order.length : move === "back" ? 0 : move === "forward" ? Math.min(at + 1, order.length) : Math.max(at - 1, 0);
  order.splice(to, 0, id);
  const z = new Map(order.map((itemId, index) => [itemId, index + 1]));
  return { ...doc, items: doc.items.map((i) => ({ ...i, desktop: { ...i.desktop, z: z.get(i.id)! } })) };
}

/** Rotation kept in (-180, 180]. */
export function normalizeRotation(deg: number): number {
  let r = deg % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return Math.round(r * 100) / 100;
}

/** Rounds geometry to 0.1 unit so saved documents stay readable. */
export function roundPlacement(p: Placement): Placement {
  const r = (n: number) => Math.round(n * 10) / 10;
  return { ...p, x: r(p.x), y: r(p.y), w: Math.max(1, r(p.w)), h: Math.max(1, r(p.h)), rotation: normalizeRotation(p.rotation) };
}
