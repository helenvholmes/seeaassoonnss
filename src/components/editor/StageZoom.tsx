"use client";
// Zooming and panning the editor's page, like a frame on a larger artboard.
// - Zoom: pinch on a trackpad, ⌘/Ctrl + scroll, ⌘+ / ⌘− / ⌘0, or the controls.
//   Zoom 1 fits the page to the stage's width; the point under the pointer stays put.
// - Pan: scroll (Shift + scroll for sideways), or hold Space (or the middle mouse
//   button) and drag.

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 8;
const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/** The next zoom step in or out: steps of about 25%, landing on fit (1) on the way. */
export function stepZoom(z: number, dir: 1 | -1): number {
  const next = dir > 0 ? z * 1.25 : z / 1.25;
  if ((z < 1 && next > 1) || (z > 1 && next < 1)) return 1;
  return clamp(Math.round(next * 1000) / 1000);
}

interface Anchor {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

export function useStageZoom(stage: RefObject<HTMLDivElement | null>, canvas: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const [zoom, setZoomState] = useState(1);
  const zoomRef = useRef(1);
  const anchor = useRef<Anchor | null>(null);

  /** Zooms to `next`, keeping the page point under (clientX, clientY) in place (default: the stage's middle). */
  const zoomTo = useCallback(
    (next: number | ((z: number) => number), clientX?: number, clientY?: number) => {
      const s = stage.current;
      const c = canvas.current;
      if (!s || !c) return;
      const sr = s.getBoundingClientRect();
      const cr = c.getBoundingClientRect();
      const cx = clientX ?? sr.left + sr.width / 2;
      const cy = clientY ?? sr.top + sr.height / 2;
      anchor.current = { fx: (cx - cr.left) / cr.width, fy: (cy - cr.top) / cr.height, cx, cy };
      const z = clamp(typeof next === "function" ? next(zoomRef.current) : next);
      zoomRef.current = z;
      setZoomState(z);
    },
    [stage, canvas],
  );

  // After the page is drawn at the new size, scroll so the anchored point is back under the pointer.
  useLayoutEffect(() => {
    const a = anchor.current;
    const s = stage.current;
    const c = canvas.current;
    anchor.current = null;
    if (!a || !s || !c) return;
    const cr = c.getBoundingClientRect();
    s.scrollLeft += cr.left + a.fx * cr.width - a.cx;
    s.scrollTop += cr.top + a.fy * cr.height - a.cy;
  }, [zoom, stage, canvas]);

  // Pinch and ⌘/Ctrl + scroll (browsers report a trackpad pinch as Ctrl + wheel; Safari as gesture events).
  useEffect(() => {
    const s = stage.current;
    if (!s || !enabled) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const d = Math.max(-60, Math.min(60, e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY));
      zoomTo((z) => z * Math.exp(-d * 0.005), e.clientX, e.clientY);
    };
    let gestureStart = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureStart = zoomRef.current;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as Event & { scale: number; clientX: number; clientY: number };
      zoomTo(gestureStart * g.scale, g.clientX, g.clientY);
    };
    s.addEventListener("wheel", onWheel, { passive: false });
    s.addEventListener("gesturestart", onGestureStart);
    s.addEventListener("gesturechange", onGestureChange);
    return () => {
      s.removeEventListener("wheel", onWheel);
      s.removeEventListener("gesturestart", onGestureStart);
      s.removeEventListener("gesturechange", onGestureChange);
    };
  }, [stage, enabled, zoomTo]);

  const fit = useCallback(() => {
    zoomRef.current = 1;
    anchor.current = null;
    setZoomState(1);
    requestAnimationFrame(() => {
      if (stage.current) stage.current.scrollLeft = 0;
    });
  }, [stage]);

  return { zoom, zoomTo, fit };
}

/** Drags the stage's scroll position with the pointer (Space + drag, or the middle button). */
export function panWithPointer(stage: HTMLElement, e: { clientX: number; clientY: number; pointerId?: number }, target?: Element) {
  const startX = e.clientX;
  const startY = e.clientY;
  const left = stage.scrollLeft;
  const top = stage.scrollTop;
  document.body.classList.add("is-panning");
  const move = (ev: PointerEvent | MouseEvent) => {
    stage.scrollLeft = left - (ev.clientX - startX);
    stage.scrollTop = top - (ev.clientY - startY);
  };
  const up = () => {
    document.body.classList.remove("is-panning");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };
  if (target && e.pointerId !== undefined) (target as HTMLElement).setPointerCapture?.(e.pointerId);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", up);
}

/** While Space is held: a layer over the stage that pans on drag instead of selecting. */
export function PanLayer({ stage }: { stage: RefObject<HTMLDivElement | null> }) {
  return (
    <div
      className="stage-pan-layer"
      aria-hidden
      onPointerDown={(e) => {
        if (!stage.current) return;
        e.preventDefault();
        panWithPointer(stage.current, e, e.currentTarget);
      }}
    />
  );
}

/** − 62% + Fit, in the corner of the stage. The percentage is real size (100% = one design unit per pixel). */
export function ZoomControls({ zoom, scale, zoomTo, fit }: { zoom: number; scale: number; zoomTo: (z: number | ((z: number) => number)) => void; fit: () => void }) {
  return (
    <div className="zoom-controls" role="group" aria-label="Zoom">
      <button type="button" className="quiet" title="Zoom out (⌘−)" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => zoomTo((z) => stepZoom(z, -1))}>
        <Minus size={14} aria-hidden />
      </button>
      <span className="zoom-value" aria-live="polite">
        {Math.round(scale * 100)}%
      </span>
      <button type="button" className="quiet" title="Zoom in (⌘+)" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo((z) => stepZoom(z, 1))}>
        <Plus size={14} aria-hidden />
      </button>
      <button type="button" className="quiet" title="Fit the page to the window (⌘0)" disabled={zoom === 1} onClick={fit}>
        Fit
      </button>
    </div>
  );
}
