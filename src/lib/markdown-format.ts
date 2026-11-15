/** Cmd+B and Cmd+I in a Markdown text field: wraps or unwraps the selection. */

export type MarkdownStyle = "bold" | "italic";

/** Bold is **double asterisks**; italic is _underscores_. */
export const MARKERS: Record<MarkdownStyle, string> = { bold: "**", italic: "_" };

export type Edit = { value: string; start: number; end: number };

/**
 * Toggles bold or italic on value[start, end). With nothing selected, it puts an
 * empty pair at the cursor (or steps out of one the cursor sits in). Spaces at the
 * edges of the selection stay outside the markers, since Markdown ignores `_ x _`.
 */
export function toggleMarkdown(value: string, start: number, end: number, style: MarkdownStyle): Edit {
  const m = MARKERS[style];
  const n = m.length;
  // For italic, a "_" that is part of "__" is not a marker.
  const isMarker = (at: number) => value.slice(at, at + n) === m && (style !== "italic" || (value[at - 1] !== "_" && value[at + 1] !== "_"));

  if (start === end) {
    // Cursor inside an empty pair: take the pair away.
    if (start >= n && value.slice(start - n, start + n) === m + m) {
      return { value: value.slice(0, start - n) + value.slice(start + n), start: start - n, end: start - n };
    }
    return { value: value.slice(0, start) + m + m + value.slice(end), start: start + n, end: start + n };
  }

  let s = start;
  let e = end;
  while (s < e && /\s/.test(value[s])) s++;
  while (e > s && /\s/.test(value[e - 1])) e--;
  if (s === e) return { value, start, end };

  // Markers just outside the selection: remove them.
  if (s >= n && isMarker(s - n) && isMarker(e)) {
    return { value: value.slice(0, s - n) + value.slice(s, e) + value.slice(e + n), start: s - n, end: e - n };
  }
  // The selection includes its markers: remove them.
  if (e - s >= 2 * n && isMarker(s) && isMarker(e - n)) {
    return { value: value.slice(0, s) + value.slice(s + n, e - n) + value.slice(e), start: s, end: e - 2 * n };
  }
  return { value: value.slice(0, s) + m + value.slice(s, e) + m + value.slice(e), start: s + n, end: e + n };
}

/** The style a key press asks for (Cmd/Ctrl+B, Cmd/Ctrl+I), or null. */
export function shortcutStyle(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): MarkdownStyle | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
  const k = e.key.toLowerCase();
  return k === "b" ? "bold" : k === "i" ? "italic" : null;
}
