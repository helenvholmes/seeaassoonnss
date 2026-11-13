import type { CSSProperties } from "react";
import { DESKTOP_WIDTH, type Placement } from "@/lib/schema";

/**
 * Places an item as percentages of the canvas, so the whole layout scales with the
 * canvas width and overlaps stay exactly as placed. Text sizes use cqw (container
 * query width) for the same reason.
 */
export function placementStyle(p: Placement, canvasHeight: number, canvasWidth = DESKTOP_WIDTH): CSSProperties {
  return {
    position: "absolute",
    left: `${(p.x / canvasWidth) * 100}%`,
    top: `${(p.y / canvasHeight) * 100}%`,
    width: `${(p.w / canvasWidth) * 100}%`,
    height: `${(p.h / canvasHeight) * 100}%`,
    transform: p.rotation ? `rotate(${p.rotation}deg)` : undefined,
    zIndex: p.z,
  };
}

/** A length in design units, as a CSS length that scales with the canvas. */
export function units(value: number, canvasWidth = DESKTOP_WIDTH): string {
  return `${(value / canvasWidth) * 100}cqw`;
}
