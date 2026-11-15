import assert from "node:assert/strict";
import { test } from "node:test";
import { SEMICOLON_PAUSE, typedCount, typeInterval, typeSchedule } from "../src/lib/typewriter.ts";

test("letters type one interval apart", () => {
  const s = typeSchedule([..."abc"]);
  const step = typeInterval(3);
  assert.deepEqual(s, [0, step, 2 * step]);
});

test("the typewriter pauses a beat after a semicolon", () => {
  const chars = [..."ab; c"];
  const s = typeSchedule(chars);
  const step = typeInterval(chars.length);
  // The space after the semicolon waits; the semicolon itself does not.
  assert.equal(s[2], 2 * step);
  assert.equal(s[3], 3 * step + SEMICOLON_PAUSE);
  assert.equal(s[4], 4 * step + SEMICOLON_PAUSE);
});

test("typedCount counts the letters due by a time", () => {
  const s = [0, 50, 300];
  assert.equal(typedCount(s, 0), 1);
  assert.equal(typedCount(s, 299), 2);
  assert.equal(typedCount(s, 300), 3);
  assert.equal(typedCount(s, 1000, 2), 3);
});
