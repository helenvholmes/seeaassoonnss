"use client";
// A 3D model: its poster image first, then the live model once it is near the
// screen. Far from the screen the live view is removed again, which frees its
// WebGL context (browsers allow only about 16 at once). Without WebGL, or if
// the model fails to load, the poster stays.
import dynamic from "next/dynamic";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import type { ModelContent } from "@/lib/schema";
import { prefersReducedMotion } from "../motion";
import { hasWebGL, modelUrl } from "./model-url";

const ModelScene = dynamic(() => import("./ModelScene"), { ssr: false });

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn("[seasons] 3D model did not load; showing its poster.", error);
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** `poster`: the poster's image attributes, made by the caller (see ItemContent.modelPoster). */
export function ModelView({ content, mediaBase, live, poster }: { content: ModelContent; mediaBase: string; live: boolean; poster: { src: string; srcSet: string } | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    setWebgl(hasWebGL());
    setMoving(live && !prefersReducedMotion());
    const el = host.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      setNear(entry.isIntersecting);
      if (!entry.isIntersecting) setReady(false);
    }, { rootMargin: "50% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [live]);

  return (
    <div ref={host} className="model-item" role="img" aria-label={content.alt || "3D model"}>
      {poster && !ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="model-poster"
          src={poster.src}
          srcSet={poster.srcSet}
          sizes="50vw"
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ) : null}
      {near && webgl && !failed ? (
        <Boundary onError={() => setFailed(true)}>
          <ModelScene url={modelUrl(mediaBase, content.mediaId)} content={content} live={moving} host={host} onReady={() => setReady(true)} />
        </Boundary>
      ) : null}
    </div>
  );
}
