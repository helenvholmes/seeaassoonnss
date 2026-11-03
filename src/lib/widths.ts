import { IMAGE_WIDTHS } from "./schema.ts";

/** The widths to make for an image of this width: the standard sizes below it, plus one at most 2048 wide. */
export function targetWidths(originalWidth: number): number[] {
  const largest = Math.min(originalWidth, IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]);
  const widths: number[] = IMAGE_WIDTHS.filter((w) => w < largest);
  widths.push(largest);
  return widths;
}
