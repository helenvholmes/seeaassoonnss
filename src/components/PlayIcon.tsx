import { Pause, Play } from "lucide-react";

/**
 * Filled Lucide play/pause glyphs for round buttons. A triangle's visual weight sits
 * left of its box, so the play glyph is nudged right (see .play-icon in globals.css).
 */
export function PlayIcon({ playing = false }: { playing?: boolean }) {
  return playing ? <Pause className="play-icon play-icon-pause" fill="currentColor" strokeWidth={0} aria-hidden /> : <Play className="play-icon" fill="currentColor" strokeWidth={0} aria-hidden />;
}
