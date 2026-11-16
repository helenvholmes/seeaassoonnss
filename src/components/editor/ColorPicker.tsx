"use client";
// The editor's color picker: a swatch that opens a floating panel beside it, with a
// saturation/brightness square, a hue slider, a hex field, the colors already on
// the page, and a sampler for any color on the screen. The sampler uses the
// browser's eyedropper where there is one (Chrome and Edge); elsewhere (Safari,
// Firefox) it takes one screenshot of a screen or window the owner chooses and
// lets them click a pixel in it.

import { Pipette } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { docColors, hexToHsv, hsvToHex, HEX, type Hsv } from "@/lib/color";

export { docColors };

const PRESETS = ["#1d1d1b", "#ffffff", "#fbfbf9", "#c63d32", "#e0892b", "#e9c46a", "#5b8c5a", "#2f6f8f", "#6b4e9b", "#d98aa5"];
const PANEL_WIDTH = 296;
const GAP = 10;

interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>;
}

const toHex = (r: number, g: number, b: number) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;

/** Where the panel goes: to the left of the picker (over the canvas) when there is room, else below or above it. */
function placePanel(anchor: DOMRect, height: number): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (t: number) => Math.max(8, Math.min(t, vh - height - 8));
  if (anchor.left - PANEL_WIDTH - GAP >= 8) return { left: anchor.left - PANEL_WIDTH - GAP, top: clampTop(anchor.top - 8) };
  const left = Math.max(8, Math.min(anchor.left, vw - PANEL_WIDTH - 8));
  const below = anchor.bottom + 6;
  return { left, top: below + height <= vh - 8 ? below : clampTop(anchor.top - height - 6) };
}

