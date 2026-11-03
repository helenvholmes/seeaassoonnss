import "server-only";
// Draws a Map item as a small SVG: land, coastlines, optional country borders and a
// dot. Vector outlines from Natural Earth (world-atlas), no tiles and no API key.
import { geoArea, geoOrthographic, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry, MultiLineString, MultiPolygon, Polygon } from "geojson";
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
}

/** Validates and rounds query parameters, so equal maps share one cached URL. */
export function parseMapParams(search: URLSearchParams): MapParams | null {
  const lat = Number(search.get("lat"));
  const lon = Number(search.get("lon"));
  const zoom = Number(search.get("zoom"));
  if (![lat, lon, zoom].every(Number.isFinite) || Math.abs(lat) > 85 || Math.abs(lon) > 180 || zoom < 0 || zoom > 12) return null;
  return {
    lat: Math.round(lat * 1e4) / 1e4,
    lon: Math.round(lon * 1e4) / 1e4,
    zoom: Math.round(zoom * 4) / 4,
    borders: search.get("borders") === "1",
  };
}

export async function renderMapSvg({ lat, lon, zoom, borders }: MapParams): Promise<string> {
  const { land: landShape, borders: borderShape } = await loadShapes(resolutionFor(zoom));
  const half = MAP_SIZE / 2;
  const radius = globeRadius(zoom);
  // An orthographic (globe) view centered on the place. Geometry is clipped on the
  // sphere to a circle just larger than the image, which keeps the SVG small and
  // handles shapes that cross the 180° meridian or surround a pole.
  const reach = Math.hypot(half, half) * 1.05;
  const clipAngle = reach >= radius ? 90 : (Math.asin(reach / radius) * 180) / Math.PI;
  const projection = geoOrthographic()
    .rotate([-lon, -lat])
    .scale(radius)
    .translate([half, half])
    .clipAngle(clipAngle)
    .precision(0.2);
  const path = geoPath(projection).digits(1);
  const land = path(landShape) ?? "";
  const borderPath = borders ? (path(borderShape) ?? "") : "";
  // The globe's edge, while it is on the image.
  const globe = radius < half * 1.5 ? `<circle cx="${half}" cy="${half}" r="${radius.toFixed(1)}" fill="none" stroke="#c9c9c2" stroke-width="1"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MAP_SIZE} ${MAP_SIZE}" width="${MAP_SIZE}" height="${MAP_SIZE}">
${globe}
<path d="${land}" fill="#e7e7e0" stroke="#a9a9a0" stroke-width="1.2" stroke-linejoin="round"/>
${borderPath ? `<path d="${borderPath}" fill="none" stroke="#bdbdb4" stroke-width="0.8" stroke-dasharray="3 3"/>` : ""}
<circle cx="${half}" cy="${half}" r="9" fill="#1d1d1b" stroke="#fbfbf9" stroke-width="3"/>
</svg>`;
}
