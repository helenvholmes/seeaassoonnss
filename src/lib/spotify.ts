// Spotify playlist and song lookup through oEmbed (no sign-in, no API key).
// Tested Nov 3, 2026: oEmbed returns title and thumbnail_url for playlist URLs.
// Tested Nov 9, 2026: the same for track URLs (title is the song name, no artist).

export class SpotifyError extends Error {}

export const SPOTIFY_KINDS = ["playlist", "track"] as const;
export type SpotifyKind = (typeof SPOTIFY_KINDS)[number];

export interface SpotifyLink {
  kind: SpotifyKind;
  id: string;
}

/**
 * Reads a playlist or song (track) from an open.spotify.com URL or a
 * spotify:playlist: / spotify:track: URI. Anything else gives null.
 */
export function parseSpotifyLink(input: string): SpotifyLink | null {
  const text = input.trim();
  const uri = /^spotify:(playlist|track):([A-Za-z0-9]+)$/.exec(text);
  if (uri) return { kind: uri[1] as SpotifyKind, id: uri[2] };
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
  const match = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|track)\/([A-Za-z0-9]+)\/?$/i.exec(url.pathname);
  return match ? { kind: match[1].toLowerCase() as SpotifyKind, id: match[2] } : null;
}

export interface SpotifyInfo {
  url: string;
  kind: SpotifyKind;
  spotifyId: string;
  title: string;
  coverUrl: string | null;
}

export async function fetchSpotify(input: string): Promise<SpotifyInfo> {
  const link = parseSpotifyLink(input);
  if (!link) throw new SpotifyError("That is not a Spotify playlist or song link.");
  const what = link.kind === "track" ? "song" : "playlist";
  const url = `https://open.spotify.com/${link.kind}/${link.id}`;
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (!res || !res.ok) throw new SpotifyError(`Spotify did not return this ${what}${res ? ` (HTTP ${res.status})` : ""}. Check that ${link.kind === "track" ? "the link is right" : "it is public"}.`);
  const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
  const cover = typeof data.thumbnail_url === "string" && data.thumbnail_url.startsWith("https://") ? data.thumbnail_url : null;
  return { url, kind: link.kind, spotifyId: link.id, title: typeof data.title === "string" ? data.title : "", coverUrl: cover };
}
