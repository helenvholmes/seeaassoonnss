// Route maps: GeoJSON import, geometry and the shared map projection.
// The browser draws the route line and the server draws the land behind it, so
// both must build exactly the same projection: fitRoute() rounds its numbers and
// routeProjection() rebuilds a projection from them on either side.
import { geoDistance, geoMercator, type GeoProjection } from "d3-geo";
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
  /** Clockwise turn of the map in degrees, after projecting. */
  angle: number;
}

const r = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export function routeProjection(f: RouteFrame): GeoProjection {
  return geoMercator().rotate([-f.lon, 0]).angle(f.angle).scale(f.scale).translate([f.tx, f.ty]);
}

/**
 * Fits the whole route into a width × height frame with some padding, plus room
 * on the left or right for place names (`inset`, in pixels).
 */
export function fitRoute(content: Pick<RouteContent, "stops" | "line" | "angle">, width: number, height: number, inset: { left?: number; right?: number } = {}): RouteFrame {
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
  // Names may take at most half the frame's width.
  const room = Math.max(0, w - 2 * pad);
  const left = Math.min(inset.left ?? 0, room / 2);
  const right = Math.min(inset.right ?? 0, room / 2);
  const target = { type: "MultiPoint" as const, coordinates: coords };
  const p = geoMercator().rotate([-lon, 0]).angle(angle).fitExtent(
    [
      [pad + left, pad],
      [w - pad - right, h - pad],
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
    ty = h / 2 - cy;
  }
  return { lon, scale, tx: r(tx, 1), ty: r(ty, 1), width: w, height: h, angle };
}

/** The equivalent zoom level of a Mercator scale (0 = the world 1000 px wide). */
export function zoomOfScale(scale: number): number {
  return Math.log2((scale * 2 * Math.PI) / 1000);
}
