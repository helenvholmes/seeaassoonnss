"use client";
// Cursor follow and generative type for one layout of a season page. It renders
// nothing; it moves the canvas's items with CSS (the `translate` property, which
// adds to an item's rotation without replacing it). Mounted only on public pages
// and previews, never in the editor, and only when reduced motion is off.
import { useEffect, useRef } from "react";
import { FOLLOW_DISTANCE, MAX_EFFECT_LETTERS, splitLetters } from "./letters";
import { prefersReducedMotion, subscribeMotion, type MotionState } from "./motion";
import type { QuoteEffect } from "@/lib/schema";

interface Mover {
  el: HTMLElement;
  strength: number;
  x: number;
  y: number;
}

interface Letter {
  el: HTMLElement;
  /** Letter center relative to its quote box, in px. */
  cx: number;
  cy: number;
  /** Seeded random direction and turn for "gather". */
  rx: number;
  ry: number;
  rr: number;
  x: number;
  y: number;
}

interface Effect {
  el: HTMLElement;
  kind: Exclude<QuoteEffect, "none">;
  letters: Letter[];
}

const EASE = 0.12;

function seeded(i: number, seed: number) {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Measures letter centers relative to the quote box (positions without any offset applied). */
function measureLetters(effect: Effect) {
  const box = effect.el.getBoundingClientRect();
  for (const l of effect.letters) {
    const r = l.el.getBoundingClientRect();
    l.cx = r.left + r.width / 2 - l.x - box.left;
    l.cy = r.top + r.height / 2 - l.y - box.top;
  }
}

export function MotionLayer({ canvasWidth }: { canvasWidth: number }) {
  const anchor = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const canvas = anchor.current?.closest<HTMLElement>(".canvas");
    if (!canvas || prefersReducedMotion()) return;

    const movers: Mover[] = Array.from(canvas.querySelectorAll<HTMLElement>("[data-follow]")).map((el) => ({ el, strength: Number(el.dataset.follow) || 0, x: 0, y: 0 }));
    const effects: Effect[] = Array.from(canvas.querySelectorAll<HTMLElement>("[data-effect]")).map((el, n) => {
      const spans = splitLetters(el, MAX_EFFECT_LETTERS);
      const seed = n + 1;
      return {
        el,
        kind: el.dataset.effect as Effect["kind"],
        letters: spans.map((s, i) => {
          const a = seeded(i, seed) * Math.PI * 2;
          const d = 0.4 + seeded(i + 7, seed) * 0.6;
          return { el: s, cx: 0, cy: 0, rx: Math.cos(a) * d, ry: Math.sin(a) * d, rr: seeded(i + 13, seed) * 2 - 1, x: 0, y: 0 };
        }),
      };
    });
    if (!movers.length && !effects.length) return;

    let motion: MotionState | null = null;
    let raf = 0;
    let measured = false;
    const remeasure = () => {
      measured = false;
      kick();
    };

    const step = () => {
      raf = 0;
      if (!motion || canvas.offsetParent === null) return; // the other layout is showing
      const rect = canvas.getBoundingClientRect();
      // Screen px per design unit.
      const unit = rect.width / canvasWidth;
      if (!measured) {
        effects.forEach(measureLetters);
        measured = true;
      }
      const vh = window.innerHeight;
      let moving = false;

      for (const m of movers) {
        const r = m.el.getBoundingClientRect();
        const cx = r.left + r.width / 2 - m.x;
        const cy = r.top + r.height / 2 - m.y;
        if (r.bottom < -vh || r.top > 2 * vh) continue;
        const max = FOLLOW_DISTANCE * unit * m.strength;
        const dx = motion.x - cx;
        const dy = motion.y - cy;
        const len = Math.hypot(dx, dy) || 1;
        // Pulled toward the cursor, more when it is near, never more than `max`.
        const pull = Math.min(max, len * 0.1 * m.strength);
        const tx = (dx / len) * pull;
        const ty = (dy / len) * pull;
        m.x += (tx - m.x) * EASE;
        m.y += (ty - m.y) * EASE;
        if (Math.abs(tx - m.x) > 0.1 || Math.abs(ty - m.y) > 0.1) moving = true;
        m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
      }

      for (const e of effects) {
        const box = e.el.getBoundingClientRect();
        if (box.bottom < -vh || box.top > 2 * vh) continue;
        // Progress toward the middle of the screen: 0 far away, 1 at the middle.
        const mid = 1 - Math.min(1, Math.abs(box.top + box.height / 2 - vh / 2) / (vh * 0.6));
        for (let i = 0; i < e.letters.length; i++) {
          const l = e.letters[i];
          let tx = 0;
          let ty = 0;
          let turn = 0;
          if (e.kind === "repel") {
            const radius = 140 * unit;
            const dx = box.left + l.cx - motion.x;
            const dy = box.top + l.cy - motion.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d < radius) {
              const push = (1 - d / radius) ** 2 * 36 * unit;
              tx = (dx / d) * push;
              ty = (dy / d) * push;
            }
          } else if (e.kind === "wave") {
            ty = Math.sin(i * 0.45 + window.scrollY * 0.012) * 8 * unit;
          } else {
            const spread = (1 - mid) ** 1.5;
            tx = l.rx * 240 * unit * spread;
            ty = l.ry * 240 * unit * spread;
            turn = l.rr * 120 * spread;
          }
          l.x += (tx - l.x) * EASE * 1.5;
          l.y += (ty - l.y) * EASE * 1.5;
          if (Math.abs(tx - l.x) > 0.1 || Math.abs(ty - l.y) > 0.1) moving = true;
          l.el.style.transform = `translate(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px)${turn ? ` rotate(${turn.toFixed(1)}deg)` : ""}`;
        }
      }
      // Keep easing until everything has settled.
      if (moving) kick();
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(step);
    };

    const unsubscribe = subscribeMotion((s) => {
      motion = s;
      kick();
    });
    const ro = new ResizeObserver(remeasure);
    ro.observe(canvas);
    document.fonts?.ready.then(remeasure).catch(() => {});
    return () => {
      unsubscribe();
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [canvasWidth]);

  return <span ref={anchor} hidden aria-hidden />;
}
