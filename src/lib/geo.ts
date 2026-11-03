// Place lookup for Map items: typed coordinates, or a search through OpenStreetMap's
// Nominatim service (free, no key; at most one request per second, and requests must
// identify the app). Only the signed-in owner can search, so traffic stays tiny.

export interface Place {
  lat: number;
  lon: number;
  label: string;
}

/** "40.7128, -74.006" or "40.7128 -74.006" → coordinates. */
export function parseCoordinates(text: string): Place | null {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null;
  return { lat, lon, label: "" };
}

export class GeoError extends Error {}

let lastRequest = 0;

export async function searchPlaces(query: string, userAgent: string): Promise<Place[]> {
  const q = query.trim().slice(0, 200);
  if (!q) return [];
  const coords = parseCoordinates(q);
  if (coords) return [coords];
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res || !res.ok) throw new GeoError(`Place search is not available right now${res ? ` (HTTP ${res.status})` : ""}. Type coordinates instead, for example 40.71, -74.01.`);
  const rows = (await res.json()) as { lat: string; lon: string; display_name: string; name?: string }[];
  return rows
    .map((r) => ({ lat: Number(r.lat), lon: Number(r.lon), label: r.name || r.display_name.split(",")[0] }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85);
}
