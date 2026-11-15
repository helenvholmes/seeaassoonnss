"use client";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";
import { shortcutStyle, toggleMarkdown } from "@/lib/markdown-format";

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

/** A textarea for Markdown: Cmd+B makes the selection **bold**, Cmd+I makes it _italic_. */
export const MarkdownTextarea = forwardRef<HTMLTextAreaElement, Props>(function MarkdownTextarea({ value, onChange, onKeyDown, ...rest }, ref) {
  const el = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => el.current!);
  // The selection to put back once React has written the new value.
  const pending = useRef<{ start: number; end: number } | null>(null);
  useLayoutEffect(() => {
    if (pending.current && el.current) {
      el.current.setSelectionRange(pending.current.start, pending.current.end);
      pending.current = null;
    }
  }, [value]);

  return (
    <textarea
      ref={el}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        const style = shortcutStyle(e);
        if (!style || e.defaultPrevented) return;
        e.preventDefault();
        const t = e.currentTarget;
        const r = toggleMarkdown(t.value, t.selectionStart, t.selectionEnd, style);
        pending.current = { start: r.start, end: r.end };
        onChange(r.value);
      }}
      {...rest}
    />
  );
});
