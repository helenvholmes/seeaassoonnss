"use client";

import { useEffect, useRef, useState } from "react";
import { api, BASE_PATH } from "@/lib/client";
import STICKER_PACKS from "@/lib/sticker-packs.json";
import type { Place } from "@/lib/geo";
import { imageUrl } from "../ItemContent";
import { formatDuration } from "../items/VoiceNoteView";
import { startRecording } from "./media-browser";
import { uploadSticker, type StickerEntry } from "./upload";
import { SHAPES, type ShapeKind } from "@/lib/schema";
import { ShapeView } from "../items/ShapeView";

interface Props {
  onFiles: (files: File[]) => void;
  onQuote: () => void;
  onTitle: () => void;
  onSubtitle: () => void;
  onPlaylist: (url: string) => void;
  /** Adds a library sticker to the page; `alt` is the description for screen readers (packs have one). */
  onSticker: (sticker: StickerEntry, alt?: string) => void;
  onMap: (place: Place) => void;
  onShape: (shape: ShapeKind) => void;
  onRecording: (blob: Blob) => void;
  onRoute: (file: File) => void;
  onModel: (file: File, textureSize: 1024 | 2048) => void;
  playlistUrl: string;
  setPlaylistUrl: (url: string) => void;
  setNotice: (message: string | null) => void;
  mediaBase: string;
}

type Panel = null | "stickers" | "shapes" | "map" | "voice" | "model";

export function Tools(props: Props) {
  const [panel, setPanel] = useState<Panel>(null);
  const files = useRef<HTMLInputElement>(null);
  const routeInput = useRef<HTMLInputElement>(null);
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
        <input type="url" placeholder="Spotify link" value={props.playlistUrl} onChange={(e) => props.setPlaylistUrl(e.target.value)} />
        <button disabled={!props.playlistUrl}>Playlist or song</button>
      </form>
      <button className={panel === "stickers" ? "primary" : ""} onClick={() => toggle("stickers")} aria-expanded={panel === "stickers"}>
        Stickers…
      </button>
      {panel === "stickers" ? <StickerPanel {...props} /> : null}
      <button className={panel === "shapes" ? "primary" : ""} onClick={() => toggle("shapes")} aria-expanded={panel === "shapes"}>
        Shapes…
      </button>
      {panel === "shapes" ? (
        <div className="tool-panel">
          <div className="shape-grid">
            {SHAPES.map((shape) => (
              <button key={shape} className="shape-add" title={`Add a ${shape === "rounded" ? "rounded square" : shape}`} aria-label={`Add a ${shape === "rounded" ? "rounded square" : shape}`} onClick={() => props.onShape(shape)}>
                <ShapeView item={{ id: shape, type: "shape", desktop: { x: 0, y: 0, w: 1, h: 1, rotation: 0, z: 0, locked: false }, mobile: null, content: { shape, fill: "#1d1d1b", stroke: "#1d1d1b", strokeWidth: 0 } }} layout="desktop" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button className={panel === "voice" ? "primary" : ""} onClick={() => toggle("voice")} aria-expanded={panel === "voice"}>
        Voice note…
      </button>
      {panel === "voice" ? <VoicePanel {...props} /> : null}
      <button className={panel === "map" ? "primary" : ""} onClick={() => toggle("map")} aria-expanded={panel === "map"}>
        Map…
      </button>
      {panel === "map" ? <MapPanel {...props} /> : null}
      <button onClick={() => routeInput.current?.click()} title="Import a GeoJSON file: points are the stops, lines the path">
        Route map…
      </button>
      <input
        ref={routeInput}
        type="file"
        hidden
        accept=".geojson,.json,application/geo+json,application/json"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) props.onRoute(file);
        }}
      />
      <button className={panel === "model" ? "primary" : ""} onClick={() => toggle("model")} aria-expanded={panel === "model"}>
        3D model…
      </button>
      {panel === "model" ? <ModelPanel onModel={props.onModel} /> : null}
      <p className="muted small">You can also paste images, text or a Spotify link, or drop photos, videos and audio onto the canvas.</p>
    </>
  );
}

/** Upload a .glb for a 3D item. Shared with the background settings. */
export function ModelPanel({ onModel, label = "Upload .glb…" }: { onModel: Props["onModel"]; label?: string }) {
  const [textureSize, setTextureSize] = useState<1024 | 2048>(2048);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="tool-panel">
      <label className="field">
        <span>Largest texture</span>
        <select value={textureSize} onChange={(e) => setTextureSize(Number(e.target.value) as 1024 | 2048)}>
          <option value={2048}>2048 px (sharp; for large or close-up models)</option>
          <option value={1024}>1024 px (about ⅓ the size; for small items)</option>
        </select>
      </label>
      <button onClick={() => input.current?.click()}>{label}</button>
      <input
        ref={input}
        type="file"
        hidden
        accept=".glb,model/gltf-binary"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onModel(file, textureSize);
        }}
      />
      <span className="small muted">glTF binary (.glb), up to 50 MB. Textures become WebP and geometry is packed with meshopt; the original is kept privately.</span>
    </div>
  );
}

