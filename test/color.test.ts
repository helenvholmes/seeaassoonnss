import assert from "node:assert/strict";
import { test } from "node:test";
import { hexToHsv, hsvToHex } from "../src/lib/color.ts";

test("hex and HSV convert back and forth", () => {
  for (const hex of ["#000000", "#ffffff", "#c63d32", "#5b8c5a", "#2f6f8f", "#808080", "#ff00ff"]) {
    assert.equal(hsvToHex(hexToHsv(hex)), hex);
  }
  assert.deepEqual(hexToHsv("#ff0000"), { h: 0, s: 1, v: 1 });
  assert.equal(hsvToHex({ h: 120, s: 1, v: 1 }), "#00ff00");
});
