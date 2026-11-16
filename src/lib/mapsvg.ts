import "server-only";
// Draws a Map item as a small SVG: land, coastlines, optional borders (countries, and
// US states) and a dot. Vector outlines from Natural Earth (world-atlas) and the US
// Census (us-atlas), no tiles and no API key.
import { geoArea, geoOrthographic, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon, Polygon } from "geojson";
import { routeProjection, zoomOfScale, type RouteFrame } from "./route";
import { feature, mesh } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";

export const MAP_SIZE = 1000;

type Resolution = "110m" | "50m" | "10m";
const cache = new Map<Resolution, Promise<Topology>>();
const shapes = new Map<Resolution, Promise<{ land: MultiPolygon; borders: MultiLineString }>>();

/**
 * A polygon wound the wrong way covers the rest of the globe instead of itself.
 * The 10m land data has a few such tiny rings, which would paint every ocean as land,
 * so any polygon claiming more than half the sphere is dropped.
 */
export function dropInverted(polygons: Polygon["coordinates"][]): Polygon["coordinates"][] {
  return polygons.filter((coordinates) => geoArea({ type: "Polygon", coordinates }) < 2 * Math.PI);
}

function polygonsOf(g: Geometry | FeatureCollection | Feature): Polygon["coordinates"][] {
  if (g.type === "FeatureCollection") return g.features.flatMap(polygonsOf);
  if (g.type === "Feature") return g.geometry ? polygonsOf(g.geometry) : [];
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  if (g.type === "GeometryCollection") return g.geometries.flatMap(polygonsOf);
  return [];
}

function loadShapes(res: Resolution) {
  if (!shapes.has(res)) {
    shapes.set(
      res,
      load(res).then((topology) => {
        const objects = topology.objects as { land: GeometryCollection; countries: GeometryCollection };
        const land: MultiPolygon = { type: "MultiPolygon", coordinates: dropInverted(polygonsOf(feature(topology, objects.land))) };
        const borders = mesh(topology, objects.countries, (a, b) => a !== b);
        return { land, borders };
      }),
    );
  }
  return shapes.get(res)!;
}

/** Lines between US states (us-atlas has one resolution, 1:10m). */
let stateLines: Promise<MultiLineString> | null = null;
function loadStateLines() {
  stateLines ??= import("us-atlas/states-10m.json").then((m) => {
    const topology = (m.default ?? m) as unknown as Topology;
    const states = (topology.objects as { states: GeometryCollection }).states;
    return mesh(topology, states, (a, b) => a !== b);
  });
  return stateLines;
}

/** State lines from this zoom up; further out they are too small to read. */
export const STATE_LINES_ZOOM = 2;

/** Country borders, plus state lines when zoomed in enough. */
async function borderPaths(path: (g: MultiLineString) => string | null, borderShape: MultiLineString, zoom: number) {
  const country = path(borderShape) ?? "";
  const states = zoom >= STATE_LINES_ZOOM ? (path(await loadStateLines()) ?? "") : "";
  return { country, states };
}

function borderSvg({ country, states }: { country: string; states: string }, scaled: boolean) {
  // A Map item's 1000px image is usually shown at a third of that or less, so its
  // strokes are drawn heavier; route frames keep a fixed on-screen width instead.
  const fixed = scaled ? ' vector-effect="non-scaling-stroke"' : "";
  const [stateWidth, countryWidth, k] = scaled ? [0.7, 0.8, 1] : [1.6, 2, 1.6];
  return [
    states ? `<path d="${states}" fill="none" stroke="#b9b9b0" stroke-width="${stateWidth}" stroke-dasharray="${3 * k} ${3 * k}"${fixed}/>` : "",
    country ? `<path d="${country}" fill="none" stroke="#a9a9a0" stroke-width="${countryWidth}" stroke-dasharray="${4 * k} ${3 * k}"${fixed}/>` : "",
  ].join("\n");
}

function load(res: Resolution): Promise<Topology> {
  if (!cache.has(res)) {
    const json =
      res === "110m"
        ? import("world-atlas/countries-110m.json")
        : res === "50m"
          ? import("world-atlas/countries-50m.json")
          : import("world-atlas/countries-10m.json");
    cache.set(res, json.then((m) => (m.default ?? m) as unknown as Topology));
  }
  return cache.get(res)!;
}

/** More detail as the map zooms in. */
export function resolutionFor(zoom: number): Resolution {
  return zoom < 1.5 ? "110m" : zoom < 4 ? "50m" : "10m";
}

/** Globe radius in pixels: zoom 0 shows the whole globe, each step doubles it. */
export function globeRadius(zoom: number) {
  return MAP_SIZE * 0.45 * 2 ** zoom;
}

