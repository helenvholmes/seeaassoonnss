// Color helpers for the editor's color picker.
import type { SeasonDoc } from "./schema.ts";

export type Hsv = { h: number; s: number; v: number };

export const HEX = /^#[0-9a-f]{6}$/i;

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

/** Every color the season already uses, most used first. */
export function docColors(doc: SeasonDoc): string[] {
  const count = new Map<string, number>();
  const add = (c: string | null | undefined) => {
    if (c && HEX.test(c)) count.set(c.toLowerCase(), (count.get(c.toLowerCase()) ?? 0) + 1);
  };
  add(doc.background.value);
  for (const i of doc.items) {
    if (i.type === "quote" || i.type === "route") add(i.content.color);
    if (i.type === "shape") {
      add(i.content.fill);
      if (i.content.strokeWidth > 0) add(i.content.stroke);
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}
