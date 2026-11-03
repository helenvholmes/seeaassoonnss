"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import type { Place } from "@/lib/geo";
import { imageUrl } from "../ItemContent";
import { formatDuration } from "../items/VoiceNoteView";
import { startRecording } from "./media-browser";
import { uploadSticker, type StickerEntry } from "./upload";

interface Props {
  onFiles: (files: File[]) => void;
  onQuote: () => void;
  onTitle: () => void;
  onSubtitle: () => void;
  onPlaylist: (url: string) => void;
  onSticker: (sticker: StickerEntry) => void;
  onMap: (place: Place) => void;
  onRecording: (blob: Blob) => void;
  playlistUrl: string;
  setPlaylistUrl: (url: string) => void;
  setNotice: (message: string | null) => void;
  mediaBase: string;
}

type Panel = null | "stickers" | "map" | "voice";

export function Tools(props: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const files = useRef<HTMLInputElement>(null);
  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <>
      <p className="tools-heading">add</p>
      <button onClick={() => files.current?.click()}>Photos & video…</button>
      <input
        ref={files}
        type="file"
        multiple
        hidden
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/mp4,video/quicktime,video/webm,.mov,.m4v"
        onChange={(e) => {
          props.onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <button onClick={props.onQuote}>Quote</button>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <button style={{ flex: 1 }} onClick={props.onTitle}>
          Title
        </button>
        <button style={{ flex: 1 }} onClick={props.onSubtitle}>
          Subtitle
        </button>
      </div>
      <form
        className="stack"
        style={{ gap: 4 }}
        onSubmit={(e) => {
          e.preventDefault();
          props.onPlaylist(props.playlistUrl);
        }}
      >
        <input type="url" placeholder="Spotify playlist link" value={props.playlistUrl} onChange={(e) => props.setPlaylistUrl(e.target.value)} />
        <button disabled={!props.playlistUrl}>Playlist</button>
      </form>
      <button className={panel === "stickers" ? "primary" : ""} onClick={() => toggle("stickers")} aria-expanded={panel === "stickers"}>
        Stickers…
      </button>
      {panel === "stickers" ? <StickerPanel {...props} /> : null}
      <button className={panel === "voice" ? "primary" : ""} onClick={() => toggle("voice")} aria-expanded={panel === "voice"}>
        Voice note…
      </button>
      {panel === "voice" ? <VoicePanel {...props} /> : null}
      <button className={panel === "map" ? "primary" : ""} onClick={() => toggle("map")} aria-expanded={panel === "map"}>
        Map…
      </button>
      {panel === "map" ? <MapPanel {...props} /> : null}
      <p className="muted small">You can also paste images, text or a Spotify link, or drop photos, videos and audio onto the canvas.</p>
    </>
  );
}

function StickerPanel({ onSticker, setNotice, mediaBase }: Props) {
  const [stickers, setStickers] = useState<StickerEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    api<StickerEntry[]>("/stickers").then(setStickers, (e) => setNotice((e as Error).message));
  }, [setNotice]);

  return (
    <div className="tool-panel">
      <button disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : "Upload sticker…"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/png,image/webp,image/svg+xml,.svg"
        onChange={async (e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = "";
          setBusy(true);
          for (const file of chosen) {
            try {
              const s = await uploadSticker(file);
              setStickers((cur) => [s, ...(cur ?? [])]);
              onSticker(s);
            } catch (err) {
              setNotice((err as Error).message);
            }
          }
          setBusy(false);
        }}
      />
      <span className="small muted">Transparent PNG, WebP or SVG. Uploads join your library for any season.</span>
      {stickers === null ? <span className="small muted">Loading…</span> : null}
      {stickers?.length === 0 ? <span className="small muted">The library is empty.</span> : null}
      <div className="sticker-grid">
        {stickers?.map((s) => (
          <div key={s.id} className="sticker-tile">
            <button className="sticker-add" title={`Add ${s.name || "sticker"}`} onClick={() => onSticker(s)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(mediaBase, s.mediaId, s.widths[0])} alt={s.name} />
            </button>
            <button
              className="sticker-remove"
              title="Remove from library"
              aria-label={`Remove ${s.name || "sticker"} from the library`}
              onClick={async () => {
                if (!confirm("Remove this sticker from the library? Seasons that use it keep it.")) return;
                try {
                  await api(`/stickers/${s.id}`, { method: "DELETE" });
                  setStickers((cur) => cur?.filter((x) => x.id !== s.id) ?? null);
                } catch (err) {
                  setNotice((err as Error).message);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function VoicePanel({ onRecording, onFiles, setNotice }: Props) {
  const [recorder, setRecorder] = useState<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const [seconds, setSeconds] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!recorder) return;
    const started = Date.now();
    const t = setInterval(() => setSeconds((Date.now() - started) / 1000), 250);
    return () => clearInterval(t);
  }, [recorder]);
  useEffect(() => () => recorder?.cancel(), [recorder]);

  return (
    <div className="tool-panel">
      {recorder ? (
        <div className="row">
          <span className="recording-dot" aria-hidden />
          <span className="small">{formatDuration(seconds)}</span>
          <button
            className="primary"
            onClick={async () => {
              const blob = await recorder.stop();
              setRecorder(null);
              onRecording(blob);
            }}
          >
            Stop
          </button>
          <button
            className="quiet"
            onClick={() => {
              recorder.cancel();
              setRecorder(null);
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={async () => {
            try {
              setSeconds(0);
              setRecorder(await startRecording());
            } catch (e) {
              setNotice(`Recording did not start: ${(e as Error).message}`);
            }
          }}
        >
          ● Record
        </button>
      )}
      <button onClick={() => input.current?.click()}>Upload audio…</button>
      <input
        ref={input}
        type="file"
        hidden
        accept="audio/*,.m4a,.mp3,.wav"
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <span className="small muted">Saved as a small MP3 without metadata. It plays only when a visitor presses play.</span>
    </div>
  );
}

function MapPanel({ onMap, setNotice }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="tool-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          setResults(await api<Place[]>("/geocode", { body: { q } }));
        } catch (err) {
          setNotice((err as Error).message);
        }
        setBusy(false);
      }}
    >
      <input type="text" placeholder="A place, or 40.71, -74.01" value={q} onChange={(e) => setQ(e.target.value)} />
      <button disabled={!q.trim() || busy}>{busy ? "Searching…" : "Search"}</button>
      {results?.length === 0 ? <span className="small muted">No places found.</span> : null}
      {results?.map((p, i) => (
        <button
          type="button"
          key={i}
          className="quiet place-result"
          onClick={() => {
            onMap({ ...p, label: p.label || "" });
            setResults(null);
            setQ("");
          }}
        >
          {p.label || "Coordinates"} <span className="muted">
            {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
          </span>
        </button>
      ))}
      <span className="small muted">Search uses OpenStreetMap. Maps are drawn as simple outlines.</span>
    </form>
  );
}
