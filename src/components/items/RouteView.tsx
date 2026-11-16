"use client";

import { geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH, MAP_VERSION } from "@/lib/client";
import { fitRoute, nameOverflow, nameSize, placeNames, routeCoordinates, routeProjection, sampleRoute, stopFractions, type NamePlacement, type RouteFrame } from "@/lib/route";
import type { Layout, Placement, RouteItem } from "@/lib/schema";

const NAME_FONT = "Inter";
let measurer: CanvasRenderingContext2D | null = null;
/** A name's width in pixels, set in Inter at `size`. */
function nameWidth(text: string, size: number): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return text.length * size * 0.55;
  measurer.font = `400 ${size}px ${NAME_FONT}, sans-serif`;
  return measurer.measureText(text).width;
}

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
  if (f.angle) q.set("angle", String(f.angle));
  if (borders) q.set("borders", "1");
  q.set("v", String(MAP_VERSION));
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
  const lineOnly = c.style === "line";
  const lineWidth = c.lineWidth ?? 3.5;
  const aheadFaint = lineOnly && (c.ahead ?? "faint") === "faint";
  // Dot sizes grow with the line, like the names.
  const dotR = lineOnly ? Math.max(3.5, lineWidth * 0.9) : 4.5 + Math.max(0, lineWidth - 3.5) / 2;
  const fontSize = nameSize(lineWidth);
  // Names are measured once Inter has loaded, so they are placed by their real width.
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    if (!c.labels || fontReady) return;
    let live = true;
    document.fonts?.load(`400 ${fontSize}px ${NAME_FONT}`).then(() => live && setFontReady(true), () => live && setFontReady(true));
    return () => {
      live = false;
    };
  }, [c.labels, fontReady, fontSize]);
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
    const coords = routeCoordinates(c);
    let frame = fitRoute(c, size.w, size.h);
    let projection = routeProjection(frame);
    let points = c.stops.map((s) => (projection([s.lon, s.lat]) ?? [0, 0]) as [number, number]);
    let names: NamePlacement[] = [];
    if (c.labels) {
      // Each name goes where it covers the least of the line; if names then run off
      // the frame, the map is fitted again with room for them and they are placed again.
      const sizes = c.stops.map((s) => ({ w: nameWidth(s.name, fontSize), h: fontSize * 1.25 }));
      const opts = { gap: Math.max(dotR, lineWidth / 2) + fontSize * 0.35, clearance: lineWidth / 2 + 1 };
      const place = () => placeNames(points, sizes, sampleRoute(projection, coords), frame, opts);
      names = place();
      const over = nameOverflow(points, sizes, names, frame);
      if (over.left + over.right + over.top + over.bottom > 0.5) {
        const room = (n: number) => (n > 0.5 ? n + 6 : 0);
        frame = fitRoute(c, size.w, size.h, { left: room(over.left), right: room(over.right), top: room(over.top), bottom: room(over.bottom) });
        projection = routeProjection(frame);
        points = c.stops.map((s) => (projection([s.lon, s.lat]) ?? [0, 0]) as [number, number]);
        names = place();
      }
    }
    const d = geoPath(projection)({ type: "LineString", coordinates: coords }) ?? "";
    return { frame, d, points, names, fractions: stopFractions(c) };
    // fontReady: measure again once Inter has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, size, fontReady, fontSize, dotR, lineWidth]);

  useEffect(() => {
    if (drawn.current) setLength(drawn.current.getTotalLength() || 0);
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
          <svg
            className={`${lineOnly ? "route-svg-line" : ""}${aheadFaint ? " ahead-faint" : ""}`}
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Route map: ${c.stops.map((s) => s.name).join(", ")}`}>
            <g className="route-move" style={{ transform, transition: reduced || !interactive ? "none" : undefined }}>
              {lineOnly ? null : (
                <>
                  <image href={frameUrl(geometry.frame, c.stepZoom, c.borders)} x={-size.w / 2} y={-size.h / 2} width={size.w * 2} height={size.h * 2} />
                  <path d={geometry.d} className="route-line-base" strokeWidth={(lineWidth * 0.85) / zoom} />
                </>
              )}
              {aheadFaint ? <path d={geometry.d} className="route-line-ahead" strokeWidth={1.2 / zoom} strokeDasharray={`${4 / zoom} ${3 / zoom}`} /> : null}
              <path
                ref={drawn}
                d={geometry.d}
                className="route-line"
                stroke={c.color}
                strokeWidth={lineWidth / zoom}
                strokeDasharray={length ? `${length} ${length}` : undefined}
                strokeDashoffset={length && Number.isFinite(progress) ? length * (1 - progress) : undefined}
              />
              {lineOnly
                ? geometry.points.map(([x, y], i) => {
                    const reached = geometry.fractions[i] <= progress + 1e-6;
                    if (!aheadFaint && !reached) return null;
                    return <circle key={i} cx={x} cy={y} r={(i === labelIndex ? dotR * 1.3 : dotR) / zoom} className={`route-dot${i === labelIndex ? " current" : ""}`} />;
                  })
                : geometry.points.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={(i === labelIndex ? dotR + 2.5 : dotR) / zoom}
                  strokeWidth={2 / zoom}
                  className={`route-stop${geometry.fractions[i] <= progress + 1e-6 ? " reached" : ""}`}
                  style={{ fill: geometry.fractions[i] <= progress + 1e-6 ? c.color : undefined }}
                />
              ))}
              {c.labels
                ? c.stops.map((s, i) => {
                    const [x, y] = geometry.points[i];
                    const spot = geometry.names[i] ?? { dx: 0, dy: 0 };
                    const reached = geometry.fractions[i] <= progress + 1e-6;
                    return (
                      <text
                        key={`label${i}`}
                        x={x + spot.dx / zoom}
                        y={y + spot.dy / zoom}
                        dy="0.35em"
                        fontSize={fontSize / zoom}
                        className={`route-place${reached ? " reached" : ""}`}
                      >
                        {s.name}
                      </text>
                    );
                  })
                : null}
            </g>
          </svg>
        ) : null}
        {!lineOnly && !c.labels && labelIndex >= 0 && c.stops[labelIndex] ? (
          <span className="route-label" aria-live="polite">
            {c.stops[labelIndex].name}
          </span>
        ) : null}
      </div>
      {!interactive ? <span className="route-band-note">route map band · the map stays on screen while the page scrolls through here</span> : null}
    </div>
  );
}
