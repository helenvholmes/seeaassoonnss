import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { geoArea } from "d3-geo";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);

// Same rule as dropInverted in src/lib/mapsvg.ts (that module is server-only).
const inverted = (coordinates: number[][][]) => geoArea({ type: "Polygon", coordinates } as never) >= 2 * Math.PI;

test("the 10m land data has tiny rings that would cover the globe; the filter catches only those", () => {
  const topo = require("world-atlas/countries-10m.json");
  const land = feature(topo, topo.objects.land) as unknown as { features: { geometry: { coordinates: number[][][][] } }[] };
  const polygons = land.features[0].geometry.coordinates;
  const bad = polygons.filter(inverted);
  assert.ok(bad.length >= 1);
  assert.ok(bad.every((p) => p[0].length <= 5), "only degenerate rings are dropped");
});
