"use client";
// What sits behind all items: one 3D model or one p5.js sketch. It fills the
// screen and stays put while the page scrolls past (CSS sticky inside the canvas).
import { useEffect, useMemo, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/client";
import type { BackgroundLayer as Layer } from "@/lib/schema";
import { P5_VERSION, sketchDocument, type FrameMessage } from "@/lib/sketch-frame";
import { prefersReducedMotion, subscribeMotion } from "./motion";
import { ModelView } from "./items/ModelView";

export const P5_URL = `${BASE_PATH}/vendor/p5.min.js?v=${P5_VERSION}`;

function SketchFrame({ code, live, onError }: { code: string; live: boolean; onError?: (message: string) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(() => sketchDocument(code, P5_URL), [code]);
  useEffect(() => {
    if (!live || prefersReducedMotion()) return;
    return subscribeMotion((m) => {
      const el = frame.current;
      if (!el?.contentWindow) return;
      const r = el.getBoundingClientRect();
      const message: FrameMessage = { type: "seasons:pointer", x: m.x - r.left, y: m.y - r.top, scroll: m.scroll };
      // The frame has an opaque origin, so "*" is the only target that reaches it. Nothing private is sent.
      el.contentWindow.postMessage(message, "*");
    });
  }, [live]);
  useEffect(() => {
    if (!onError) return;
    const listen = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.type === "seasons:sketch-error") onError(String(e.data.message));
    };
    window.addEventListener("message", listen);
    return () => window.removeEventListener("message", listen);
  }, [onError]);
  // sandbox="allow-scripts" without allow-same-origin: the sketch cannot reach the page, cookies or the API.
  return <iframe ref={frame} className="sketch-frame" title="background sketch" sandbox="allow-scripts" srcDoc={srcDoc} tabIndex={-1} />;
}

export function BackgroundLayer({
  layer,
  mediaBase,
  live,
  poster,
  onSketchError,
}: {
  layer: Layer;
  mediaBase: string;
  live: boolean;
  poster: { src: string; srcSet: string } | null;
  onSketchError?: (message: string) => void;
}) {
  // The sketch frame is created in the browser only, so the server HTML stays small.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div className="bg-layer" aria-hidden>
      <div className="bg-layer-screen">
        {layer.kind === "model" ? (
          <ModelView content={layer.model} mediaBase={mediaBase} live={live} poster={poster} />
        ) : mounted ? (
          <SketchFrame code={layer.code} live={live} onError={onSketchError} />
        ) : null}
      </div>
    </div>
  );
}
