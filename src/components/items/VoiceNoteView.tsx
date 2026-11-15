"use client";

import { useEffect, useRef, useState } from "react";
import type { VoiceNoteItem } from "@/lib/schema";
import { PlayIcon } from "@/components/PlayIcon";

export function audioUrl(mediaBase: string, mediaId: string) {
  return `${mediaBase}/media/${mediaId}/audio.mp3`;
}

export function formatDuration(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A small player. Nothing loads or plays until the visitor presses play. */
export function VoiceNoteView({ item, mediaBase, interactive }: { item: VoiceNoteItem; mediaBase: string; interactive: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const { duration, caption, waveform, mediaId } = item.content;
  const bars = waveform.length ? waveform : Array.from({ length: 32 }, () => 0.3);

  useEffect(() => {
    const audio = ref.current;
    if (!audio) return;
    const tick = () => setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    const end = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener("timeupdate", tick);
    audio.addEventListener("ended", end);
    return () => {
      audio.removeEventListener("timeupdate", tick);
      audio.removeEventListener("ended", end);
    };
  }, []);

  const toggle = () => {
    const audio = ref.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="voice-note">
      {interactive ? (
        <button className="voice-play" onClick={toggle} aria-label={playing ? "Pause voice note" : "Play voice note"}>
          <PlayIcon playing={playing} />
        </button>
      ) : (
        <span className="voice-play"><PlayIcon /></span>
      )}
      <span className="voice-body">
        <svg className="voice-wave" viewBox={`0 0 ${bars.length * 3} 20`} preserveAspectRatio="none" aria-hidden>
          {bars.map((v, i) => (
            <rect key={i} x={i * 3} y={10 - Math.max(0.6, v * 9)} width={2} height={Math.max(1.2, v * 18)} className={i / bars.length < progress ? "played" : ""} />
          ))}
        </svg>
        <span className="voice-meta">
          {caption ? <span className="voice-caption">{caption}</span> : null}
          <span className="voice-time">{formatDuration(duration)}</span>
        </span>
      </span>
      {interactive ? <audio ref={ref} src={audioUrl(mediaBase, mediaId)} preload="none" /> : null}
    </div>
  );
}
