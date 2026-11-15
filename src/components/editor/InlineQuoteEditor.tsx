"use client";
import { useEffect, useLayoutEffect, useRef } from "react";
import { CANVAS_WIDTH, type Layout, type Placement, type QuoteItem, type SeasonDoc } from "@/lib/schema";
import { units } from "../geometry";
import { FONT_STACKS, quoteSize } from "../ItemContent";
import { MarkdownTextarea } from "./MarkdownTextarea";

/**
 * Edits a quote's text where it sits on the canvas, in its own font, size and color.
 * Opens on double-click; Escape, a click elsewhere, or Enter in a title closes it.
 */
export function InlineQuoteEditor(props: {
  item: QuoteItem;
  doc: SeasonDoc;
  layout: Layout;
  placement: Placement;
  change: (fn: (d: SeasonDoc) => SeasonDoc, key: string) => void;
  onDone: () => void;
}) {
  const { item, doc, layout, placement, change, onDone } = props;
  const c = item.content;
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.focus();
    t.setSelectionRange(t.value.length, t.value.length);
  }, []);

  // Grow with the text, so long text is never cut off while typing (it can run past the box, as on the page).
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${Math.max(t.scrollHeight, t.parentElement?.clientHeight ?? 0)}px`;
  });

  const style = {
    fontFamily: FONT_STACKS[c.font],
    fontSize: units(quoteSize(item, layout, placement), CANVAS_WIDTH[layout]),
    color: c.color,
    textAlign: c.align,
  } as const;
  const common = {
    ref,
    className: `item-quote inline-quote-editor${c.binding === "title" ? " item-title" : ""}`,
    style,
    spellCheck: true,
    onBlur: onDone,
    // Typing, selecting text and clicking inside never drag the item.
    onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
    onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
    onDoubleClick: (e: React.MouseEvent) => e.stopPropagation(),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape" || (c.binding === "title" && e.key === "Enter")) {
        e.preventDefault();
        onDone();
      }
    },
  };

  if (c.binding === "title") {
    // The title is plain text, not Markdown.
    return (
      <textarea
        {...common}
        aria-label="Season title"
        value={doc.title}
        onChange={(e) => {
          const title = e.target.value.replace(/\n/g, " ");
          change((d) => ({ ...d, title }), "season:title");
        }}
      />
    );
  }
  if (c.binding === "subtitle") {
    return <MarkdownTextarea {...common} aria-label="Season subtitle" value={doc.subtitle} onChange={(subtitle) => change((d) => ({ ...d, subtitle }), "season:subtitle")} />;
  }
  return (
    <MarkdownTextarea
      {...common}
      aria-label="Quote text"
      value={c.markdown}
      onChange={(markdown) =>
        change((d) => ({ ...d, items: d.items.map((i) => (i.id === item.id && i.type === "quote" ? { ...i, content: { ...i.content, markdown } } : i)) }), `content:${item.id}:markdown`)
      }
    />
  );
}
