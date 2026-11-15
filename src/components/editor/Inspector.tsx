"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client";
import { DEFAULT_SCATTER, MAP_ZOOM_MAX, MAP_ZOOM_MIN, MAX_CANVAS_HEIGHT, MAX_CROP_ZOOM, MAX_SKETCH_CODE, QUOTE_EFFECTS, QUOTE_FONTS, slugProblem, type Crop, type ModelContent, type PhotoItem, type QuoteEffect, type RouteItem, type Item, type Layout, type Placement, type Scatter, type SeasonDoc } from "@/lib/schema";
import { ModelPanel } from "./Tools";
import { formatBytes } from "./upload";
import { imageUrl, quoteSize } from "../ItemContent";
import { formatDuration } from "../items/VoiceNoteView";
import type { LayerMove } from "./ops";
import { normalizeRotation, placementOf } from "./ops";
import { parseRouteGeoJSON } from "@/lib/route";
import { isCropped, NO_CROP, zoomCrop } from "@/lib/crop";

interface Props {
  id: string;
  doc: SeasonDoc;
  item: Item | null;
  slug: string;
  onSlugChange: (slug: string) => void;
  /** Whether the slug still follows the title (a draft whose slug was never set by hand). */
  slugAuto: boolean;
  change: (next: SeasonDoc | ((d: SeasonDoc) => SeasonDoc), key?: string | null) => void;
  updateItem: (fn: (item: Item) => Item, key?: string) => void;
  layer: (move: LayerMove) => void;
  duplicate: () => void;
  remove: () => void;
  mediaBase: string;
  layout: Layout;
  /** Whether the selected photo is in crop mode. */
  cropping: boolean;
  setCropping: (on: boolean) => void;
  sortOrder: number | null;
  onSortOrderChange: (n: number | null) => void;
  select: (id: string | null) => void;
  setMobileVisible: (id: string, visible: boolean) => void;
  resetMobile: (kind: "scaled" | "column") => void;
  addBackgroundModel: (file: File, textureSize: 1024 | 2048) => void;
  /** Changes a model on an item (its id) or on the background ("background"). A string `undoable` merges steps with the same key. */
  setModelContent: (target: string, patch: Partial<ModelContent>, undoable: boolean | string) => void;
  redrawPoster: (target: string, content: ModelContent) => void;
  scatter: (s: Scatter) => void;
  sketchError: string | null;
  clearSketchError: () => void;
}

function itemLabel(item: Item): string {
  const cut = (t: string) => t.replace(/[*_\[\]()#>`]/g, "").slice(0, 30);
  switch (item.type) {
    case "photo":
      return item.content.alt ? `photo: ${cut(item.content.alt)}` : "photo";
    case "video":
      return item.content.alt ? `video: ${cut(item.content.alt)}` : "video";
    case "sticker":
      return item.content.alt ? `sticker: ${cut(item.content.alt)}` : "sticker";
    case "playlist":
      return `${item.content.kind === "track" ? "song" : "playlist"}: ${cut(item.content.title)}`;
    case "map":
      return `map: ${cut(item.content.label || `${item.content.lat}, ${item.content.lon}`)}`;
    case "voice_note":
      return item.content.caption ? `voice note: ${cut(item.content.caption)}` : "voice note";
    case "quote":
      return item.content.binding ?? `quote: ${cut(item.content.markdown)}`;
    case "route":
      return `route map: ${item.content.stops.length} stops`;
    case "model_3d":
      return item.content.alt ? `3D model: ${cut(item.content.alt)}` : "3D model";
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A number input that only commits finite values. Shows `digits` decimals. */
function NumberInput({ value, onChange, step = 1, min, digits }: { value: number; onChange: (n: number) => void; step?: number; min?: number; digits?: number }) {
  const places = digits ?? (step < 0.1 ? 4 : 1);
  const show = (n: number) => String(Math.round(n * 10 ** places) / 10 ** places);
  const [text, setText] = useState(show(value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setText(show(value)), [value]);
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
      }}
    />
  );
}

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** Month and year as two plain controls (the native month picker is missing in some browsers). */
function MonthInput({ value, onChange }: { value: string | null; onChange: (month: string | null) => void }) {
  const [year, month] = value ? value.split("-") : ["", ""];
  const [yearText, setYearText] = useState(year);
  useEffect(() => setYearText(year), [year]);
  const emit = (y: string, m: string) => {
    if (!m) return onChange(null);
    const yy = /^\d{4}$/.test(y) ? y : String(new Date().getFullYear());
    onChange(`${yy}-${m}`);
  };
  return (
    <div className="row" style={{ flexWrap: "nowrap" }}>
      <select value={month} onChange={(e) => emit(yearText, e.target.value)} aria-label="Month">
        <option value="">no month</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={String(i + 1).padStart(2, "0")}>
            {name}
          </option>
        ))}
      </select>
      <input
        type="number"
        aria-label="Year"
        placeholder="year"
        min={1900}
        max={2999}
        value={yearText}
        disabled={!month}
        onChange={(e) => {
          setYearText(e.target.value);
          if (/^\d{4}$/.test(e.target.value)) emit(e.target.value, month);
        }}
        style={{ width: 90 }}
      />
    </div>
  );
}

