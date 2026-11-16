// Route maps: GeoJSON import, geometry and the shared map projection.
// The browser draws the route line and the server draws the land behind it, so
// both must build exactly the same projection: fitRoute() rounds its numbers and
// routeProjection() rebuilds a projection from them on either side.
import { geoDistance, geoInterpolate, geoMercator, type GeoProjection } from "d3-geo";
import { ROUTE_MAX_LINE_POINTS, ROUTE_MAX_STOPS, type RouteContent } from "./schema.ts";

type Position = [number, number];
type Stop = RouteContent["stops"][number];

export class RouteImportError extends Error {}

const inRange = (p: unknown): p is Position =>
  Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number" && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 85;

/** A place name from common GeoJSON exports (plain GeoJSON, Google Takeout "Saved Places", My Maps). */
function nameOf(properties: Record<string, unknown> | null | undefined, n: number): string {
  const p = properties ?? {};
  const location = (p.location ?? {}) as Record<string, unknown>;
  for (const value of [p.name, p.Name, p.title, p.Title, location.name, location.Name, p.label]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 200);
  }
  return `stop ${n}`;
}

/** Keeps at most `max` points, evenly spaced, always keeping the first and last. */
export function thin<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return out;
}

/**
 * Reads GeoJSON into a route. Point features, in file order, become the stops.
 * LineString and MultiLineString features become the drawn path. A file with only
 * a line gets its first and last points as stops.
 */
export function parseRouteGeoJSON(input: unknown): { stops: Stop[]; line: Position[] } {
  const stops: Stop[] = [];
  const line: Position[] = [];
  let skipped = 0;

  const visit = (geometry: unknown, properties: Record<string, unknown> | null) => {
    const g = geometry as { type?: string; coordinates?: unknown; geometries?: unknown[] } | null;
    if (!g || typeof g !== "object") return;
    switch (g.type) {
      case "Point":
        if (inRange(g.coordinates)) stops.push({ name: nameOf(properties, stops.length + 1), lon: g.coordinates[0], lat: g.coordinates[1] });
        else skipped++;
        break;
      case "MultiPoint":
        for (const c of (g.coordinates as unknown[]) ?? []) visit({ type: "Point", coordinates: c }, properties);
        break;
      case "LineString":
        for (const c of (g.coordinates as unknown[]) ?? []) {
          if (inRange(c)) line.push([c[0], c[1]]);
          else skipped++;
        }
        break;
      case "MultiLineString":
        for (const part of (g.coordinates as unknown[]) ?? []) visit({ type: "LineString", coordinates: part }, properties);
        break;
      case "GeometryCollection":
        for (const part of g.geometries ?? []) visit(part, properties);
        break;
    }
  };

  const root = input as { type?: string; features?: unknown[]; geometry?: unknown; properties?: Record<string, unknown> | null } | null;
  if (!root || typeof root !== "object" || typeof root.type !== "string") throw new RouteImportError("This is not GeoJSON.");
  if (root.type === "FeatureCollection") {
    for (const f of root.features ?? []) {
      const feature = f as { geometry?: unknown; properties?: Record<string, unknown> | null };
      visit(feature?.geometry, feature?.properties ?? null);
    }
  } else if (root.type === "Feature") {
    visit(root.geometry, root.properties ?? null);
  } else {
    visit(root, null);
  }

  if (!stops.length && line.length >= 2) {
    stops.push({ name: "start", lon: line[0][0], lat: line[0][1] }, { name: "end", lon: line[line.length - 1][0], lat: line[line.length - 1][1] });
  }
  if (!stops.length) throw new RouteImportError("No places found. The file needs Point features (the stops) or a LineString (the path).");
  if (stops.length > ROUTE_MAX_STOPS) throw new RouteImportError(`The route has ${stops.length} stops; the limit is ${ROUTE_MAX_STOPS}.`);
  if (skipped) console.warn(`Route import: skipped ${skipped} coordinates outside ±180° / ±85°.`);
  return { stops, line: thin(line, ROUTE_MAX_LINE_POINTS) };
}

/** The coordinates the route line follows: the imported path, or the stops in order. */
export function routeCoordinates(content: Pick<RouteContent, "stops" | "line">): Position[] {
  return content.line.length >= 2 ? content.line : content.stops.map((s) => [s.lon, s.lat] as Position);
}

/**
 * Where each stop falls along the route, from 0 (start) to 1 (end), measured on the
 * globe. Stops on an imported path are matched to its nearest point.
 */
