import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, removeItem, setRouteStops } from "../src/components/editor/ops.ts";
import { fitRoute, parseRouteGeoJSON, RouteImportError, routeProjection, stopFractions, thin } from "../src/lib/route.ts";
import { emptySeasonDoc, itemSchema, type Item } from "../src/lib/schema.ts";

const pt = (name: string, lon: number, lat: number, extra: object = {}) => ({ type: "Feature", properties: { name, ...extra }, geometry: { type: "Point", coordinates: [lon, lat] } });

test("points become stops in file order; a line becomes the path", () => {
  const r = parseRouteGeoJSON({
    type: "FeatureCollection",
    features: [pt("lisbon", -9.14, 38.72), { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[-9.14, 38.72], [-3.7, 40.42], [2.17, 41.39]] } }, pt("madrid", -3.7, 40.42), pt("barcelona", 2.17, 41.39)],
  });
  assert.deepEqual(r.stops.map((s) => s.name), ["lisbon", "madrid", "barcelona"]);
  assert.equal(r.line.length, 3);
});

test("Google Takeout Saved Places names; a line alone gets start and end stops", () => {
  const takeout = { type: "FeatureCollection", features: [{ type: "Feature", properties: { location: { name: "Tate Modern" } }, geometry: { type: "Point", coordinates: [-0.0994, 51.5076] } }] };
  assert.equal(parseRouteGeoJSON(takeout).stops[0].name, "Tate Modern");
  const lineOnly = parseRouteGeoJSON({ type: "LineString", coordinates: [[0, 0], [1, 1], [2, 2]] });
  assert.deepEqual(lineOnly.stops.map((s) => s.name), ["start", "end"]);
  assert.throws(() => parseRouteGeoJSON({ type: "FeatureCollection", features: [] }), RouteImportError);
  assert.throws(() => parseRouteGeoJSON([1, 2]), RouteImportError);
});

test("long paths are thinned, keeping both ends", () => {
  const pts = Array.from({ length: 12000 }, (_, i) => i);
  const t = thin(pts, 5000);
  assert.equal(t.length, 5000);
  assert.equal(t[0], 0);
  assert.equal(t[t.length - 1], 11999);
});

test("stop fractions run from 0 to 1 along the route", () => {
  const f = stopFractions({ stops: [{ name: "a", lon: 0, lat: 0 }, { name: "b", lon: 10, lat: 0 }, { name: "c", lon: 30, lat: 0 }], line: [] });
  assert.equal(f[0], 0);
  assert.ok(Math.abs(f[1] - 1 / 3) < 1e-9);
  assert.equal(f[2], 1);
});

test("the projection is the same on both sides and keeps every stop in the frame", () => {
  const content = { stops: [{ name: "fiji", lon: 178, lat: -17.7 }, { name: "samoa", lon: -172, lat: -13.8 }], line: [] };
  const a = fitRoute(content, 800, 600);
  const b = fitRoute(content, 800, 600);
  assert.deepEqual(a, b);
  assert.ok(Math.abs(a.lon) > 170, "centered across the 180° meridian");
  for (const s of content.stops) {
    const [x, y] = routeProjection(a)([s.lon, s.lat])!;
    assert.ok(x > 0 && x < 800 && y > 0 && y < 600, `${s.name} at ${x},${y}`);
  }
  const single = fitRoute({ stops: [{ name: "one", lon: 2.35, lat: 48.85 }], line: [] }, 400, 400);
  assert.ok(Number.isFinite(single.scale) && single.scale > 0);
  const [x, y] = routeProjection(single)([2.35, 48.85])!;
  assert.ok(Math.abs(x - 200) < 1 && Math.abs(y - 200) < 1, "a single stop sits in the middle");
});

test("route items validate; removing a route clears links to it", () => {
  const route: Item = {
    id: "00000000-0000-4000-8000-000000000001",
    type: "route",
    desktop: { x: 720, y: 0, w: 720, h: 2700, rotation: 0, z: 1, locked: false },
    mobile: { x: 0, y: 0, w: 390, h: 2400, rotation: 0, z: 1, locked: false },
    content: { stops: [{ name: "a", lon: 0, lat: 0 }], line: [], color: "#c63d32", borders: true, stepZoom: 3 },
  };
  assert.ok(itemSchema.safeParse(route).success);
  const linked: Item = {
    id: "00000000-0000-4000-8000-000000000002",
    type: "quote",
    routeStop: { routeId: route.id, index: 0 },
    desktop: { x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 2, locked: false },
    mobile: null,
    content: { markdown: "", source: "", font: "serif", size: 20, align: "left", color: "#000000", binding: null },
  };
  let doc = addItem(addItem(emptySeasonDoc("t"), route), linked);
  doc = removeItem(doc, route.id);
  assert.equal(doc.items[0].routeStop, null);
});

