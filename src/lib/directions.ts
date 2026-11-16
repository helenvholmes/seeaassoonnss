// Paths along roads or railways for route maps, from OpenStreetMap data:
// - roads: the public OSRM server (driving, fastest route)
// - railway: the public BRouter server's "rail" profile
// Both are free with no key, on fair use (about one request per second). Only the
// signed-in owner asks, and only when they press "Follow". The path is saved in the
// route's `line`, so readers never call these services.

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

export type FollowMode = "roads" | "rail";

async function politely() {
  const wait = lastRequest + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequest = Date.now();
}

const clean = (line: number[][]): Position[] => line.filter((c) => Math.abs(c[1]) <= 85).map(([lon, lat]) => [round(lon), round(lat)]);

async function railLeg(stops: Position[], userAgent: string): Promise<Position[]> {
  await politely();
  const lonlats = stops.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join("|");
  const url = `https://brouter.de/brouter?lonlats=${encodeURIComponent(lonlats)}&profile=rail&alternativeidx=0&format=geojson`;
  const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/geo+json" }, signal: AbortSignal.timeout(45000) }).catch(() => null);
  if (!res) throw new DirectionsError("The railway routing service did not answer. Try again in a minute.");
  const text = await res.text();
  let data: { features?: { geometry?: { coordinates?: number[][] } }[] } | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    // BRouter reports problems as plain text, for example a stop too far from any track.
  }
  const line = data?.features?.[0]?.geometry?.coordinates;
  if (!res.ok || !line?.length) {
    const why = text.trim().slice(0, 160);
    throw new DirectionsError(`No railway route found${why ? ` (${why})` : ""}. Every stop needs to be on or near a railway line, and long routes may need stops in between.`);
  }
  return clean(line);
}

async function leg(stops: Position[], userAgent: string): Promise<Position[]> {
  await politely();
  const coords = stops.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&continue_straight=false`;
  const res = await fetch(url, { headers: { "user-agent": userAgent, accept: "application/json" }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!res) throw new DirectionsError("The road routing service did not answer. Try again in a minute.");
  const data = (await res.json().catch(() => null)) as { code?: string; message?: string; routes?: { geometry?: { coordinates?: Position[] } }[] } | null;
  if (data?.code === "NoRoute") throw new DirectionsError("No driving route connects these stops (is one across water?).");
  if (!res.ok || data?.code !== "Ok") throw new DirectionsError(`Road routing is not available right now${data?.message ? `: ${data.message}` : ` (HTTP ${res.status})`}.`);
  return clean(data.routes?.[0]?.geometry?.coordinates ?? []);
}

/** The path through the stops, in order, along roads (driving) or railways. */
export async function followPath(stops: Position[], mode: FollowMode, userAgent: string): Promise<Position[]> {
  const paths: Position[][] = [];
  for (const chunk of chunkStops(stops)) paths.push(await (mode === "rail" ? railLeg : leg)(chunk, userAgent));
  return joinPaths(paths);
}