export function stopFractions(content: Pick<RouteContent, "stops" | "line">): number[] {
  const coords = routeCoordinates(content);
  if (coords.length < 2) return content.stops.map(() => 0);
  const cumulative = [0];
  for (let i = 1; i < coords.length; i++) cumulative.push(cumulative[i - 1] + geoDistance(coords[i - 1], coords[i]));
  const total = cumulative[cumulative.length - 1] || 1;
  if (content.line.length < 2) return cumulative.map((c) => c / total);
  return content.stops.map((s) => {
    let best = 0;
    let bestDistance = Infinity;
    coords.forEach((c, i) => {
      const d = geoDistance(c, [s.lon, s.lat]);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    return cumulative[best] / total;
  });
}

export interface RouteFrame {
  /** Center longitude the projection rotates to (avoids the 180° cut). */
  lon: number;
  /** Mercator scale. */
  scale: number;
  tx: number;
  ty: number;
  width: number;
  height: number;
  /** Counterclockwise turn of the map in degrees, after projecting. */
  angle: number;
}

const r = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function routeProjection(f: RouteFrame): GeoProjection {
  return geoMercator().rotate([-f.lon, 0]).angle(f.angle).scale(f.scale).translate([f.tx, f.ty]);
}

export interface Inset {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
}

/**
 * Fits the whole route into a width × height frame with some padding, plus extra
 * room on any side for place names that would otherwise run off it (`inset`, in pixels).
 */
export function fitRoute(content: Pick<RouteContent, "stops" | "line" | "angle">, width: number, height: number, inset: Inset = {}): RouteFrame {
  const angle = r(content.angle ?? 0, 1);
  const w = Math.max(50, Math.round(width));
  const h = Math.max(50, Math.round(height));
  const coords = [...routeCoordinates(content), ...content.stops.map((s) => [s.lon, s.lat] as Position)];
  const lons = coords.map((c) => c[0]);
  // Center on the middle of the route's longitudes, measured the short way round.
  const mean = Math.atan2(
    lons.reduce((a, l) => a + Math.sin((l * Math.PI) / 180), 0),
    lons.reduce((a, l) => a + Math.cos((l * Math.PI) / 180), 0),
  );
  const lon = r((mean * 180) / Math.PI, 3);
  const pad = Math.min(w, h) * 0.12;
  // Names may take at most half the frame on each axis.
  const roomX = Math.max(0, w - 2 * pad) / 2;
  const roomY = Math.max(0, h - 2 * pad) / 2;
  const left = Math.min(inset.left ?? 0, roomX);
  const right = Math.min(inset.right ?? 0, roomX);
  const top = Math.min(inset.top ?? 0, roomY);
  const bottom = Math.min(inset.bottom ?? 0, roomY);
  const target = { type: "MultiPoint" as const, coordinates: coords };
  const p = geoMercator().rotate([-lon, 0]).angle(angle).fitExtent(
    [
      [pad + left, pad + top],
      [w - pad - right, h - pad - bottom],
    ],
    target,
  );
  // A single place (or very close places) would zoom in without limit.
  const scale = r(Math.min(p.scale(), (1000 / (2 * Math.PI)) * 2 ** 11), 2);
  let [tx, ty] = p.translate();
  if (scale !== r(p.scale(), 2)) {
    // Re-center at the capped scale.
    const capped = geoMercator().rotate([-lon, 0]).angle(angle).scale(scale).translate([0, 0]);
    const [cx, cy] = capped(coords[0])!;
    tx = (w + left - right) / 2 - cx;
    ty = (h + top - bottom) / 2 - cy;
  }
  return { lon, scale, tx: r(tx, 1), ty: r(ty, 1), width: w, height: h, angle };
}

/** The equivalent zoom level of a Mercator scale (0 = the world 1000 px wide). */
export function zoomOfScale(scale: number): number {
  return Math.log2((scale * 2 * Math.PI) / 1000);
}

// ---------- Place names ----------

type Point = [number, number];

/** Name size in pixels for a line thickness: names grow with the line. */
export function nameSize(lineWidth: number): number {
  return Math.round((9 + lineWidth * 1.15) * 2) / 2;
}

/**
 * Points along the drawn route, in pixels, at most `step` apart. Straight stretches
 * between stops follow the great circle, as the drawn line does.
 */
export function sampleRoute(projection: GeoProjection, coords: Position[], step = 3): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < coords.length; i++) {
    const p = projection(coords[i]);
    if (!p) continue;
    if (i > 0) {
      const q = projection(coords[i - 1]);
      const gap = q ? Math.hypot(p[0] - q[0], p[1] - q[1]) : 0;
      if (gap > step) {
        const along = geoInterpolate(coords[i - 1], coords[i]);
        const n = Math.min(400, Math.ceil(gap / step));
        for (let k = 1; k < n; k++) {
          const m = projection(along(k / n));
          if (m) out.push([m[0], m[1]]);
        }
      }
    }
    out.push([p[0], p[1]]);
  }
  return out;
}

