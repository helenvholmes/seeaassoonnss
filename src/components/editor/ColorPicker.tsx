"use client";
// The editor's color picker: a swatch that opens a panel in place, with a
// saturation/brightness square, a hue slider, a hex field, the colors already on
// the page, and an eyedropper where the browser has one (Chrome and Edge).

import { useEffect, useRef, useState } from "react";
import { docColors, hexToHsv, hsvToHex, HEX, type Hsv } from "@/lib/color";

export { docColors };

const PRESETS = ["#1d1d1b", "#ffffff", "#fbfbf9", "#c63d32", "#e0892b", "#e9c46a", "#5b8c5a", "#2f6f8f", "#6b4e9b", "#d98aa5"];

interface EyeDropperApi {
  open: () => Promise<{ sRGBHex: string }>;
}

export function ColorPicker({ value, onChange, swatches = [], label }: { value: string; onChange: (hex: string) => void; swatches?: string[]; label: string }) {
  const [open, setOpen] = useState(false);
  // Hue and saturation are kept apart from the hex value, so dragging to black or
  // grey does not lose the hue.
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value);
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
  const others = [...new Set([...swatches, ...PRESETS].map((c) => c.toLowerCase()))].slice(0, 20);

  return (
    <div className="color-picker">
      <button type="button" className="color-toggle" aria-expanded={open} aria-label={`${label}: ${value}`} onClick={() => setOpen((o) => !o)}>
        <span className="color-chip" style={{ background: value }} />
        <code className="small">{value}</code>
      </button>
      {open ? (
        <div className="color-panel">
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
            {dropper ? (
              <button
                type="button"
                title="Pick a color from the screen"
                onClick={async () => {
                  try {
                    pickHex((await new dropper().open()).sRGBHex);
                  } catch {
                    // Cancelled with Escape.
                  }
                }}
              >
                Eyedropper
              </button>
            ) : null}
          </div>
          <div className="color-swatches" aria-label="Colors on this page and presets">
            {others.map((c) => (
              <button key={c} type="button" className="color-swatch" style={{ background: c }} title={c} aria-label={c} aria-pressed={c === value.toLowerCase()} onClick={() => pickHex(c)} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
