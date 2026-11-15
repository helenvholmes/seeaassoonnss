"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isTyping, type LightboxPhoto } from "@/lib/lightbox";
import { imageUrl } from "./ItemContent";

function imageAttrs(mediaBase: string, p: LightboxPhoto) {
  return {
    src: imageUrl(mediaBase, p.mediaId, p.widths[p.widths.length - 1]),
    srcSet: p.widths.map((w) => `${imageUrl(mediaBase, p.mediaId, w)} ${w}w`).join(", "),
    // Shown whole, as large as the screen allows: the width is capped by the height.
    sizes: `min(100vw, ${((p.width / p.height) * 100).toFixed(2)}vh)`,
  };
}

/**
 * Full-screen viewer for the public season page: "f" shows the season's photos one
 * at a time with nothing else from the page; arrow keys move between them and
 * Escape (or "f" again) closes it.
 */
export function Lightbox({ photos, mediaBase }: { photos: LightboxPhoto[]; mediaBase: string }) {
  const [index, setIndex] = useState<number | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const open = index !== null;
  const count = photos.length;

  const close = useCallback(() => {
    setIndex(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);
  const step = useCallback((by: number) => setIndex((i) => (i === null ? i : (i + by + count) % count)), [count]);

  useEffect(() => {
    if (!count) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        if (open) return close();
        returnFocus.current = document.activeElement;
        setIndex(0);
        // Must be asked for during the key press; the overlay covers the window either way.
        document.documentElement.requestFullscreen?.().catch(() => {});
        return;
      }
      if (!open) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") step(1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") step(-1);
      else if (e.key === "Home") setIndex(0);
      else if (e.key === "End") setIndex(count - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, open, close, step]);

  // Leaving browser full screen (Escape is taken by the browser there) closes the viewer too.
  useEffect(() => {
    if (!open) return;
    const onChange = () => {
      if (!document.fullscreenElement) setIndex(null);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [open]);

  // While open: no page scroll behind it, focus inside it, and focus back where it was on close.
  useEffect(() => {
    if (!open) return;
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.documentElement.style.overflow = overflow;
      if (returnFocus.current instanceof HTMLElement) returnFocus.current.focus();
    };
  }, [open]);

  // Start loading the neighbors so arrowing through feels instant.
  useEffect(() => {
    if (index === null || count < 2) return;
    for (const i of [(index + 1) % count, (index - 1 + count) % count]) {
      const a = imageAttrs(mediaBase, photos[i]);
      const img = new Image();
      img.sizes = a.sizes;
      img.srcset = a.srcSet;
      img.src = a.src;
    }
  }, [index, count, photos, mediaBase]);

  if (index === null) return null;
  const photo = photos[index];
  return (
    <div ref={dialog} className="lightbox" role="dialog" aria-modal="true" aria-label="Photos, full screen" tabIndex={-1}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={photo.mediaId + index} className="lightbox-photo" {...imageAttrs(mediaBase, photo)} alt={photo.alt} decoding="async" draggable={false} onClick={() => step(1)} />
      {count > 1 ? (
        <>
          <button type="button" className="lightbox-nav lightbox-prev" aria-label="Previous photo" onClick={() => step(-1)}>
            ←
          </button>
          <button type="button" className="lightbox-nav lightbox-next" aria-label="Next photo" onClick={() => step(1)}>
            →
          </button>
        </>
      ) : null}
      <button type="button" className="lightbox-close" aria-label="Close full screen" onClick={close}>
        ×
      </button>
      <p className="lightbox-count" aria-live="polite">
        {index + 1} / {count}
      </p>
    </div>
  );
}
