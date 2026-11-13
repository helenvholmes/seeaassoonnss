import assert from "node:assert/strict";
import { test } from "node:test";
import { addItem, removeItem } from "../src/components/editor/ops.ts";
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
