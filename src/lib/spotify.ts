// Spotify playlist lookup through oEmbed (no sign-in, no API key).
// Tested Nov 3, 2026: oEmbed returns title and thumbnail_url for playlist URLs.

export class SpotifyError extends Error {}

/** Returns the playlist id from an open.spotify.com URL or a spotify:playlist: URI. */
export function parsePlaylistId(input: string): string | null {
  const text = input.trim();
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(text);
  if (uri) return uri[1];
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
  const match = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?playlist\/([A-Za-z0-9]+)\/?$/i.exec(url.pathname);
  return match ? match[1] : null;
}

export interface PlaylistInfo {
  url: string;
  spotifyId: string;
  title: string;
  coverUrl: string | null;
}

export async function fetchPlaylist(input: string): Promise<PlaylistInfo> {
  const id = parsePlaylistId(input);
  if (!id) throw new SpotifyError("That is not a Spotify playlist link.");
  const url = `https://open.spotify.com/playlist/${id}`;
  const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(8000),
    headers: { accept: "application/json" },
  }).catch(() => null);
  if (!res || !res.ok) throw new SpotifyError(`Spotify did not return this playlist${res ? ` (HTTP ${res.status})` : ""}. Check that it is public.`);
  const data = (await res.json()) as { title?: unknown; thumbnail_url?: unknown };
  const cover = typeof data.thumbnail_url === "string" && data.thumbnail_url.startsWith("https://") ? data.thumbnail_url : null;
  return { url, spotifyId: id, title: typeof data.title === "string" ? data.title : "", coverUrl: cover };
}
