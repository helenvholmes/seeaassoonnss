"use client";

import { geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/client";
import { fitRoute, routeCoordinates, routeProjection, stopFractions, type RouteFrame } from "@/lib/route";
import type { Layout, Placement, RouteItem } from "@/lib/schema";

/** How tall a screen is in design units, for the editor's preview of the pinned map. */
const SCREEN_UNITS: Record<Layout, number> = { desktop: 900, mobile: 780 };
/** Frame sizes are rounded so small window changes reuse the same land image. */
const QUANTUM = 40;

export function frameUrl(f: RouteFrame, k: number, borders: boolean) {
  const q = new URLSearchParams({
    lon: String(f.lon),
    scale: String(f.scale),
    tx: String(f.tx),
    ty: String(f.ty),
    w: String(f.width),
    h: String(f.height),
    k: String(k),
  });
  if (borders) q.set("borders", "1");
  return `${BASE_PATH}/map/frame?${q}`;
}

/**
 * A scroll-driven route map. The item's box is a band of the canvas. While the
 * reader scrolls through the band, the map panel stays fixed on screen (sticky),
 * the route draws in with scroll progress, and items linked to a stop move the map
 * to that stop when they reach the middle of the screen. With reduced motion, the
 * whole route shows at once and nothing moves.
 */
export function RouteView({ item, interactive, layout, placement }: { item: RouteItem; interactive: boolean; layout: Layout; placement: Placement }) {
  const c = item.content;
  const band = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drawn = useRef<SVGPathElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [editorPanelHeight, setEditorPanelHeight] = useState<number | null>(null);
  const [progress, setProgress] = useState(interactive ? 0 : 1);
  const [active, setActive] = useState<number | null>(null);
  const [reduced, setReduced] = useState(false);
  const [length, setLength] = useState(0);

  // Panel size → frame. In the editor the panel previews one screen's height.
  useEffect(() => {
    const el = panel.current;
    const b = band.current;
    if (!el || !b) return;
    const measure = () => {
      if (!interactive) {
        const scale = b.clientWidth / placement.w;
        setEditorPanelHeight(Math.min(b.clientHeight, SCREEN_UNITS[layout] * scale));
      }
      const w = Math.max(QUANTUM, Math.round(el.clientWidth / QUANTUM) * QUANTUM);
      const h = Math.max(QUANTUM, Math.round(el.clientHeight / QUANTUM) * QUANTUM);
      setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(b);
    return () => ro.disconnect();
  }, [interactive, layout, placement.w]);

  const geometry = useMemo(() => {
    if (!size) return null;
    const frame = fitRoute(c, size.w, size.h);
    const projection = routeProjection(frame);
    const d = geoPath(projection)({ type: "LineString", coordinates: routeCoordinates(c) }) ?? "";
    const points = c.stops.map((s) => projection([s.lon, s.lat]) ?? [0, 0]);
    return { frame, d, points, fractions: stopFractions(c) };
  }, [c, size]);

  useEffect(() => {
    if (drawn.current) setLength(drawn.current.getTotalLength());
  }, [geometry]);

  // Scroll: progress through the band, and the linked item nearest above mid-screen.
  useEffect(() => {
    if (!interactive) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduce);
    let frame = 0;
    const update = () => {
      frame = 0;
      const b = band.current;
      const p = panel.current;
      if (!b || !p) return;
      const rect = b.getBoundingClientRect();
      const vh = window.innerHeight;
      const travel = rect.height - p.offsetHeight;
      const raw = travel > 0 ? -rect.top / travel : (vh - rect.top) / (vh + rect.height);
      setProgress(reduce ? 1 : Math.min(1, Math.max(0, raw)));

      let next: number | null = null;
      if (rect.bottom > 0 && rect.top < vh) {
        const canvas = b.closest(".canvas");
        let best = -Infinity;
        canvas?.querySelectorAll<HTMLElement>(`[data-route-stop^="${item.id}:"]`).forEach((el) => {
          const top = el.getBoundingClientRect().top;
          const index = Number(el.dataset.routeStop!.split(":")[1]);
          if (top <= vh * 0.5 && top > best && index < c.stops.length) {
            best = top;
            next = index;
          }
        });
      }
      setActive(next);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [interactive, item.id, c.stops.length]);

  const zoom = active !== null && !reduced && geometry ? c.stepZoom : 1;
  const focus = active !== null && geometry ? geometry.points[active] : null;
  const transform =
    zoom > 1 && focus && size
      ? `translate(${size.w / 2}px, ${size.h / 2}px) scale(${zoom}) translate(${-focus[0]}px, ${-focus[1]}px)`
      : "none";
  // The last stop the line has reached, unless a linked item names one.
  const reachedIndex = geometry ? geometry.fractions.reduce((last, f, i) => (f <= progress + 1e-6 ? i : last), -1) : -1;
  const labelIndex = active ?? (progress > 0 ? reachedIndex : -1);

  return (
    <div className="route-band" ref={band}>
      <div className={`route-panel${interactive ? " route-sticky" : ""}`} ref={panel} style={editorPanelHeight ? { height: editorPanelHeight } : undefined}>
        {geometry && size ? (
          <svg viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Route map: ${c.stops.map((s) => s.name).join(", ")}`}>
            <g className="route-move" style={{ transform, transition: reduced || !interactive ? "none" : undefined }}>
              <image href={frameUrl(geometry.frame, c.stepZoom, c.borders)} x={-size.w / 2} y={-size.h / 2} width={size.w * 2} height={size.h * 2} />
              <path d={geometry.d} className="route-line-base" strokeWidth={3 / zoom} />
              <path
                ref={drawn}
                d={geometry.d}
                className="route-line"
                stroke={c.color}
                strokeWidth={3.5 / zoom}
                strokeDasharray={length ? `${length} ${length}` : undefined}
                strokeDashoffset={length ? length * (1 - progress) : undefined}
              />
              {geometry.points.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={(i === labelIndex ? 7 : 4.5) / zoom}
                  strokeWidth={2 / zoom}
                  className={`route-stop${geometry.fractions[i] <= progress + 1e-6 ? " reached" : ""}`}
                  style={{ fill: geometry.fractions[i] <= progress + 1e-6 ? c.color : undefined }}
                />
              ))}
            </g>
          </svg>
        ) : null}
        {labelIndex >= 0 && c.stops[labelIndex] ? (
          <span className="route-label" aria-live="polite">
            {c.stops[labelIndex].name}
          </span>
        ) : null}
      </div>
      {!interactive ? <span className="route-band-note">route map band · the map stays on screen while the page scrolls through here</span> : null}
    </div>
  );
}
