// The HTML document a p5.js sketch background runs in. It is put in an iframe with
// sandbox="allow-scripts" and srcdoc, so the sketch runs in an opaque origin: it
// cannot read the page, the owner's session cookie or storage, and cannot call the
// app's API as the owner. Pure, so tests can check the escaping.
//
// The sketch is written in p5's global mode (setup() and draw() as plain
// functions), as in the p5.js web editor, so a sketch can be pasted from there.
// The iframe sits behind all items and gets no pointer events of its own; the
// page sends the cursor as messages, and this frame replays them as pointermove
// events, so mouseX and mouseY work. On touch screens the "cursor" follows the
// scroll position instead. Extra values are on window.seasons:
//   seasons.scroll         0 at the top of the page, 1 at the end
//   seasons.reducedMotion  true when the visitor asked for less motion
// With reduced motion on, the sketch draws one frame and stops.

export const P5_VERSION = "2.3.4";

export interface FrameMessage {
  type: "seasons:pointer";
  /** Viewport coordinates of the cursor. */
  x: number;
  y: number;
  scroll: number;
}

/** Makes text safe inside an inline <script>: no "</script", "<!--" or "<script" can close or confuse it. */
export function escapeInlineScript(code: string): string {
  return code.replace(/<(\/?script|!--)/gi, "\\x3C$1");
}

const PREAMBLE = `
window.seasons = { scroll: 0, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
addEventListener("message", function (e) {
  var m = e.data;
  if (!m || m.type !== "seasons:pointer") return;
  window.seasons.scroll = m.scroll;
  dispatchEvent(new PointerEvent("pointermove", { clientX: m.x, clientY: m.y, pointerType: "mouse", pointerId: 1, isPrimary: true }));
});
addEventListener("error", function (e) {
  parent.postMessage({ type: "seasons:sketch-error", message: String(e.message || e) }, "*");
});
if (window.seasons.reducedMotion) {
  // One frame, then stop.
  var stopper = setInterval(function () {
    if (typeof frameCount === "number" && frameCount >= 1 && typeof noLoop === "function") { noLoop(); clearInterval(stopper); }
  }, 50);
}
`;

/** `p5Url`: the app's copy of p5.js, for example /seasons/vendor/p5.min.js?v=2.3.4. */
export function sketchDocument(code: string, p5Url: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}canvas{display:block}</style>
<script>${PREAMBLE}</script>
<script src="${p5Url.replace(/"/g, "&quot;")}"></script>
</head><body><script>
${escapeInlineScript(code)}
</script></body></html>`;
}
