"use client";
// Resizable side panels in the desktop editor: drag the edge between a panel and
// the page, use the arrow keys on it, or double-click it to go back to the default.
// Widths are remembered in this browser.

import { useCallback, useEffect, useState } from "react";

export type PanelSide = "tools" | "inspector";

export const PANEL_DEFAULTS: Record<PanelSide, number> = { tools: 200, inspector: 300 };
const LIMITS: Record<PanelSide, [number, number]> = { tools: [160, 420], inspector: [260, 640] };
/** The page between the panels keeps at least this much room. */
const MIN_STAGE = 360;
const KEY = "seasons:panels";

export function clampPanel(side: PanelSide, width: number, other: number, viewport: number): number {
  const [min, max] = LIMITS[side];
  return Math.round(Math.max(min, Math.min(max, viewport - other - MIN_STAGE, width)));
}

export function usePanelWidths() {
  const [widths, setWidths] = useState(PANEL_DEFAULTS);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Record<PanelSide, number>> | null;
      if (saved) {
        const vw = window.innerWidth;
        const tools = clampPanel("tools", Number(saved.tools) || PANEL_DEFAULTS.tools, PANEL_DEFAULTS.inspector, vw);
        setWidths({ tools, inspector: clampPanel("inspector", Number(saved.inspector) || PANEL_DEFAULTS.inspector, tools, vw) });
      }
    } catch {}
  }, []);
  const setWidth = useCallback((side: PanelSide, width: number) => {
    setWidths((cur) => {
      const other = side === "tools" ? cur.inspector : cur.tools;
      const next = { ...cur, [side]: clampPanel(side, width, other, window.innerWidth) };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);
  return { widths, setWidth };
}

/** The draggable edge of one side panel. */
export function PanelHandle({ side, width, setWidth }: { side: PanelSide; width: number; setWidth: (side: PanelSide, width: number) => void }) {
  const [dragging, setDragging] = useState(false);
  // The tools panel grows to the right, the inspector to the left.
  const sign = side === "tools" ? 1 : -1;
  return (
    <div
      className={`panel-handle panel-handle-${side}${dragging ? " is-dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={side === "tools" ? "Resize the add panel" : "Resize the settings panel"}
      aria-valuenow={width}
      aria-valuemin={LIMITS[side][0]}
      aria-valuemax={LIMITS[side][1]}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => setWidth(side, PANEL_DEFAULTS[side])}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16;
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          setWidth(side, width + (e.key === "ArrowRight" ? step : -step) * sign);
        }
      }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        const startX = e.clientX;
        const start = width;
        setDragging(true);
        document.body.classList.add("is-resizing-panel");
        const move = (ev: PointerEvent) => setWidth(side, start + (ev.clientX - startX) * sign);
        const up = () => {
          setDragging(false);
          document.body.classList.remove("is-resizing-panel");
          el.removeEventListener("pointermove", move);
          el.removeEventListener("pointerup", up);
          el.removeEventListener("pointercancel", up);
        };
        el.addEventListener("pointermove", move);
        el.addEventListener("pointerup", up);
        el.addEventListener("pointercancel", up);
      }}
    />
  );
}