type Pack = (typeof STICKER_PACKS)[number];

/** The library name a pack sticker gets, so adding it twice reuses the library copy. */
const packStickerName = (pack: Pack, item: Pack["items"][number]) => `${pack.name}: ${item.name}`;

function StickerPanel(props: Props) {
  const [source, setSource] = useState<string>("library");
  const [stickers, setStickers] = useState<StickerEntry[] | null>(null);
  const { setNotice } = props;
  useEffect(() => {
    api<StickerEntry[]>("/stickers").then(setStickers, (e) => setNotice((e as Error).message));
  }, [setNotice]);
  const pack = STICKER_PACKS.find((p) => p.id === source) ?? null;
  return (
    <div className="tool-panel">
      <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Stickers from">
        <option value="library">Your library</option>
        {STICKER_PACKS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.items.length})
          </option>
        ))}
      </select>
      {pack ? <PackStickers {...props} pack={pack} stickers={stickers} setStickers={setStickers} /> : <LibraryStickers {...props} stickers={stickers} setStickers={setStickers} />}
    </div>
  );
}

type StickerState = { stickers: StickerEntry[] | null; setStickers: React.Dispatch<React.SetStateAction<StickerEntry[] | null>> };

/** One pack's stickers. A click copies the sticker into the owner's storage (once) and adds it to the page. */
function PackStickers({ pack, stickers, setStickers, onSticker, setNotice }: Props & StickerState & { pack: Pack }) {
  const [adding, setAdding] = useState<string | null>(null);
  const add = async (item: Pack["items"][number]) => {
    const name = packStickerName(pack, item);
    const existing = stickers?.find((s) => s.name === name);
    if (existing) return onSticker(existing, item.alt);
    setAdding(item.id);
    try {
      const res = await fetch(`${BASE_PATH}/sticker-packs/${pack.id}/${item.file}`);
      if (!res.ok) throw new Error(`Could not load "${item.name}" (HTTP ${res.status}).`);
      const type = item.file.endsWith(".svg") ? "image/svg+xml" : "image/webp";
      const file = new File([await res.blob()], `${name}.${item.file.split(".").pop()}`, { type });
      const s = await uploadSticker(file);
      setStickers((cur) => [s, ...(cur ?? [])]);
      onSticker(s, item.alt);
    } catch (err) {
      setNotice((err as Error).message);
    } finally {
      setAdding(null);
    }
  };
  return (
    <>
      <span className="small muted">Click to add; it is copied into your library.</span>
      <div className="sticker-grid">
        {pack.items.map((item) => (
          <div key={item.id} className="sticker-tile">
            <button className="sticker-add" title={`Add ${item.name}`} disabled={adding !== null} onClick={() => void add(item)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${BASE_PATH}/sticker-packs/${pack.id}/thumbs/${item.id}.webp`} alt={item.name} loading="lazy" />
              {adding === item.id ? <span className="sticker-adding">adding…</span> : null}
            </button>
          </div>
        ))}
      </div>
      <span className="small muted">
        {pack.credit} {pack.license}.
      </span>
    </>
  );
}

function LibraryStickers({ onSticker, setNotice, mediaBase, stickers, setStickers }: Props & StickerState) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
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
    </>
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