export function ColorPicker({ value, onChange, swatches = [], label }: { value: string; onChange: (hex: string) => void; swatches?: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  // Hue and saturation are kept apart from the hex value, so dragging to black or
  // grey does not lose the hue.
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
  const [shot, setShot] = useState<HTMLCanvasElement | null>(null);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const square = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHexText(value);
    setHsv((cur) => (hsvToHex(cur) === value.toLowerCase() ? cur : hexToHsv(value)));
  }, [value]);

  const pick = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };
  const pickHex = (hex: string) => {
    if (!HEX.test(hex)) return;
    setHsv(hexToHsv(hex));
    onChange(hex.toLowerCase());
  };

  // Keep the panel beside the picker while the inspector scrolls or the window resizes.
  const reposition = useCallback(() => {
    if (!toggle.current || !panel.current) return;
    setPos(placePanel(toggle.current.getBoundingClientRect(), panel.current.offsetHeight));
  }, []);
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Close on a click outside or Escape (but not while sampling the screen).
  useEffect(() => {
    if (!open || shot) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !toggle.current?.contains(t)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("keydown", key);
    };
  }, [open, shot]);

  const dragSquare = (e: React.PointerEvent) => {
    const el = square.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const at = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect();
      const s = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      const v = 1 - Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      pick({ h: hsv.h, s, v });
    };
    at(e);
    const move = (ev: PointerEvent) => at(ev);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  };

  const dropper = typeof window !== "undefined" && "EyeDropper" in window ? (window as unknown as { EyeDropper: new () => EyeDropperApi }).EyeDropper : null;
  const canCapture = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
  const others = [...new Set([...swatches, ...PRESETS].map((c) => c.toLowerCase()))].slice(0, 20);

  const sample = async () => {
    setSampleError(null);
    if (dropper) {
      try {
        pickHex((await new dropper().open()).sRGBHex);
      } catch {
        // Cancelled with Escape.
      }
      return;
    }
    // No eyedropper: one frame of a screen or window the owner picks in the browser's dialog.
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      // The first frame can be blank; wait for a real one.
      await new Promise((r) => setTimeout(r, 250));
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d", { willReadFrequently: true })!.drawImage(video, 0, 0);
      setShot(canvas);
    } catch (err) {
      if ((err as Error).name !== "NotAllowedError" && (err as Error).name !== "AbortError") setSampleError("Could not capture the screen.");
    } finally {
      stream?.getTracks().forEach((t) => t.stop());
    }
  };

  return (
    <div className="color-picker">
      <button ref={toggle} type="button" className="color-toggle" aria-expanded={open} aria-haspopup="dialog" aria-label={`${label}: ${value}`} onClick={() => setOpen((o) => !o)}>
        <span className="color-chip" style={{ background: value }} />
        <code className="small">{value}</code>
      </button>
      {open
        ? createPortal(
            <div ref={panel} className="color-panel" role="dialog" aria-label={label} style={{ width: PANEL_WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}>
              <div className="color-panel-head">
                <span className="small">{label}</span>
                <span className="color-chip" style={{ background: value }} />
              </div>
              <div
                ref={square}
                className="color-square"
                style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }}
                onPointerDown={dragSquare}
                role="slider"
                aria-label={`${label}: saturation and brightness`}
                aria-valuetext={value}
                aria-valuenow={Math.round(hsv.v * 100)}
                tabIndex={0}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 0.1 : 0.02;
                  const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
                  if (!d) return;
                  e.preventDefault();
                  pick({ h: hsv.h, s: Math.min(1, Math.max(0, hsv.s + d[0])), v: Math.min(1, Math.max(0, hsv.v + d[1])) });
                }}
              >
                <span className="color-thumb" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }} />
              </div>
              <input className="color-hue" type="range" min={0} max={359} value={Math.round(hsv.h)} aria-label={`${label}: hue`} onChange={(e) => pick({ ...hsv, h: Number(e.target.value) })} />
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input
                  type="text"
                  className="color-hex"
                  value={hexText}
                  spellCheck={false}
                  aria-label={`${label}: hex`}
                  onChange={(e) => {
                    const t = e.target.value.trim();
                    setHexText(t);
                    const hex = t.startsWith("#") ? t : `#${t}`;
                    if (HEX.test(hex)) pickHex(hex);
                  }}
                  onBlur={() => setHexText(value)}
                />
                {dropper || canCapture ? (
                  <button type="button" className="color-sample" title={dropper ? "Pick a color from anywhere on the screen" : "Pick a color from a screenshot of a screen or window"} onClick={sample}>
                    <Pipette size={15} aria-hidden /> Sample
                  </button>
                ) : null}
              </div>
              {sampleError ? <span className="small muted">{sampleError}</span> : null}
              <div className="color-swatches" aria-label="Colors on this page and presets">
                {others.map((c) => (
                  <button key={c} type="button" className="color-swatch" style={{ background: c }} title={c} aria-label={c} aria-pressed={c === value.toLowerCase()} onClick={() => pickHex(c)} />
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
      {shot
        ? createPortal(
            <ScreenSampler
              shot={shot}
              onPick={(hex) => {
                pickHex(hex);
                setShot(null);
              }}
              onCancel={() => setShot(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}

const LOUPE = 132;
const LOUPE_PIXELS = 11;

/** A full-window screenshot to click a pixel in, with a magnifier under the pointer. */
function ScreenSampler({ shot, onPick, onCancel }: { shot: HTMLCanvasElement; onPick: (hex: string) => void; onCancel: () => void }) {
  const holder = useRef<HTMLDivElement>(null);
  const loupe = useRef<HTMLCanvasElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; hex: string } | null>(null);

  useEffect(() => {
    holder.current?.appendChild(shot);
    shot.className = "sampler-shot";
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("keydown", key, true);
      shot.remove();
    };
  }, [shot, onCancel]);

  // The screenshot pixel under the pointer (the image is scaled to fit the window).
  const pixelAt = (e: React.PointerEvent) => {
    const r = shot.getBoundingClientRect();
    const px = Math.floor(((e.clientX - r.left) / r.width) * shot.width);
    const py = Math.floor(((e.clientY - r.top) / r.height) * shot.height);
    if (px < 0 || py < 0 || px >= shot.width || py >= shot.height) return null;
    const [red, green, blue] = shot.getContext("2d")!.getImageData(px, py, 1, 1).data;
    return { px, py, hex: toHex(red, green, blue) };
  };

  const move = (e: React.PointerEvent) => {
    const p = pixelAt(e);
    if (!p) return setAt(null);
    setAt({ x: e.clientX, y: e.clientY, hex: p.hex });
    const ctx = loupe.current?.getContext("2d");
    if (!ctx) return;
    const half = Math.floor(LOUPE_PIXELS / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, LOUPE, LOUPE);
    ctx.drawImage(shot, p.px - half, p.py - half, LOUPE_PIXELS, LOUPE_PIXELS, 0, 0, LOUPE, LOUPE);
    const cell = LOUPE / LOUPE_PIXELS;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(half * cell, half * cell, cell, cell);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(half * cell - 1.5, half * cell - 1.5, cell + 3, cell + 3);
  };

  return (
    <div
      className="sampler"
      role="dialog"
      aria-label="Click a color in the screenshot"
      onPointerMove={move}
      onPointerLeave={() => setAt(null)}
      onClick={(e) => {
        const p = pixelAt(e as unknown as React.PointerEvent);
        if (p) onPick(p.hex);
      }}
    >
      <div ref={holder} className="sampler-holder" />
      <div className="sampler-bar" onClick={(e) => e.stopPropagation()}>
        <span className="small">Click any color · Esc to cancel</span>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <div
        className="sampler-loupe"
        style={{
          display: at ? "block" : "none",
          // Beside the pointer, flipping to the other side near the window's edges.
          left: at ? (at.x + 18 + LOUPE + 12 > window.innerWidth ? at.x - 18 - LOUPE - 12 : at.x + 18) : 0,
          top: at ? (at.y + 18 + LOUPE + 40 > window.innerHeight ? at.y - 18 - LOUPE - 40 : at.y + 18) : 0,
        }}
      >
        <canvas ref={loupe} width={LOUPE} height={LOUPE} />
        <code className="small">{at?.hex}</code>
      </div>
    </div>
  );
}
