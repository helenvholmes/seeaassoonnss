"use client";

import { useEffect, useRef, type ImgHTMLAttributes } from "react";
import { photoRect } from "@/lib/crop";
import type { Crop } from "@/lib/schema";

/** How far the photo drifts while its box crosses the screen, as a share of the screen height. */
export const PARALLAX_DRIFT = 0.1;

/**
 * A photo seen through its box as through a window. The photo covers the whole
 * screen (plus room for the drift) and stays fixed while the page scrolls, so the
 * box reveals a different part of it; across the box's pass over the screen the
 * photo also drifts down by 2 × PARALLAX_DRIFT of the screen height.
 *
 * This is done with a scroll handler instead of `position: fixed`, because fixed
 * elements inside a rotated item would be placed relative to the item, not the screen.
 * With reduced motion the photo simply fills its box.
 */
export function ParallaxPhoto({ attrs, alt, width, height, crop }: { attrs: ImgHTMLAttributes<HTMLImageElement>; alt: string; width: number; height: number; crop: Crop | null | undefined }) {
  const frame = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const box = frame.current;
    const l = layer.current;
    const im = img.current;
    if (!box || !l || !im) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let lastW = 0;
    let lastH = 0;

    const update = () => {
      raf = 0;
      if (motion.matches) {
        l.removeAttribute("style");
        im.removeAttribute("style");
        l.classList.remove("is-moving");
        lastW = lastH = 0;
        return;
      }
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      // The box's own (unrotated) position: its center does not move when it rotates.
      const r = box.getBoundingClientRect();
      const bw = box.offsetWidth;
      const bh = box.offsetHeight;
      const top = r.top + r.height / 2 - bh / 2;
      const left = r.left + r.width / 2 - bw / 2;
      // Hidden (the other layout) or off screen: nothing to show.
      if (!bw || top > vh || top + bh < 0) return;
      const layerH = vh * (1 + 2 * PARALLAX_DRIFT);
      if (vw !== lastW || layerH !== lastH) {
        lastW = vw;
        lastH = layerH;
        l.style.width = `${vw}px`;
        l.style.height = `${layerH}px`;
        const p = photoRect(width, height, vw, layerH, crop);
        Object.assign(im.style, { left: `${p.left * 100}%`, top: `${p.top * 100}%`, width: `${p.width * 100}%`, height: `${p.height * 100}%` });
      }
      // 0 when the box's top enters at the bottom of the screen, 1 when its bottom leaves at the top.
      const progress = Math.min(1, Math.max(0, (vh - top) / (vh + bh)));
      const drift = (-PARALLAX_DRIFT + 2 * PARALLAX_DRIFT * progress) * vh;
      // Screen position of the layer: from -2·drift (start) to 0 (end), so it always covers the screen.
      const y = -PARALLAX_DRIFT * vh + drift - top;
      l.style.transform = `translate3d(${-left}px, ${y}px, 0)`;
      l.classList.add("is-moving");
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [width, height, crop]);

  // Before the script runs (and with reduced motion), the photo fills its box (see globals.css).
  return (
    <div className="photo-frame" ref={frame}>
      <div className="parallax-layer" ref={layer}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={img} className="photo-cropped" {...attrs} sizes="100vw" alt={alt} loading="lazy" />
      </div>
    </div>
  );
}