test("editing a route's stops keeps items linked to the same place", () => {
  const routeId = "00000000-0000-4000-8000-000000000001";
  const stop = (name: string) => ({ name, lon: 0, lat: 0 });
  const route: Item = {
    id: routeId,
    type: "route",
    desktop: { x: 0, y: 0, w: 720, h: 2700, rotation: 0, z: 1, locked: false },
    mobile: null,
    content: { stops: [stop("a"), stop("b"), stop("c")], line: [], color: "#c63d32", borders: true, stepZoom: 3 },
  };
  const linkedTo = (n: number, index: number): Item => ({
    id: `00000000-0000-4000-8000-00000000001${n}`,
    type: "quote",
    routeStop: { routeId, index },
    desktop: { x: 0, y: 0, w: 100, h: 100, rotation: 0, z: 2, locked: false },
    mobile: null,
    content: { markdown: "", source: "", font: "serif", size: 20, align: "left", color: "#000000", binding: null },
  });
  const doc = { ...emptySeasonDoc("t"), items: [route, linkedTo(0, 0), linkedTo(1, 1), linkedTo(2, 2)] };
  // Remove "b", move "c" first, and add "d" at the end.
  const next = setRouteStops(doc, routeId, [stop("c"), stop("a"), stop("d")], [2, 0, -1]);
  const r = next.items[0];
  assert.equal(r.type === "route" && r.content.stops.map((s) => s.name).join(""), "cad");
  assert.deepEqual(next.items.slice(1).map((i) => i.routeStop?.index ?? null), [1, null, 0]);
});

test("driving directions split long routes into legs that join up", async () => {
  const { chunkStops, joinPaths } = await import("../src/lib/directions.ts");
  const stops = Array.from({ length: 60 }, (_, i) => i);
  const chunks = chunkStops(stops, 25);
  assert.deepEqual(chunks.map((c) => [c[0], c[c.length - 1]]), [[0, 24], [24, 48], [48, 59]]);
  assert.deepEqual(chunkStops([1], 25), []);
  assert.deepEqual(joinPaths([[[0, 0], [1, 1]], [[1, 1], [2, 2]]]), [[0, 0], [1, 1], [2, 2]]);
});

test("a rotated route still fits the frame, and the frame keeps its angle", () => {
  const content = { stops: [{ name: "moscow", lon: 37.62, lat: 55.75 }, { name: "st petersburg", lon: 30.32, lat: 59.94 }], line: [], angle: -55 };
  const f = fitRoute(content, 400, 900);
  assert.equal(f.angle, -55);
  const [a, b] = content.stops.map((s) => routeProjection(f)([s.lon, s.lat])!);
  for (const [x, y] of [a, b]) assert.ok(x > 0 && x < 400 && y > 0 && y < 900, `${x},${y}`);
  // Turned so the route runs mostly up and down the tall frame.
  assert.ok(Math.abs(b[1] - a[1]) > Math.abs(b[0] - a[0]));
  assert.equal(fitRoute({ stops: content.stops, line: [] }, 400, 900).angle, 0);
});

test("room for place names keeps the route clear of that side", () => {
  const content = { stops: [{ name: "a", lon: 30, lat: 60 }, { name: "b", lon: 31, lat: 56 }], line: [] };
  const f = fitRoute(content, 500, 900, { left: 150 });
  for (const s of content.stops) {
    const [x] = routeProjection(f)([s.lon, s.lat])!;
    assert.ok(x > 150, `x ${x}`);
  }
});

test("place names step out of the line's way and stay in the frame", async () => {
  const { placeNames, nameSize } = await import("../src/lib/route.ts");
  const frame = { width: 400, height: 400 };
  const opts = { gap: 8, clearance: 3 };
  const size = { w: 80, h: 16 };
  // A line running right from the stop: the name should not go right.
  const rightward = Array.from({ length: 100 }, (_, i) => [200 + i * 2, 200] as [number, number]);
  const [a] = placeNames([[200, 200]], [size], rightward, frame, opts);
  assert.ok(a.dx < 0 || Math.abs(a.dy) >= size.h / 2, `placed at ${JSON.stringify(a)}`);
  // A stop at the right edge: the name goes left, inside the frame.
  const [b] = placeNames([[390, 100]], [size], [], frame, opts);
  assert.ok(390 + b.dx >= 0 && 390 + b.dx + size.w <= 400, `placed at ${JSON.stringify(b)}`);
  // Names grow with the line.
  assert.ok(nameSize(8) > nameSize(3.5));
});