function SortOrderField({ id, sortOrder, onSortOrderChange }: Pick<Props, "id" | "sortOrder" | "onSortOrderChange">) {
  const [text, setText] = useState(sortOrder === null ? "" : String(sortOrder));
  const [message, setMessage] = useState<string | null>(null);
  const parsed = text.trim() === "" ? null : Number(text);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999);
  return (
    <Field label="Pin on the index page at position">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="number" min={1} step={1} placeholder="by date" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          disabled={!valid || parsed === sortOrder}
          onClick={async () => {
            try {
              await api(`/seasons/${id}`, { method: "PATCH", body: { sortOrder: parsed } });
              onSortOrderChange(parsed);
              setMessage(parsed === null ? "Listed by date." : `Pinned at position ${parsed}.`);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Save
        </button>
      </div>
      <span className="small muted">{message ?? "Pinned seasons come first; the rest are newest first."}</span>
    </Field>
  );
}

function MobileSettings({ doc, resetMobile, setMobileVisible, select }: Props) {
  const hidden = doc.items.filter((i) => !i.mobile);
  return (
    <div className="stack">
      <p className="tools-heading">mobile layout</p>
      <p className="small muted">Content is shared with desktop. Positions, sizes, layers and text sizes here are for screens narrower than 960 px.</p>
      <div className="row">
        <button onClick={() => resetMobile("scaled")}>Reset: scaled desktop</button>
        <button onClick={() => resetMobile("column")}>Reset: single column</button>
      </div>
      {hidden.length ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Hidden on mobile</span>
          {hidden.map((i) => (
            <div key={i.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="small">{itemLabel(i)}</span>
              <button
                onClick={() => {
                  setMobileVisible(i.id, true);
                  select(i.id);
                }}
              >
                Show
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <hr />
    </div>
  );
}

/** Picks the photo shown for this season on the index page and in link previews. */
function CoverField({ doc, change, mediaBase }: Props) {
  const photos = doc.items.filter((i): i is PhotoItem => i.type === "photo");
  const chosen = photos.find((p) => p.id === doc.coverItemId) ?? null;
  const shown = chosen ?? photos[0] ?? null;
  return (
    <Field label="Cover image">
      {photos.length ? (
        <>
          <div className="cover-picker" role="radiogroup" aria-label="Cover image">
            {photos.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={p.id === shown?.id}
                aria-label={p.content.alt || "photo"}
                className={p.id === shown?.id ? "cover-choice is-chosen" : "cover-choice"}
                onClick={() => change((d) => ({ ...d, coverItemId: p.id }), "season:cover")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(mediaBase, p.content.mediaId, p.content.widths[0])} alt="" loading="lazy" draggable={false} />
              </button>
            ))}
          </div>
          <span className="small muted">
            {chosen ? "Shown on the seasons index and in link previews. " : "None chosen, so the first photo is used. "}
            {chosen ? (
              <button className="quiet" style={{ padding: 0, textDecoration: "underline" }} onClick={() => change((d) => ({ ...d, coverItemId: null }), "season:cover")}>
                Use the first photo instead
              </button>
            ) : null}
          </span>
        </>
      ) : (
        <span className="small muted">Add a photo to choose a cover. It is shown on the seasons index and in link previews.</span>
      )}
    </Field>
  );
}

function SeasonSettings(props: Props) {
  const { id, doc, slug, onSlugChange, change, layout, slugAuto } = props;
  const router = useRouter();
  const [slugDraft, setSlugDraft] = useState(slug);
  const [slugMessage, setSlugMessage] = useState<string | null>(null);
  const set = <K extends keyof SeasonDoc>(key: K, value: SeasonDoc[K]) => change((d) => ({ ...d, [key]: value }), `season:${key}`);
  const problem = slugDraft === slug ? null : slugProblem(slugDraft);
  // Keep the field in step when the slug follows the title.
  useEffect(() => setSlugDraft(slug), [slug]);

  return (
    <div className="stack">
      {layout === "mobile" ? <MobileSettings {...props} /> : null}
      <p className="tools-heading">season</p>
      <Field label="Title">
        <input type="text" value={doc.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Subtitle (Markdown)">
        <textarea rows={3} value={doc.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field label="Period">
        <input type="text" placeholder="fall 2026" value={doc.period} onChange={(e) => set("period", e.target.value)} />
      </Field>
      <Field label="Slug">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" value={slugDraft} onChange={(e) => setSlugDraft(e.target.value.toLowerCase())} />
          <button
            disabled={slugDraft === slug || !!problem}
            onClick={async () => {
              try {
                await api(`/seasons/${id}`, { method: "PATCH", body: { slug: slugDraft } });
                onSlugChange(slugDraft);
                setSlugMessage("Slug changed. The old address no longer works.");
              } catch (e) {
                setSlugMessage((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
        {problem ? (
          <span className="small error">{problem}</span>
        ) : slugMessage ? (
          <span className="small muted">{slugMessage}</span>
        ) : slugAuto ? (
          <span className="small muted">Follows the title until you publish or set a slug here.</span>
        ) : null}
      </Field>
      <SortOrderField id={id} sortOrder={props.sortOrder} onSortOrderChange={props.onSortOrderChange} />
      <Field label="Month">
        <MonthInput value={doc.month ?? null} onChange={(m) => change((d) => ({ ...d, month: m }), "season:month")} />
        <span className="small muted">Orders the index page (newest first). Shown when the period is empty.</span>
      </Field>
      <CoverField {...props} />
      <Field label={`Minimum page length (${layout}, ${layout === "desktop" ? 1440 : 390} wide)`}>
        <NumberInput
          value={layout === "desktop" ? doc.desktopHeight : doc.mobileHeight}
          min={200}
          step={layout === "desktop" ? 50 : 20}
          onChange={(n) => set(layout === "desktop" ? "desktopHeight" : "mobileHeight", Math.min(MAX_CANVAS_HEIGHT, n))}
        />
        <span className="small muted">The page grows to fit everything on it, with no limit. This only adds empty space at the end.</span>
      </Field>
      <Field label="Background">
        <div className="row">
          <input type="color" value={doc.background.value} onChange={(e) => set("background", { type: "color", value: e.target.value })} />
          <code className="small">{doc.background.value}</code>
        </div>
      </Field>
      <BackgroundLayerSettings {...props} />
      <hr />
      <ScatterSettings {...props} />
      <hr />
      <button
        className="quiet error"
        style={{ alignSelf: "flex-start" }}
        onClick={async () => {
          if (!confirm(`Delete "${doc.title || "untitled"}"? This cannot be undone.`)) return;
          await api(`/seasons/${id}`, { method: "DELETE" });
          router.push("/edit");
        }}
      >
        Delete season
      </button>
    </div>
  );
}

function BackgroundLayerSettings(props: Props) {
  const { doc, change } = props;
  const layer = doc.backgroundLayer;
  // "A 3D model" chosen, waiting for its upload.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (layer?.kind === "model") setPending(false);
  }, [layer?.kind]);
  const shown = pending ? "model" : (layer?.kind ?? "none");
  return (
    <div className="stack">
      <Field label="Behind all items">
        <select
          value={shown}
          onChange={(e) => {
            const next = e.target.value;
            props.clearSketchError();
            setPending(next === "model" && layer?.kind !== "model");
            if (next === "none") change((d) => ({ ...d, backgroundLayer: null }));
            if (next === "sketch" && layer?.kind !== "sketch") change((d) => ({ ...d, backgroundLayer: { kind: "sketch", sketchId: null, name: "", code: STARTER_SKETCH } }));
          }}
        >
          <option value="none">Nothing (color only)</option>
          <option value="model">A 3D model</option>
          <option value="sketch">A p5.js sketch</option>
        </select>
      </Field>
      {shown === "model" && layer?.kind === "model" ? (
        <>
          <ModelFields target="background" content={layer.model} {...props} />
          <ModelPanel onModel={props.addBackgroundModel} label="Replace with another .glb…" />
        </>
      ) : shown === "model" ? (
        <ModelPanel onModel={props.addBackgroundModel} label="Upload a .glb for the background…" />
      ) : null}
      {shown === "sketch" ? <SketchSettings {...props} /> : null}
    </div>
  );
}

const STARTER_SKETCH = `// p5.js, global mode: paste from editor.p5js.org or write here.
// mouseX and mouseY follow the cursor (on phones they follow the scroll).
// seasons.scroll is 0 at the top of the page and 1 at the end.
function setup() {
  createCanvas(windowWidth, windowHeight);
  noStroke();
}

function draw() {
  clear();
  fill(159, 191, 138, 60);
  circle(mouseX, mouseY, 240 + 120 * sin(frameCount * 0.02));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
`;

interface LibrarySketch {
  id: string;
  name: string;
  code: string;
}

function SketchSettings({ doc, change, sketchError, clearSketchError }: Props) {
  const layer = doc.backgroundLayer?.kind === "sketch" ? doc.backgroundLayer : null;
  const [library, setLibrary] = useState<LibrarySketch[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    api<LibrarySketch[]>("/sketches").then(setLibrary, (e) => setMessage((e as Error).message));
  }, []);
  if (!layer) return null;
  const set = (patch: Partial<typeof layer>, key: string) => {
    clearSketchError();
    change((d) => (d.backgroundLayer?.kind === "sketch" ? { ...d, backgroundLayer: { ...d.backgroundLayer, ...patch } } : d), `sketch:${key}`);
  };
  const inLibrary = library?.find((s) => s.id === layer.sketchId);
  const changedFromLibrary = !!inLibrary && (inLibrary.code !== layer.code || inLibrary.name !== layer.name);

  return (
    <div className="stack" style={{ gap: 6 }}>
      <Field label="From your sketch library">
        <select
          value={layer.sketchId ?? ""}
          onChange={(e) => {
            const s = library?.find((x) => x.id === e.target.value);
            if (s) set({ sketchId: s.id, name: s.name, code: s.code }, "pick");
            else set({ sketchId: null }, "pick");
          }}
        >
          <option value="">(written here)</option>
          {library?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || "untitled sketch"}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Name">
        <input type="text" value={layer.name} placeholder="untitled sketch" onChange={(e) => set({ name: e.target.value }, "name")} />
      </Field>
      <Field label={`Code (${layer.code.length.toLocaleString("en")} / ${MAX_SKETCH_CODE.toLocaleString("en")} characters)`}>
        <textarea className="sketch-code" spellCheck={false} value={layer.code} onChange={(e) => set({ code: e.target.value.slice(0, MAX_SKETCH_CODE) }, "code")} />
      </Field>
      {sketchError ? <span className="small error">Sketch error: {sketchError}</span> : null}
      <div className="row">
        <button
          onClick={async () => {
            try {
              const saved = layer.sketchId && inLibrary
                ? await api<LibrarySketch>(`/sketches/${layer.sketchId}`, { method: "PUT", body: { name: layer.name, code: layer.code } })
                : await api<LibrarySketch>("/sketches", { body: { name: layer.name, code: layer.code } });
              setLibrary((cur) => [saved, ...(cur ?? []).filter((s) => s.id !== saved.id)]);
              set({ sketchId: saved.id }, "saved");
              setMessage(inLibrary ? "Library copy updated. Other seasons keep their own copy until you pick it again." : "Saved to your sketch library.");
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          {inLibrary ? (changedFromLibrary ? "Update library copy" : "In library") : "Save to library"}
        </button>
        {inLibrary ? (
          <button
            className="quiet"
            onClick={async () => {
              if (!confirm(`Remove "${inLibrary.name || "untitled sketch"}" from the library? Seasons that use it keep their copy.`)) return;
              try {
                await api(`/sketches/${inLibrary.id}`, { method: "DELETE" });
                setLibrary((cur) => cur?.filter((s) => s.id !== inLibrary.id) ?? null);
                set({ sketchId: null }, "removed");
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Remove from library
          </button>
        ) : null}
      </div>
      <span className="small muted">
        {message ??
          "The sketch runs in a sealed frame: it cannot see the page, your sign-in or the editor. It fills the screen behind all items. With reduced motion on, visitors see its first frame only. Changes show on the public page after Publish."}
      </span>
    </div>
  );
}

function ScatterSettings({ doc, scatter, layout }: Props) {
  const s = doc.scatter ?? DEFAULT_SCATTER;
  const [seed, setSeed] = useState(s.seed);
  const [min, setMin] = useState(s.minScale);
  const [max, setMax] = useState(s.maxScale);
  useEffect(() => {
    setSeed(s.seed);
    setMin(s.minScale);
    setMax(s.maxScale);
  }, [s.seed, s.minScale, s.maxScale]);
  const run = (nextSeed: number) => {
    setSeed(nextSeed);
    scatter({ seed: nextSeed, minScale: Math.min(min, max), maxScale: Math.max(min, max) });
  };
  return (
    <div className="stack">
      <p className="tools-heading">random layout</p>
      <p className="small muted">
        Places every unlocked item on the {layout} page at random. Photos, videos, stickers and 3D models also get a random size. Lock the items you want to keep, then try another seed. The same seed always gives the same layout. Undo goes back.
      </p>
      <div className="grid2">
        <Field label="Seed">
          <NumberInput value={seed} min={0} step={1} digits={0} onChange={(n) => setSeed(Math.min(2 ** 31 - 1, Math.round(n)))} />
        </Field>
        <span />
        <Field label="Smallest size ×">
          <NumberInput value={min} min={0.1} step={0.1} digits={2} onChange={(n) => setMin(Math.min(5, n))} />
        </Field>
        <Field label="Largest size ×">
          <NumberInput value={max} min={0.1} step={0.1} digits={2} onChange={(n) => setMax(Math.min(5, n))} />
        </Field>
      </div>
      <div className="row">
        <button onClick={() => run(seed)}>Scatter with this seed</button>
        <button onClick={() => run(Math.floor(Math.random() * 1_000_000))}>New seed</button>
      </div>
      <span className="small muted">
        Size 1× is the width a new photo gets ({layout === "desktop" ? 360 : 180} units). Items spread over at least the minimum page length ({layout === "desktop" ? doc.desktopHeight : doc.mobileHeight}); with many items the page grows so they don&apos;t pile up. The Shuffle button at the top does the same with a new seed.
      </span>
    </div>
  );
}

/** Settings for a 3D model, on an item or on the background. */
function ModelFields({ target, content, setModelContent, redrawPoster }: Props & { target: string; content: ModelContent }) {
  const set = (patch: Partial<ModelContent>, field: string) => setModelContent(target, patch, `model:${target}:${field}`);
  const axis = (i: 0 | 1 | 2, deg: number) => {
    const r = [...content.rotation] as [number, number, number];
    r[i] = normalizeRotation(deg);
    set({ rotation: r }, `rot${i}`);
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <Field label="Description (for screen readers)">
        <input type="text" value={content.alt} placeholder="Describe the model" onChange={(e) => set({ alt: e.target.value }, "alt")} />
      </Field>
      <Field label={`Size in its box: ${content.scale.toFixed(2)}×`}>
        <input type="range" min={0.2} max={3} step={0.01} value={content.scale} onChange={(e) => set({ scale: Number(e.target.value) }, "scale")} />
      </Field>
      <div className="grid2">
        <Field label="Tilt (x) °">
          <NumberInput value={content.rotation[0]} step={5} onChange={(n) => axis(0, n)} />
        </Field>
        <Field label="Turn (y) °">
          <NumberInput value={content.rotation[1]} step={5} onChange={(n) => axis(1, n)} />
        </Field>
        <Field label="Roll (z) °">
          <NumberInput value={content.rotation[2]} step={5} onChange={(n) => axis(2, n)} />
        </Field>
        <Field label={`Spin: ${content.spin}°/s`}>
          <input type="range" min={-90} max={90} step={1} value={content.spin} onChange={(e) => set({ spin: Number(e.target.value) }, "spin")} />
        </Field>
      </div>
      <label className="row small">
        <input type="checkbox" checked={content.follow} onChange={(e) => set({ follow: e.target.checked }, "follow")} />
        Turn toward the cursor (with scroll on phones)
      </label>
      {content.hasAnimation ? (
        <label className="row small">
          <input type="checkbox" checked={content.animate} onChange={(e) => set({ animate: e.target.checked }, "animate")} />
          Play its animation
        </label>
      ) : null}
      <div className="row">
        <button onClick={() => redrawPoster(target, content)} title="The poster shows while the model loads, and instead of it where WebGL is missing">
          {content.posterMediaId ? "Update poster" : "Make poster"}
        </button>
        <span className="small muted size-report">{formatBytes(content.bytes)}</span>
      </div>
      <span className="small muted">Spin, follow and animation run on the public page and in Preview, not in the editor. With reduced motion on, the model stays still.</span>
    </div>
  );
}

/** Changes the item's placement in one layout. */
function patchPlacement(item: Item, layout: Layout, patch: Partial<Placement>): Item {
  if (layout === "desktop") return { ...item, desktop: { ...item.desktop, ...patch } };
  return item.mobile ? { ...item, mobile: { ...item.mobile, ...patch } } : item;
}

function PlacementFields({ item, p, layout, updateItem }: { item: Item; p: Placement; layout: Layout; updateItem: Props["updateItem"] }) {
  const set = (patch: Partial<Placement>) => updateItem((i) => patchPlacement(i, layout, patch), `place:${layout}:${item.id}:${Object.keys(patch)[0]}`);
  return (
    <div className="grid2">
      <Field label="x">
        <NumberInput value={p.x} onChange={(x) => set({ x })} />
      </Field>
      <Field label="y">
        <NumberInput value={p.y} onChange={(y) => set({ y })} />
      </Field>
      <Field label="width">
        <NumberInput value={p.w} min={1} onChange={(w) => set({ w })} />
      </Field>
      <Field label="height">
        <NumberInput value={p.h} min={1} onChange={(h) => set({ h })} />
      </Field>
      <Field label="rotation °">
        <NumberInput value={p.rotation} onChange={(r) => set({ rotation: normalizeRotation(r) })} />
      </Field>
    </div>
  );
}

function CropControls({ item, p, cropping, setCropping, updateItem }: { item: PhotoItem; p: Placement | null; cropping: boolean; setCropping: (on: boolean) => void; updateItem: Props["updateItem"] }) {
  const c = item.content.crop ?? NO_CROP;
  const setCrop = (crop: Crop | null, key: string) => updateItem((i) => (i.type === "photo" ? { ...i, content: { ...i.content, crop } } : i), key);
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button className={cropping ? "primary" : ""} aria-pressed={cropping} onClick={() => setCropping(!cropping)} disabled={!p || p.locked}>
          {cropping ? "Done cropping" : "Crop"}
        </button>
        <button className="quiet" disabled={!isCropped(item.content.crop)} onClick={() => setCrop(null, `crop:${item.id}:reset`)}>
          Reset crop
        </button>
      </div>
      <Field label={`Zoom: ${c.zoom.toFixed(2)}×`}>
        <input
          type="range"
          min={1}
          max={MAX_CROP_ZOOM}
          step={0.01}
          value={c.zoom}
          disabled={!p}
          onChange={(e) => p && setCrop(zoomCrop(c, item.content.width, item.content.height, p.w, p.h, Number(e.target.value)), `crop:${item.id}:zoom`)}
        />
      </Field>
      <span className="small muted">
        {cropping
          ? "Drag the photo to choose what shows. Scroll or use Zoom to zoom. Esc, Enter or Done cropping when done."
          : "Double-click the photo, or press Crop, to crop it: drag to move it inside its box, scroll or use Zoom to zoom."}
      </span>
    </div>
  );
}

function RouteSettings({ item, updateItem }: { item: RouteItem; updateItem: Props["updateItem"] }) {
  const c = item.content;
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Partial<RouteItem["content"]>, field: string) =>
    updateItem((i) => ({ ...i, content: { ...(i as RouteItem).content, ...patch } }) as Item, `content:${item.id}:${field}`);
  return (
    <>
      <p className="small muted">
        Place this band where the route should play. While the page scrolls through it, the map stays on screen and the route draws in. Link items to stops (in their settings) to move the map to a stop.
      </p>
      <Field label={`Stops (${c.stops.length})${c.line.length ? `, path of ${c.line.length} points` : ""}`}>
        <div className="route-stops">
          {c.stops.map((stop, index) => (
            <input
              key={index}
              type="text"
              value={stop.name}
              aria-label={`Stop ${index + 1} name`}
              onChange={(e) => set({ stops: c.stops.map((s, i) => (i === index ? { ...s, name: e.target.value } : s)) }, `stop${index}`)}
            />
          ))}
        </div>
      </Field>
      <div className="row">
        <button onClick={() => input.current?.click()}>Replace with another file…</button>
        <input
          ref={input}
          type="file"
          hidden
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            try {
              const { stops, line } = parseRouteGeoJSON(JSON.parse(await file.text()));
              set({ stops, line }, "geojson");
              setMessage(`Loaded ${stops.length} stops. Links to stops keep their numbers.`);
            } catch (err) {
              setMessage(err instanceof SyntaxError ? "That file is not valid JSON." : (err as Error).message);
            }
          }}
        />
      </div>
      {message ? <span className="small muted">{message}</span> : null}
      <div className="grid2">
        <Field label="Route color">
          <input type="color" value={c.color} onChange={(e) => set({ color: e.target.value }, "color")} />
        </Field>
        <Field label={`Zoom on a stop: ${c.stepZoom}×`}>
          <input type="range" min={1} max={8} step={0.5} value={c.stepZoom} onChange={(e) => set({ stepZoom: Number(e.target.value) }, "stepZoom")} />
        </Field>
      </div>
      <label className="row small">
        <input type="checkbox" checked={c.borders} onChange={(e) => set({ borders: e.target.checked }, "borders")} />
        Borders (countries, US states)
      </label>
    </>
  );
}

function ItemSettings(props: Props & { item: Item }) {
  const { item, doc, updateItem, change, layer, duplicate, remove, layout, setMobileVisible } = props;
  const p = placementOf(item, layout);
  const locked = !!p?.locked;
  const content = <C extends Item>(patch: Partial<C["content"]>, field: string) =>
    updateItem((i) => ({ ...i, content: { ...i.content, ...patch } }) as Item, `content:${item.id}:${field}`);

  return (
    <div className="stack">
      <p className="tools-heading">{item.type === "quote" && item.content.binding ? item.content.binding : item.type === "model_3d" ? "3D model" : item.type === "playlist" && item.content.kind === "track" ? "song" : item.type.replace("_", " ")}</p>

      {item.type === "photo" ? (
        <>
          <Field label="Alt text (for screen readers)">
            <textarea rows={3} value={item.content.alt} placeholder="Describe the photo" onChange={(e) => content({ alt: e.target.value }, "alt")} />
          </Field>
          <Field label="Fit">
            <select value={item.content.fit} onChange={(e) => content({ fit: e.target.value as "cover" | "contain" }, "fit")}>
              <option value="cover">Crop to fill the box</option>
              <option value="contain">Show the whole photo</option>
            </select>
          </Field>
          {item.content.fit === "cover" ? <CropControls item={item} p={p} cropping={props.cropping} setCropping={props.setCropping} updateItem={updateItem} /> : null}
          <div className="stack" style={{ gap: 4 }}>
            <label className="row small">
              <input
                type="checkbox"
                checked={!!item.content.parallax && item.content.fit === "cover"}
                onChange={(e) => content<PhotoItem>(e.target.checked ? { parallax: true, fit: "cover" } : { parallax: undefined }, "parallax")}
              />
              Parallax background
            </label>
            <span className="small muted">
              {item.content.parallax && item.content.fit === "cover"
                ? "On the page, the photo fills the screen and stays put while the page scrolls past this box, like a view through a window. The crop applies to the screen-sized photo. Try it in Preview."
                : "Show the photo like a fixed background seen through this box as the page scrolls. Turning this on sets Fit to \"Crop to fill the box\"."}
            </span>
          </div>
          <div className="row">
            <button
              onClick={() => {
                const { width, height } = item.content;
                updateItem((i) => {
                  const cur = placementOf(i, layout);
                  return cur ? patchPlacement(i, layout, { h: Math.round(((cur.w * height) / width) * 10) / 10 }) : i;
                });
              }}
            >
              Original aspect ratio
            </button>
            <label className="row small">
              <input
                type="checkbox"
                checked={doc.coverItemId === item.id}
                onChange={(e) => change((d) => ({ ...d, coverItemId: e.target.checked ? item.id : null }))}
              />
              Cover image
            </label>
          </div>
        </>
      ) : null}

      {item.type === "quote" ? (
        <>
          <Field label="Shows">
            <select
              value={item.content.binding ?? "text"}
              onChange={(e) => content({ binding: e.target.value === "text" ? null : (e.target.value as "title" | "subtitle") }, "binding")}
            >
              <option value="text">Its own text</option>
              <option value="title">The season title</option>
              <option value="subtitle">The season subtitle</option>
            </select>
          </Field>
          {item.content.binding ? (
            <p className="small muted">Edit the {item.content.binding} in the season settings (click the empty canvas, or Season on a phone).</p>
          ) : (
            <>
              <Field label="Text (Markdown: **bold**, *italic*, [link](https://…))">
                <textarea rows={6} value={item.content.markdown} onChange={(e) => content({ markdown: e.target.value }, "markdown")} />
              </Field>
              <Field label="Source">
                <input type="text" value={item.content.source} onChange={(e) => content({ source: e.target.value }, "source")} />
              </Field>
            </>
          )}
          <div className="grid2">
            <Field label="Font">
              <select value={item.content.font} onChange={(e) => content({ font: e.target.value as (typeof QUOTE_FONTS)[number] }, "font")}>
                <option value="serif">EB Garamond</option>
                <option value="mono">IBM Plex Mono</option>
                <option value="sans">Sans-serif</option>
              </select>
            </Field>
            {layout === "desktop" || !p ? (
              <Field label="Size">
                <NumberInput value={item.content.size} min={4} onChange={(size) => content({ size: Math.min(400, size) }, "size")} />
              </Field>
            ) : (
              <Field label="Size on mobile">
                <NumberInput
                  value={quoteSize(item, layout, p)}
                  min={2}
                  onChange={(n) => updateItem((i) => patchPlacement(i, "mobile", { textSize: Math.min(400, n) }), `place:mobile:${item.id}:textSize`)}
                />
              </Field>
            )}
            <Field label="Align">
              <select value={item.content.align} onChange={(e) => content({ align: e.target.value as "left" | "center" | "right" }, "align")}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Color">
              <input type="color" value={item.content.color} onChange={(e) => content({ color: e.target.value }, "color")} />
            </Field>
          </div>
        </>
      ) : null}

      {item.type === "playlist" ? (
        <>
          <Field label="Title">
            <input type="text" value={item.content.title} onChange={(e) => content({ title: e.target.value }, "title")} />
          </Field>
          <Field label="Caption">
            <input type="text" placeholder={item.content.kind === "track" ? "the artist, or why this song" : "for walking home"} value={item.content.caption} onChange={(e) => content({ caption: e.target.value }, "caption")} />
          </Field>
          <a className="small" href={item.content.url} target="_blank" rel="noreferrer">
            Open on Spotify
          </a>
        </>
      ) : null}

      {item.type === "video" ? (
        <>
          <Field label="Description (for screen readers)">
            <textarea rows={3} value={item.content.alt} placeholder="Describe the video" onChange={(e) => content({ alt: e.target.value }, "alt")} />
          </Field>
          <Field label="Fit">
            <select value={item.content.fit} onChange={(e) => content({ fit: e.target.value as "cover" | "contain" }, "fit")}>
              <option value="cover">Crop to fill the box</option>
              <option value="contain">Show the whole video</option>
            </select>
          </Field>
          <p className="small muted">
            Loops without sound. {item.content.hasAudio ? "Visitors can turn sound on." : "This video has no sound."} {Math.round(item.content.duration)} s.
          </p>
        </>
      ) : null}

      {item.type === "sticker" ? (
        <Field label="Description (empty if decorative)">
          <input type="text" value={item.content.alt} onChange={(e) => content({ alt: e.target.value }, "alt")} />
        </Field>
      ) : null}

      {item.type === "video" || item.type === "sticker" ? (
        <div className="row">
          <button
            onClick={() => {
              const { width, height } = item.content;
              updateItem((i) => {
                const cur = placementOf(i, layout);
                return cur ? patchPlacement(i, layout, { h: Math.round(((cur.w * height) / width) * 10) / 10 }) : i;
              });
            }}
          >
            Original aspect ratio
          </button>
        </div>
      ) : null}

      {item.type === "map" ? (
        <>
          <Field label="Label">
            <input type="text" value={item.content.label} onChange={(e) => content({ label: e.target.value }, "label")} />
          </Field>
          <Field label={`Zoom: ${item.content.zoom} (0 = world)`}>
            <input
              type="range"
              min={MAP_ZOOM_MIN}
              max={MAP_ZOOM_MAX}
              step={0.25}
              value={item.content.zoom}
              onChange={(e) => content({ zoom: Number(e.target.value) }, "zoom")}
            />
          </Field>
          <div className="grid2">
            <Field label="Latitude">
              <NumberInput value={item.content.lat} step={0.01} onChange={(lat) => Math.abs(lat) <= 85 && content({ lat }, "lat")} />
            </Field>
            <Field label="Longitude">
              <NumberInput value={item.content.lon} step={0.01} onChange={(lon) => Math.abs(lon) <= 180 && content({ lon }, "lon")} />
            </Field>
          </div>
          <label className="row small">
            <input type="checkbox" checked={item.content.borders} onChange={(e) => content({ borders: e.target.checked }, "borders")} />
            Borders (countries, US states)
          </label>
        </>
      ) : null}

      {item.type === "voice_note" ? (
        <>
          <Field label="Caption">
            <input type="text" value={item.content.caption} placeholder="optional" onChange={(e) => content({ caption: e.target.value }, "caption")} />
          </Field>
          <p className="small muted">{formatDuration(item.content.duration)}. Plays only when a visitor presses play.</p>
        </>
      ) : null}

      {item.type === "route" ? <RouteSettings item={item} updateItem={updateItem} /> : null}

      {item.type === "model_3d" ? <ModelFields {...props} target={item.id} content={item.content} /> : null}

      {item.type === "quote" ? (
        <Field label="Type effect (public page and Preview)">
          <select value={item.content.effect ?? "none"} onChange={(e) => content({ effect: e.target.value as QuoteEffect }, "effect")}>
            {QUOTE_EFFECTS.map((fx) => (
              <option key={fx} value={fx}>
                {{ none: "None", repel: "Letters move away from the cursor", wave: "Letters ripple as the page scrolls", gather: "Letters gather mid-screen" }[fx]}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {item.type !== "route" ? (
        <Field label={`Follow the cursor: ${item.follow ? `${Math.round(item.follow * 100)}%` : "off"}`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={item.follow ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateItem((i) => ({ ...i, follow: v > 0 ? v : undefined }), `follow:${item.id}`);
            }}
          />
          <span className="small muted">Drifts toward the cursor, up to 40 units at 100%. On phones it moves with scroll.</span>
        </Field>
      ) : null}

      {item.type !== "route" && doc.items.some((i) => i.type === "route") ? (
        <Field label="Route stop (moves the map there when this item is mid-screen)">
          <select
            value={item.routeStop ? `${item.routeStop.routeId}:${item.routeStop.index}` : ""}
            onChange={(e) => {
              const [routeId, index] = e.target.value.split(":");
              updateItem((i) => ({ ...i, routeStop: e.target.value ? { routeId, index: Number(index) } : null }));
            }}
          >
            <option value="">none</option>
            {doc.items
              .filter((i): i is RouteItem => i.type === "route")
              .map((route, n, all) => (
                <optgroup key={route.id} label={all.length > 1 ? `route map ${n + 1}` : "route map"}>
                  {route.content.stops.map((stop, index) => (
                    <option key={index} value={`${route.id}:${index}`}>
                      {index + 1}. {stop.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </Field>
      ) : null}

      <hr />
      <p className="tools-heading">position on {layout}</p>
      {!p ? (
        <>
          <p className="small muted">Hidden on mobile.</p>
          <div className="row">
            <button onClick={() => setMobileVisible(item.id, true)}>Show on mobile</button>
          </div>
        </>
      ) : locked ? (
        <p className="small muted">Locked. Unlock to move, resize or rotate.</p>
      ) : (
        <PlacementFields item={item} p={p} layout={layout} updateItem={updateItem} />
      )}
      {p ? (
        <label className="row small">
          <input type="checkbox" checked={!!item.mobile} onChange={(e) => setMobileVisible(item.id, e.target.checked)} />
          Show on mobile
        </label>
      ) : null}
      <p className="small muted">Shift while resizing keeps the aspect ratio; Shift while rotating snaps to 15°. Arrow keys nudge. Hold Alt (Option) to measure: distances to the page edges, or to an item you point at, and whether this item is centered. Items snap to the page and to each other (Snap button in the top bar; hold ⌘ or Ctrl to skip once).</p>
{p ? (
      <div className="row">
        <button onClick={() => layer("front")} title="Bring to front">
          To front
        </button>
        <button onClick={() => layer("forward")} title="Bring forward">
          Forward
        </button>
        <button onClick={() => layer("backward")} title="Send backward">
          Backward
        </button>
        <button onClick={() => layer("back")} title="Send to back">
          To back
        </button>
      </div>
      ) : null}
      <div className="row">
        {p ? <button onClick={() => updateItem((i) => patchPlacement(i, layout, { locked: !locked }))}>{locked ? "Unlock" : "Lock"}</button> : null}
        <button onClick={duplicate} title="⌘D">
          Duplicate
        </button>
        <button className="error" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function Inspector(props: Props) {
  return props.item ? <ItemSettings {...props} item={props.item} /> : <SeasonSettings {...props} />;
}