export interface NamePlacement {
  /** Left edge of the text, relative to its stop, in pixels. */
  dx: number;
  /** Vertical middle of the text, relative to its stop, in pixels. */
  dy: number;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Where a name may sit around its stop, in order of preference when all else is equal.
const SPOTS: [number, number][] = [
  [1, 0], // right
  [-1, 0], // left
  [1, -1], // above right
  [1, 1], // below right
  [-1, -1], // above left
  [-1, 1], // below left
  [0, -1], // above
  [0, 1], // below
];

/**
 * Picks a spot for each stop's name (right, left, above, below or a corner) that
 * covers as little of the line, the stops and the other names as possible, and
 * stays inside the frame. `sizes` are the names' widths and heights in pixels.
 */
export function placeNames(
  stops: Point[],
  sizes: { w: number; h: number }[],
  line: Point[],
  frame: { width: number; height: number },
  { gap, clearance }: { gap: number; clearance: number },
): NamePlacement[] {
  // Line points in a grid of cells, so each test only looks at nearby points.
  const cell = 24;
  const grid = new Map<string, Point[]>();
  for (const p of line) {
    const k = `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`;
    const list = grid.get(k);
    if (list) list.push(p);
    else grid.set(k, [p]);
  }
  const lineHits = (b: Box) => {
    let n = 0;
    const x0 = b.x0 - clearance, x1 = b.x1 + clearance, y0 = b.y0 - clearance, y1 = b.y1 + clearance;
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) {
        for (const p of grid.get(`${cx},${cy}`) ?? []) if (p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1) n++;
      }
    }
    return n;
  };
  const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const boxFor = ([x, y]: Point, { w, h }: { w: number; h: number }, [sx, sy]: [number, number]): Box => {
    const g = sx && sy ? gap * 0.75 : gap;
    const x0 = sx > 0 ? x + g : sx < 0 ? x - g - w : x - w / 2;
    const y0 = sy > 0 ? y + g : sy < 0 ? y - g - h : y - h / 2;
    return { x0, y0, x1: x0 + w, y1: y0 + h };
  };

  const placed: Box[] = [];
  return stops.map((stop, i) => {
    let best: Box | null = null;
    let bestScore = Infinity;
    SPOTS.forEach((spot, rank) => {
      const b = boxFor(stop, sizes[i], spot);
      let score = rank * 0.5 + lineHits(b) * 10;
      // Other stops' dots.
      stops.forEach((s, j) => {
        if (j !== i && s[0] >= b.x0 - gap && s[0] <= b.x1 + gap && s[1] >= b.y0 - gap && s[1] <= b.y1 + gap) score += 40;
      });
      for (const p of placed) score += overlap(b, p) * 0.5;
      // Running off the frame.
      const out = Math.max(0, -b.x0) + Math.max(0, b.x1 - frame.width) + Math.max(0, -b.y0) + Math.max(0, b.y1 - frame.height);
      score += out * 4;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    });
    const b = best!;
    placed.push(b);
    return { dx: b.x0 - stop[0], dy: (b.y0 + b.y1) / 2 - stop[1] };
  });
}

/** How far placed names run past each edge of the frame, in pixels. */
export function nameOverflow(stops: Point[], sizes: { w: number; h: number }[], placements: NamePlacement[], frame: { width: number; height: number }): Required<Inset> {
  const o = { left: 0, right: 0, top: 0, bottom: 0 };
  placements.forEach((p, i) => {
    const x0 = stops[i][0] + p.dx;
    const y0 = stops[i][1] + p.dy - sizes[i].h / 2;
    o.left = Math.max(o.left, -x0);
    o.right = Math.max(o.right, x0 + sizes[i].w - frame.width);
    o.top = Math.max(o.top, -y0);
    o.bottom = Math.max(o.bottom, y0 + sizes[i].h - frame.height);
  });
  return o;
}
