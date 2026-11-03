"use client";

import { useEffect, useRef, useState } from "react";
import type { VideoItem } from "@/lib/schema";

export function videoUrl(mediaBase: string, mediaId: string) {
  return `${mediaBase}/media/${mediaId}/video.mp4`;
}

/**
 * Videos loop silently while on screen. Sound plays only after a click. With reduced
 * motion turned on, the poster shows until the visitor presses play.
 */
export function VideoView({ item, mediaBase, posterUrl, interactive }: { item: VideoItem; mediaBase: string; posterUrl: string; interactive: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(true);
  const [reduced, setReduced] = useState(false);
  const c = item.content;

  useEffect(() => {
    const video = ref.current;
    if (!video || !interactive) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReduced(reduce);
    if (reduce) return;
    // Play only while visible, so a page of videos does not decode them all at once.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.1 },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [interactive]);

  if (!interactive) {
    // The editor shows the poster only.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="item-photo" src={posterUrl} alt={c.alt} draggable={false} style={{ objectFit: c.fit }} />;
  }

  const toggleSound = () => {
    const video = ref.current;
    if (!video || !c.hasAudio) return;
    video.muted = !video.muted;
    setMuted(video.muted);
    if (!video.muted) video.play().catch(() => {});
  };

  return (
    <div className="video-wrap">
      <video
        ref={ref}
        className="item-photo"
        src={videoUrl(mediaBase, c.mediaId)}
        poster={posterUrl}
        muted
        loop
        playsInline
        preload="none"
        aria-label={c.alt || undefined}
        style={{ objectFit: c.fit }}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onClick={c.hasAudio ? toggleSound : undefined}
      />
      {reduced && paused ? (
        <button className="media-button media-button-center" onClick={() => ref.current?.play()} aria-label="Play video">
          ▶
        </button>
      ) : null}
      {c.hasAudio ? (
        <button className="media-button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Turn sound off"} aria-pressed={!muted}>
          {muted ? "sound off" : "sound on"}
        </button>
      ) : null}
    </div>
  );
}
