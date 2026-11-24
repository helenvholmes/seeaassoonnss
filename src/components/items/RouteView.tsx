"use client";

import { geoPath } from "d3-geo";
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH, MAP_VERSION } from "@/lib/client";
import { drawProgress, fitRoute, ROUTE_SCREEN_UNITS, nameOverflow, nameSize, placeNames, routeCoordinates, routeProjection, sampleRoute, stopFractions, type NamePlacement, type RouteFrame } from "@/lib/route";
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
 * the route draws in with scroll progress, and an item linked to a stop marks that
 * stop (larger, named) while it is at or above the middle of the screen. The map
 * itself never moves: the editor places linked items so they reach mid-screen as
 * the line reaches their stop. With reduced motion, the whole route shows at once.
 */
export function RouteView({
  item,
  interactive,
  layout,
  placement,
  onDrawStart,
}: {
  item: RouteItem;
  interactive: boolean;
  layout: Layout;
  placement: Placement;
  /** Editor only: called while the start mark is dragged. */
  onDrawStart?: (drawStart: number) => void;
}) {
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
  const [editorBandHeight, setEditorBandHeight] = useState(0);
  const [progress, setProgress] = useState(interactive ? 0 : 1);
  const [active, setActive] = useState<number | null>(null);
  const [length, setLength] = useState(0);

  // Panel size → frame. In the editor the panel previews one screen's height.
  useEffect(() => {
    const el = panel.current;
    const b = band.current;
    if (!el || !b) return;
    let settle = 0;
    const measure = () => {
      if (!interactive) {
        const scale = b.clientWidth / placement.w;
        setEditorPanelHeight(Math.min(b.clientHeight, ROUTE_SCREEN_UNITS[layout] * scale));
        setEditorBandHeight(b.clientHeight);
      }
      const w = Math.max(QUANTUM, Math.round(el.clientWidth / QUANTUM) * QUANTUM);
      const h = Math.max(QUANTUM, Math.round(el.clientHeight / QUANTUM) * QUANTUM);
      const apply = () => setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
      // In the editor, wait for zooming to settle before drawing (and fetching land) at the new size.
      window.clearTimeout(settle);
      if (interactive) apply();
      else settle = window.setTimeout(apply, 180);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(b);
    return () => {
      ro.disconnect();
      window.clearTimeout(settle);
    };
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
        // The same room on opposite sides, so the route stays centered in the frame.
        const room = (a: number, b: number) => (Math.max(a, b) > 0.5 ? Math.max(a, b) + 6 : 0);
        const x = room(over.left, over.right);
        const y = room(over.top, over.bottom);
        frame = fitRoute(c, size.w, size.h, { left: x, right: x, top: y, bottom: y });
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
      setProgress(reduce ? 1 : drawProgress(raw, c.drawStart ?? 0));

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
  }, [interactive, item.id, c.stops.length, c.drawStart]);

  // The last stop the line has reached, unless a linked item names one.
  const reachedIndex = geometry ? geometry.fractions.reduce((last, f, i) => (f <= progress + 1e-6 ? i : last), -1) : -1;
  const labelIndex = active ?? (progress > 0 ? reachedIndex : -1);

  return (
    <div className="route-band" ref={band}>
      <div
        className={`route-panel${interactive ? " route-sticky" : ""}`}
        ref={panel}
        // In the editor, the preview of the pinned map sits in the middle of the band.
        style={editorPanelHeight ? { height: editorPanelHeight, top: Math.max(0, (editorBandHeight - editorPanelHeight) / 2) } : undefined}
      >
        {geometry && size ? (
          <svg
            className={`${lineOnly ? "route-svg-line" : ""}${aheadFaint ? " ahead-faint" : ""}`}
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Route map: ${c.stops.map((s) => s.name).join(", ")}`}>
            <g>
              {lineOnly ? null : (
                <>
                  <image href={frameUrl(geometry.frame, 1, c.borders)} x={-size.w / 2} y={-size.h / 2} width={size.w * 2} height={size.h * 2} />
                  <path d={geometry.d} className="route-line-base" strokeWidth={lineWidth * 0.85} />
                </>
              )}
              {aheadFaint ? <path d={geometry.d} className="route-line-ahead" strokeWidth={1.2} strokeDasharray={"4 3"} /> : null}
              <path
                ref={drawn}
                d={geometry.d}
                className="route-line"
                stroke={c.color}
                strokeWidth={lineWidth}
                strokeDasharray={length ? `${length} ${length}` : undefined}
                strokeDashoffset={length && Number.isFinite(progress) ? length * (1 - progress) : undefined}
              />
              {lineOnly
                ? geometry.points.map(([x, y], i) => {
                    const reached = geometry.fractions[i] <= progress + 1e-6;
                    if (!aheadFaint && !reached) return null;
                    return <circle key={i} cx={x} cy={y} r={i === labelIndex ? dotR * 1.3 : dotR} className={`route-dot${i === labelIndex ? " current" : ""}`} />;
                  })
                : geometry.points.map(([x, y], i) => (
                <circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={i === labelIndex ? dotR + 2.5 : dotR}
                  strokeWidth={2}
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
                        x={x + spot.dx}
                        y={y + spot.dy}
                        dy="0.35em"
                        fontSize={fontSize}
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
      {!interactive && editorPanelHeight && geometry ? (
        <ScrollScale band={editorBandHeight} screen={editorPanelHeight} drawStart={c.drawStart ?? 0} onDrawStart={onDrawStart} color={c.color} stops={c.stops.map((s, i) => ({ name: s.name, at: geometry.fractions[i] }))} />
      ) : null}
    </div>
  );
}

/**
 * The editor's guide to how the band plays, measured at the middle of the screen
 * (where linked items move the map): the line starts drawing when the top mark
 * reaches mid-screen, reaches each stop at its tick, and is complete at the bottom
 * mark. Above and below the marks, the map scrolls in and out with the page.
 */
function ScrollScale({
  band,
  screen,
  drawStart,
  onDrawStart,
  color,
  stops,
}: {
  color: string;
  band: number;
  screen: number;
  drawStart: number;
  onDrawStart?: (drawStart: number) => void;
  stops: { name: string; at: number }[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLDivElement>(null);
  // The start mark can be dragged. Native listeners stop the press before the editor
  // sees it, so dragging the mark never moves or deselects the route item.
  useEffect(() => {
    const el = grip.current;
    if (!el || !onDrawStart) return;
    const stop = (e: Event) => e.stopPropagation();
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      document.body.classList.add("is-dragging-route-start");
      const move = (ev: PointerEvent) => {
        const r = box.current?.getBoundingClientRect();
        if (!r) return;
        // The band is drawn at the editor's zoom; measure in its own on-screen pixels.
        const k = r.height / band;
        const s = ((ev.clientY - r.top) / k - screen / 2) / (band - screen);
        onDrawStart(Math.round(Math.min(0.9, Math.max(0, s)) * 100) / 100);
      };
      const up = () => {
        document.body.classList.remove("is-dragging-route-start");
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("mousedown", stop);
    el.addEventListener("touchstart", stop);
    el.addEventListener("dblclick", stop);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("mousedown", stop);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("dblclick", stop);
    };
  }, [onDrawStart, band, screen]);
  const travel = band - screen;
  if (travel <= 0) {
    return <span className="route-scale-note">Make this band taller than one screen: the route draws in while the page scrolls through it.</span>;
  }
  const pin = screen / 2;
  const s = Math.min(0.9, Math.max(0, drawStart));
  const begin = pin + s * travel;
  const end = pin + travel;
  const y = (f: number) => begin + f * (end - begin);
  return (
    <div className="route-scale" ref={box} aria-hidden style={{ "--route": color } as React.CSSProperties}>
      <div className="route-scale-outside" style={{ top: 0, height: pin }} />
      <div className="route-scale-outside" style={{ top: end, bottom: 0 }} />
      {s > 0 ? (
        <>
          <div className="route-scale-mark is-pin" style={{ top: pin }}>
            <span>▼ map pins · line waits</span>
          </div>
          <div className="route-scale-wait" style={{ top: pin, height: begin - pin }} />
        </>
      ) : null}
      <div className="route-scale-rail" style={{ top: begin, height: end - begin }} />
      <div className={`route-scale-mark is-start${onDrawStart ? " is-draggable" : ""}`} style={{ top: begin }}>
        <span>▼ line starts drawing at mid-screen</span>
        {onDrawStart ? (
          <div ref={grip} className="route-scale-grip" title="Drag to change when the line starts drawing">
            ↕ drag
          </div>
        ) : null}
      </div>
      {stops.map((s, i) => (
        <div key={i} className="route-scale-stop" style={{ top: y(s.at) }}>
          <span>{s.name}</span>
        </div>
      ))}
      <div className="route-scale-mark is-end" style={{ top: y(1) }}>
        <span>▲ line complete · map scrolls away below</span>
      </div>
    </div>
  );
}
