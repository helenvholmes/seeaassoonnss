"use client";

import { useState } from "react";
import type { PlaylistItem } from "@/lib/schema";

/**
 * A custom card built from oEmbed data. Spotify's own iframe cannot be styled, so it
 * loads only after a click; nothing plays before that.
 */
export function PlaylistCard({ item, interactive }: { item: PlaylistItem; interactive: boolean }) {
  const [open, setOpen] = useState(false);
  const { spotifyId, title, coverUrl, caption, url } = item.content;

  if (open && interactive) {
    return (
      <iframe
        className="playlist-embed"
        title={`Spotify playlist: ${title}`}
        src={`https://open.spotify.com/embed/playlist/${spotifyId}`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  }

  const body = (
    <>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="playlist-cover" src={coverUrl} alt="" loading="lazy" draggable={false} />
      ) : (
        <div className="playlist-cover playlist-cover-empty" />
      )}
      <span className="playlist-text">
        <span className="playlist-label">playlist ▸</span>
        <span className="playlist-title">{title || "Spotify playlist"}</span>
        {caption ? <span className="playlist-caption">{caption}</span> : null}
      </span>
    </>
  );

  if (!interactive) return <div className="playlist-card">{body}</div>;
  return (
    <a
      className="playlist-card"
      href={url}
      onClick={(e) => {
        e.preventDefault();
        setOpen(true);
      }}
      aria-label={`Play "${title}" on Spotify`}
    >
      {body}
    </a>
  );
}
