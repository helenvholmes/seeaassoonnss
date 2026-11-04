// Photo cropping, as in Figma: the photo covers its box, may be zoomed, and is
// shifted to choose which part shows. Positions are fractions of the box.
import { MAX_CROP_ZOOM, type Crop } from "./schema.ts";

export const NO_CROP: Crop = { x: 0.5, y: 0.5, zoom: 1 };

export interface Rect {
  /** Fractions of the box: 0 = box's left/top edge, 1 = its width/height. */
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Where the photo sits relative to its box. At zoom 1 it just covers the box; x/y
 * move it so that x = 0 shows its left edge and x = 1 its right edge. Because the
 * photo always covers the box, the box never shows an empty gap.
 */
export function photoRect(imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, crop: Crop | null | undefined): Rect {
  const c = crop ?? NO_CROP;
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;
  const coverW = imageRatio > boxRatio ? imageRatio / boxRatio : 1;
  const coverH = imageRatio > boxRatio ? 1 : boxRatio / imageRatio;
  const width = coverW * c.zoom;
  const height = coverH * c.zoom;
  return { left: c.x * (1 - width), top: c.y * (1 - height), width, height };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Moves the photo by a pointer movement of (dx, dy), given as fractions of the box. */
export function panCrop(crop: Crop | null | undefined, rect: Rect, dx: number, dy: number): Crop {
  const c = crop ?? NO_CROP;
  // The photo moves with the pointer; x grows as the photo moves left.
  const spareW = rect.width - 1;
  const spareH = rect.height - 1;
  return {
    zoom: c.zoom,
    x: spareW > 1e-9 ? clamp(c.x - dx / spareW, 0, 1) : c.x,
    y: spareH > 1e-9 ? clamp(c.y - dy / spareH, 0, 1) : c.y,
  };
}

/** Changes the zoom while keeping the middle of the box on the same part of the photo. */
export function zoomCrop(crop: Crop | null | undefined, imageWidth: number, imageHeight: number, boxWidth: number, boxHeight: number, zoom: number): Crop {
  const c = crop ?? NO_CROP;
  const z = clamp(zoom, 1, MAX_CROP_ZOOM);
  const before = photoRect(imageWidth, imageHeight, boxWidth, boxHeight, c);
  // The point of the photo under the box's center, as a fraction of the photo.
  const u = (0.5 - before.left) / before.width;
  const v = (0.5 - before.top) / before.height;
  const after = photoRect(imageWidth, imageHeight, boxWidth, boxHeight, { ...c, zoom: z });
  // Solve left = 0.5 - u·width for x, where left = x·(1 - width).
  const x = after.width - 1 > 1e-9 ? clamp((u * after.width - 0.5) / (after.width - 1), 0, 1) : 0.5;
  const y = after.height - 1 > 1e-9 ? clamp((v * after.height - 0.5) / (after.height - 1), 0, 1) : 0.5;
  return { x, y, zoom: z };
}

export function isCropped(crop: Crop | null | undefined): boolean {
  return !!crop && (crop.zoom !== 1 || crop.x !== 0.5 || crop.y !== 0.5);
}