export interface MapParams {
  lat: number;
  lon: number;
  zoom: number;
  borders: boolean;
  /** Counterclockwise turn around the place, in whole degrees. */
  angle: number;
}

/** Validates and rounds query parameters, so equal maps share one cached URL. */
export function parseMapParams(search: URLSearchParams): MapParams | null {
  const lat = Number(search.get("lat"));
  const lon = Number(search.get("lon"));
  const zoom = Number(search.get("zoom"));
  const angle = Number(search.get("angle") ?? 0);
  if (![lat, lon, zoom, angle].every(Number.isFinite) || Math.abs(lat) > 85 || Math.abs(lon) > 180 || zoom < 0 || zoom > 12 || Math.abs(angle) > 180) return null;
  return {
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    zoom: Math.round(zoom * 4) / 4,
    borders: search.get("borders") === "1",
    angle: Math.round(angle),
  };
}

export async function renderMapSvg({ lat, lon, zoom, borders, angle }: MapParams): Promise<string> {
  const { land: landShape, borders: borderShape } = await loadShapes(resolutionFor(zoom));
  const half = MAP_SIZE / 2;
  const radius = globeRadius(zoom);
  // An orthographic (globe) view centered on the place. Geometry is clipped on the
  // sphere to a circle just larger than the image, which keeps the SVG small and
  // handles shapes that cross the 180° meridian or surround a pole.
  const reach = Math.hypot(half, half) * 1.05;
  const clipAngle = reach >= radius ? 90 : (Math.asin(reach / radius) * 180) / Math.PI;
  const projection = geoOrthographic()
    .rotate([-lon, -lat, angle])
    .scale(radius)
    .translate([half, half])
    .clipAngle(clipAngle)
    .precision(0.2);
  const path = geoPath(projection).digits(1);
  const land = path(landShape) ?? "";
  const borderLines = borders ? borderSvg(await borderPaths(path, borderShape, zoom), false) : "";
  // The globe's edge, while it is on the image.
  const globe = radius < half * 1.5 ? `<circle cx="${half}" cy="${half}" r="${radius.toFixed(1)}" fill="none" stroke="#c9c9c2" stroke-width="1"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_SIZE} ${MAP_SIZE}" width="${MAP_SIZE}" height="${MAP_SIZE}">
${globe}
<path d="${land}" fill="#e7e7e0" stroke="#a9a9a0" stroke-width="1.2" stroke-linejoin="round"/>
${borderLines}
<circle cx="${half}" cy="${half}" r="9" fill="#1d1d1b" stroke="#fbfbf9" stroke-width="3"/>
</svg>`;
}

/** Validates route frame parameters (see lib/route.ts fitRoute). */
export function parseFrameParams(search: URLSearchParams): (RouteFrame & { k: number; borders: boolean }) | null {
  const n = (name: string) => Number(search.get(name));
  const f = { lon: n("lon"), scale: n("scale"), tx: n("tx"), ty: n("ty"), width: n("w"), height: n("h"), k: n("k") || 1, angle: n("angle") };
  if (!Object.values(f).every(Number.isFinite)) return null;
  if (Math.abs(f.lon) > 180 || Math.abs(f.angle) > 180 || f.scale <= 0 || f.scale > 1e7) return null;
  if (f.width < 50 || f.width > 4000 || f.height < 50 || f.height > 4000 || f.k < 1 || f.k > 16) return null;
  if (Math.abs(f.tx) > 1e8 || Math.abs(f.ty) > 1e8) return null;
  return { ...f, borders: search.get("borders") === "1" };
}

/**
 * Land for a route map, in the route's own projection. The image covers the frame
 * plus half a frame on every side, so zooming in on a stop near the edge still
 * shows land. Detail matches the zoom used for stops (k).
 */
export async function renderFrameSvg(f: RouteFrame & { k: number; borders: boolean }): Promise<string> {
  // Detail between the overview and the stop zoom: full detail for the zoomed view
  // would make the image for a long route several megabytes.
  const detailZoom = zoomOfScale(f.scale) + Math.log2(f.k) / 2;
  const { land: landShape, borders: borderShape } = await loadShapes(resolutionFor(detailZoom));
  const x0 = -f.width / 2;
  const y0 = -f.height / 2;
  const projection = routeProjection(f)
    .clipExtent([
      [x0, y0],
      [f.width * 1.5, f.height * 1.5],
    ])
    .precision(0.5);
  const path = geoPath(projection).digits(0);
  const land = path(landShape) ?? "";
  const borderLines = f.borders ? borderSvg(await borderPaths(path, borderShape, detailZoom), true) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${f.width * 2} ${f.height * 2}" width="${f.width * 2}" height="${f.height * 2}">
<path d="${land}" fill="#e7e7e0" stroke="#a9a9a0" stroke-width="1" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
${borderLines}
</svg>`;
}
