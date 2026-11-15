import assert from "node:assert/strict";
import { test } from "node:test";
import { shortcutStyle, toggleMarkdown } from "../src/lib/markdown-format.ts";

/** "a [b] c" marks the selection with brackets, so cases read at a glance. */
function run(marked: string, style: "bold" | "italic") {
  const start = marked.indexOf("[");
  const end = marked.indexOf("]") - 1;
  const value = marked.replace("[", "").replace("]", "");
  const r = toggleMarkdown(value, start, end, style);
  return r.value.slice(0, r.start) + "[" + r.value.slice(r.start, r.end) + "]" + r.value.slice(r.end);
}

test("italic wraps the selection in underscores", () => {
  assert.equal(run("a [quiet] morning", "italic"), "a _[quiet]_ morning");
});

test("bold wraps the selection in double asterisks", () => {
  assert.equal(run("a [quiet] morning", "bold"), "a **[quiet]** morning");
});

test("toggling again removes the markers", () => {
  assert.equal(run("a _[quiet]_ morning", "italic"), "a [quiet] morning");
  assert.equal(run("a **[quiet]** morning", "bold"), "a [quiet] morning");
});

test("a selection that includes its markers is unwrapped", () => {
  assert.equal(run("a [_quiet_] morning", "italic"), "a [quiet] morning");
  assert.equal(run("a [**quiet**] morning", "bold"), "a [quiet] morning");
});

test("spaces at the edges stay outside the markers", () => {
  assert.equal(run("a[ quiet ]morning", "italic"), "a _[quiet]_ morning");
});

test("with nothing selected, an empty pair goes in, and comes out again", () => {
  assert.equal(run("a [] b", "italic"), "a _[]_ b");
  assert.equal(run("a _[]_ b", "italic"), "a [] b");
  assert.equal(run("a [] b", "bold"), "a **[]** b");
});

test("italic and bold combine", () => {
  assert.equal(run("**[quiet]**", "italic"), "**_[quiet]_**");
  assert.equal(run("_[quiet]_", "bold"), "_**[quiet]**_");
});

test("shortcuts: Cmd or Ctrl with B or I, nothing else", () => {
  const k = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey", boolean>> = {}) => ({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...mods });
  assert.equal(shortcutStyle(k("i", { metaKey: true })), "italic");
  assert.equal(shortcutStyle(k("B", { ctrlKey: true })), "bold");
  assert.equal(shortcutStyle(k("i")), null);
  assert.equal(shortcutStyle(k("i", { metaKey: true, shiftKey: true })), null);
  assert.equal(shortcutStyle(k("u", { metaKey: true })), null);
});
