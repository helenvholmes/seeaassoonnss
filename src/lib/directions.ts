// Driving directions for route maps: the road path between stops, from the public
// OSRM server on OpenStreetMap data (free, no key; fair use, about one request per
// second). Only the signed-in owner asks, and only when they press "Follow roads".
// The path is saved in the route's `line`, so readers never call this service.

type Position = [number, number];

export class DirectionsError extends Error {}

/** Stops per request. Consecutive chunks share their boundary stop. */
export const DIRECTIONS_CHUNK = 25;

/** Splits stops into overlapping chunks: [a..y], [y..], … so the legs join up. */
export function chunkStops<T>(stops: T[], size = DIRECTIONS_CHUNK): T[][] {
  if (stops.length < 2) return [];
  const out: T[][] = [];
  for (let start = 0; start < stops.length - 1; start += size - 1) out.push(stops.slice(start, start + size));
  return out;
}

/** Joins chunk paths, dropping each later chunk's first point (the shared stop). */
export function joinPaths(paths: Position[][]): Position[] {
  const out: Position[] = [];
  paths.forEach((p, i) => out.push(...(i === 0 ? p : p.slice(1))));
  return out;
}

const round = (n: number) => Math.round(n * 1e5) / 1e5;

let lastRequest = 0;

async function leg(stops: Position[], userAgent: string): Promise<Position[]> {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
  const coords = stops.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=false`;
  const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res) throw new DirectionsError("The road routing service did not answer. Try again in a minute.");
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; routes?: { geometry?: { coordinates?: Position[] } }[] } | null;
  if (data?.code === "NoRoute") throw new DirectionsError("No driving route connects these stops (is one across water?).");
  if (!res.ok || data?.code !== "Ok") throw new DirectionsError(`Road routing is not available right now${data?.message ? `: ${data.message}` : ` (HTTP ${res.status})`}.`);
  const line = data.routes?.[0]?.geometry?.coordinates ?? [];
  return line.filter((c) => Math.abs(c[1]) <= 85).map(([lon, lat]) => [round(lon), round(lat)]);
}

/** The driving path through the stops, in order. */
export async function drivingPath(stops: Position[], userAgent: string): Promise<Position[]> {
  const paths: Position[][] = [];
  for (const chunk of chunkStops(stops)) paths.push(await leg(chunk, userAgent));
  return joinPaths(paths);
}
