"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Moveable from "react-moveable";
import { api, BASE_PATH } from "@/lib/client";
import { CANVAS_WIDTH, DESKTOP_WIDTH, MAX_MODEL_ITEMS, MODEL_WARN_BYTES, type Crop, type Item, type Layout, type ModelContent, type PhotoItem, type Placement, type Scatter, type SeasonDoc, type ShapeKind, DEFAULT_SCATTER, slugFollowsTitle, slugProblem, titleSlug } from "@/lib/schema";
import { NO_CROP, panCrop, photoRect, zoomCrop } from "@/lib/crop";
import { pageHeight } from "@/lib/layout";
import { placementStyle } from "../geometry";
import { ItemContent, modelPoster } from "../ItemContent";
import { BackgroundLayer } from "../BackgroundLayer";
import { modelUrl } from "../items/model-url";
import { commit, commitGesture, createHistory, redo, replace, undo, type History } from "./history";
import { Inspector } from "./Inspector";
import {
  addItem,
  convertPoint,
  duplicateItem,
  moveItems,
  moveLayer,
  placementOf,
  removeItem,
  roundPlacement,
  scaledMobileLayout,
  scatterLayout,
  setMobileVisible,
  setPlacement,
  singleColumnMobileLayout,
  updateItem,
  withMobileLayout,
  MOBILE_FACTOR,
  type LayerMove,
} from "./ops";
import { parseRouteGeoJSON } from "@/lib/route";
import { formatBytes, isAcceptedImage, isAcceptedVideo, isAudio, isModelFile, modelReport, rejectionReason, uploadAudio, uploadImage, uploadImageBlob, uploadModel, uploadVideo, type StickerEntry, type UploadedModel } from "./upload";
import { Tools } from "./Tools";
import { measure, refineSnap } from "./measure";
import { MeasureOverlay } from "./MeasureOverlay";
import type { Place } from "@/lib/geo";
import { parseSpotifyLink, type SpotifyInfo } from "@/lib/spotify";

type SaveState = { kind: "saved" } | { kind: "pending" } | { kind: "saving" } | { kind: "error"; message: string; fatal: boolean };

export interface EditorProps {
  id: string;
  initialSlug: string;
  initialDoc: SeasonDoc;
  initialVersion: number;
  initialStatus: "draft" | "published";
  initialPublished: SeasonDoc | null;
  initialSortOrder: number | null;
  mediaBase: string;
}

const SAVE_DELAY = 1000;
/** Snap by edges and centers, on both axes. */
const SNAP_DIRECTIONS = { left: true, top: true, right: true, bottom: true, center: true, middle: true };

/** Below this width the tools and the inspector become sheets that slide up from the bottom. */
const COMPACT_QUERY = "(max-width: 899.98px)";
/** Phones open the editor on the mobile layout, the one they can judge best. */
const PHONE_QUERY = "(max-width: 640px)";
/** Fingers rather than a mouse: bigger handles, and a tap selects before a drag moves. */
const COARSE_QUERY = "(pointer: coarse)";
/** Mouse events a browser fires after a tap arrive within this many ms of the touch. */
const TOUCH_MOUSE_WINDOW = 1000;

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return matches;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function Editor(props: EditorProps) {
  const { id, mediaBase } = props;
  const [history, setHistory] = useState<History<SeasonDoc>>(() => createHistory(withMobileLayout(props.initialDoc)));
  const doc = history.present;
  const [selectedId, setPrimaryId] = useState<string | null>(null);
  // Shift-click adds items to the selection. The first one stays the primary
  // selection; these are the others. Selecting one item clears them.
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const setSelectedId = useCallback((itemId: string | null) => {
    setPrimaryId(itemId);
    setExtraIds([]);
  }, []);
  const [slug, setSlug] = useState(props.initialSlug);
  const [status, setStatus] = useState(props.initialStatus);
  // While a draft's slug was made from its title, it follows the title. It stops
  // once the owner sets a slug by hand; a published season never changes address on its own.
  const [slugAuto, setSlugAuto] = useState(() => slugFollowsTitle(props.initialSlug, props.initialDoc.title));
  const [published, setPublished] = useState<SeasonDoc | null>(props.initialPublished);

  useEffect(() => {
    if (!slugAuto || status !== "draft") return;
    const base = titleSlug(doc.title);
    // Already the title's slug, or that slug with a number because it was taken.
    if (slug === base || (slug.startsWith(`${base}-`) && /^\d+$/.test(slug.slice(base.length + 1)))) return;
    let stop = false;
    const timer = setTimeout(async () => {
      for (let n = 1; n <= 20 && !stop; n++) {
        const next = n === 1 ? base : `${base}-${n}`;
        if (slugProblem(next)) continue;
        try {
          await api(`/seasons/${id}`, { method: "PATCH", body: { slug: next } });
          if (!stop) setSlug(next);
          return;
        } catch (e) {
          // Taken by another season: try the next number. Anything else: leave the slug as it is.
          if ((e as Error & { status?: number }).status !== 409) return;
        }
      }
    }, 800);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [doc.title, slug, slugAuto, status, id]);
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [notice, setNotice] = useState<string | null>(null);
  // Information that is not an error, such as what model compression did.
  const [info, setInfo] = useState<string | null>(null);
  const [sketchError, setSketchError] = useState<string | null>(null);
  const [uploads, setUploads] = useState({ done: 0, total: 0, failed: [] as string[] });
  const [videoProgress, setVideoProgress] = useState<string | null>(null);
  const [shift, setShift] = useState(false);
  // Alt (Option on a Mac) shows measurements; the hovered item is what they measure against.
  const [alt, setAlt] = useState(false);
  // Snapping while dragging and resizing. The setting is remembered in this browser;
  // holding ⌘ or Ctrl skips it for the current move.
  const [snapOn, setSnapOn] = useState(true);
  const [snapSkip, setSnapSkip] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("seasons:snap") === "off") setSnapOn(false);
    } catch {}
  }, []);
  const toggleSnap = () =>
    setSnapOn((on) => {
      try {
        localStorage.setItem("seasons:snap", on ? "off" : "on");
      } catch {}
      return !on;
    });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Crop mode for one photo: drag moves the photo inside its box, the wheel zooms.
  const [cropId, setCropId] = useState<string | null>(null);
  const [stageWidth, setStageWidth] = useState(1000);
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [layout, setLayout] = useState<Layout>("desktop");
  const [sortOrder, setSortOrder] = useState(props.initialSortOrder);
  const compact = useMediaQuery(COMPACT_QUERY);
  const coarse = useMediaQuery(COARSE_QUERY);
  // On a small screen, which sheet is open over the page.
  const [sheet, setSheet] = useState<null | "tools" | "inspector">(null);
  useEffect(() => {
    if (window.matchMedia(PHONE_QUERY).matches) setLayout("mobile");
  }, []);
  // When the last touch happened, to tell a tap's mouse events from a real mouse.
  const lastTouch = useRef(0);
  const fromTouch = () => Date.now() - lastTouch.current < TOUCH_MOUSE_WINDOW;

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const moveableRef = useRef<Moveable>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gestureStart = useRef<SeasonDoc | null>(null);
  // Alt+drag: the press copies the item in place and the drag moves the copy.
  // `before` is the document without the copy, so one undo removes it; `dragged`
  // turns true once the copy has moved (a press without a drag leaves no copy).
  const altCopy = useRef<{ before: SeasonDoc; originals: string[]; dragged: boolean } | null>(null);

  const canvasWidth = CANVAS_WIDTH[layout];
  // The page grows to fit its lowest item. Below the end of the page the editor
  // keeps empty working room; dragging an item there makes the page longer.
  const pageEnd = pageHeight(doc, layout);
  const canvasHeight = pageEnd + (layout === "desktop" ? 900 : 500);
  const scale = stageWidth / canvasWidth;
  const selected = doc.items.find((i) => i.id === selectedId) ?? null;
  const selectedPlacement = selected ? placementOf(selected, layout) : null;
  // Two or more items selected with shift-click: they move together, with no handles.
  const groupIds = selected && extraIds.length ? [selected.id, ...extraIds.filter((x) => doc.items.some((i) => i.id === x && placementOf(i, layout)))] : [];
  const grouped = groupIds.length > 1;
  const isSelected = (itemId: string) => itemId === selectedId || (grouped && groupIds.includes(itemId));
  /** Shift-click: adds the item to the selection, or takes it out. */
  const toggleSelected = (itemId: string) => {
    if (!selectedId) return setSelectedId(itemId);
    if (itemId === selectedId) {
      const [next, ...rest] = extraIds;
      setPrimaryId(next ?? null);
      setExtraIds(rest);
    } else {
      setExtraIds((ids) => (ids.includes(itemId) ? ids.filter((x) => x !== itemId) : [...ids, itemId]));
    }
  };

  // ---------- document changes ----------
  const change = useCallback((next: SeasonDoc | ((d: SeasonDoc) => SeasonDoc), key: string | null = null) => {
    setHistory((h) => commit(h, typeof next === "function" ? next(h.present) : next, key));
  }, []);

  // ---------- autosave (draft only; Publish is separate) ----------
  const version = useRef(props.initialVersion);
  const savedDoc = useRef(props.initialDoc);
  const saving = useRef<Promise<void> | null>(null);
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const fatal = save.kind === "error" && save.fatal;

  const saveNow = useCallback(async (): Promise<void> => {
    while (saving.current) await saving.current;
    const toSave = latestDoc.current;
    if (toSave === savedDoc.current) return;
    setSave({ kind: "saving" });
    saving.current = (async () => {
      try {
        const res = await api<{ version: number }>(`/seasons/${id}`, { method: "PUT", body: { version: version.current, doc: toSave } });
        version.current = res.version;
        savedDoc.current = toSave;
        setSave(latestDoc.current === toSave ? { kind: "saved" } : { kind: "pending" });
      } catch (e) {
        const err = e as Error & { status?: number };
        setSave({ kind: "error", message: err.message, fatal: err.status === 409 || err.status === 401 });
        throw err;
      } finally {
        saving.current = null;
      }
    })();
    return saving.current;
  }, [id]);

  useEffect(() => {
    if (doc === savedDoc.current || fatal) return;
    setSave((s) => (s.kind === "saving" ? s : { kind: "pending" }));
    const t = setTimeout(() => saveNow().catch(() => {}), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [doc, saveNow, fatal]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (latestDoc.current !== savedDoc.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // ---------- stage size ----------
  useLayoutEffect(() => {
    const el = stageWrapRef.current;
    if (!el) return;
    // The mobile canvas shows at a comfortable zoom; the desktop canvas fills the stage.
    const measure = () => {
      const cs = getComputedStyle(el);
      const width = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      setStageWidth(layout === "mobile" ? Math.min(520, Math.max(280, width)) : Math.max(280, width));
      // A background layer fills one screen of the stage (see .bg-layer-screen).
      el.style.setProperty("--stage-height", `${el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout]);

  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [doc, stageWidth, selectedId, layout]);

  // ---------- placing new items ----------
  /**
   * New items get a desktop placement; their mobile placement is the scaled desktop
   * one (see ops.addItem). This is the middle of what is on screen, in desktop units.
   */
  const visibleCenter = useCallback(() => {
    const wrap = stageWrapRef.current;
    const top = wrap ? wrap.scrollTop / scale : 0;
    const viewH = wrap ? wrap.clientHeight / scale : 800;
    return convertPoint({ x: canvasWidth / 2, y: Math.min(canvasHeight, top + viewH / 2) }, layout, "desktop");
  }, [scale, canvasWidth, canvasHeight, layout]);

  /** A desktop placement of size w × h centered on `center` (desktop units), cascaded by index. */
  const place = (w: number, h: number, center?: { x: number; y: number }, index = 0): Placement => {
    const c = center ?? visibleCenter();
    const x = Math.max(0, Math.min(DESKTOP_WIDTH - w, c.x - w / 2 + index * 32));
    const y = Math.max(0, c.y - h / 2 + index * 32);
    return roundPlacement({ x, y, w, h, rotation: 0, z: 0, locked: false });
  };

  const addAndSelect = (item: Item) => {
    setSheet((s) => (s === "tools" ? null : s));
    change((d) => addItem(d, item));
    setSelectedId(item.id);
  };

  const addQuote = (markdown = "a quote", binding: "title" | "subtitle" | null = null) => {
    const size = binding === "title" ? 72 : binding === "subtitle" ? 26 : 30;
    const w = binding === "title" ? 900 : 480;
    const h = binding === "title" ? 110 : binding === "subtitle" ? 80 : 180;
    addAndSelect({
      id: crypto.randomUUID(),
      type: "quote",
      desktop: place(w, h),
      mobile: null,
      content: { markdown: binding ? "" : markdown, source: "", font: "serif", size, align: "left", color: "#1d1d1b", binding },
    });
  };

  const addPlaylist = async (url: string) => {
    if (!parseSpotifyLink(url)) {
      setNotice("That is not a Spotify playlist or song link.");
      return;
    }
    try {
      const info = await api<SpotifyInfo>("/spotify", { body: { url } });
      addAndSelect({ id: crypto.randomUUID(), type: "playlist", desktop: place(300, 400), mobile: null, content: { ...info, caption: "" } });
      setPlaylistUrl("");
      setNotice(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  const failUpload = (name: string, e: unknown) =>
    setUploads((u) => ({ ...u, done: u.done + 1, failed: [...u.failed, `${name}: ${(e as Error).message}`] }));

  const addVoiceNote = async (blob: Blob, name = "recording", at?: { x: number; y: number }) => {
    setUploads((u) => ({ ...u, total: u.total + 1 }));
    try {
      const a = await uploadAudio(blob);
      addAndSelect({
        id: crypto.randomUUID(),
        type: "voice_note",
        desktop: place(340, 64, at),
        mobile: null,
        content: { mediaId: a.mediaId, duration: a.duration, waveform: a.waveform, caption: "" },
      });
      setUploads((u) => ({ ...u, done: u.done + 1 }));
    } catch (e) {
      failUpload(name, e);
    }
  };

  const addSticker = (s: StickerEntry, alt = "") => {
    const w = 200;
    addAndSelect({
      id: crypto.randomUUID(),
      type: "sticker",
      desktop: place(w, Math.round((w * s.height) / s.width)),
      mobile: null,
      content: { stickerId: s.id, mediaId: s.mediaId, width: s.width, height: s.height, widths: s.widths, alt },
    });
  };

  /** A route map band: right half of the desktop page, full width on mobile, a few screens tall. */
  const addRoute = async (file: File) => {
    try {
      const { stops, line } = parseRouteGeoJSON(JSON.parse(await file.text()));
      const desktop = place(720, 2700);
      addAndSelect({
        id: crypto.randomUUID(),
        type: "route",
        desktop,
        mobile: { x: 0, y: Math.round(desktop.y * MOBILE_FACTOR), w: 390, h: 2400, rotation: 0, z: 0, locked: false },
        content: { stops, line, color: "#c63d32", borders: true, stepZoom: 3 },
      });
      setNotice(null);
    } catch (e) {
      setNotice(`${file.name}: ${e instanceof SyntaxError ? "this file is not valid JSON." : (e as Error).message}`);
    }
  };

  /** A route map built in the editor: it starts with one stop, and the owner adds the rest. */
  const startRoute = (p: Place) => {
    const desktop = place(720, 2700);
    addAndSelect({
      id: crypto.randomUUID(),
      type: "route",
      desktop,
      mobile: { x: 0, y: Math.round(desktop.y * MOBILE_FACTOR), w: 390, h: 2400, rotation: 0, z: 0, locked: false },
      content: { stops: [{ name: p.label || "stop 1", lat: p.lat, lon: p.lon }], line: [], color: "#c63d32", borders: true, stepZoom: 3 },
    });
    setNotice(null);
  };

  const addMap = (p: Place) => {
    addAndSelect({
      id: crypto.randomUUID(),
      type: "map",
      desktop: place(320, 320),
      mobile: null,
      content: { lat: p.lat, lon: p.lon, zoom: 5, label: p.label, borders: true },
    });
  };

  const addShape = (shape: ShapeKind) => {
    const [w, h] = shape === "arrow" ? [240, 160] : [200, 200];
    addAndSelect({
      id: crypto.randomUUID(),
      type: "shape",
      desktop: place(w, h),
      mobile: null,
      content: { shape, fill: "#1d1d1b", stroke: "#1d1d1b", strokeWidth: 0 },
    });
  };

  // ---------- 3D models ----------
  /** Changes a model's content, on an item or on the background (target "background"). */
  const setModelContent = (target: string, patch: Partial<ModelContent>, undoable: boolean | string) => {
    const update = (d: SeasonDoc): SeasonDoc => {
      if (target !== "background") return updateItem(d, target, (i) => (i.type === "model_3d" ? { ...i, content: { ...i.content, ...patch } } : i));
      const layer = d.backgroundLayer;
      return layer?.kind === "model" ? { ...d, backgroundLayer: { ...layer, model: { ...layer.model, ...patch } } } : d;
    };
    if (undoable) change(update, typeof undoable === "string" ? undoable : null);
    else setHistory((h) => replace(h, update(h.present)));
  };

  /** Draws a still of the model in the browser and stores it as its poster. */
  const drawPoster = async (target: string, content: ModelContent, undoable: boolean) => {
    try {
      const { renderModelPoster } = await import("./model-poster");
      const img = await uploadImageBlob(await renderModelPoster(modelUrl(mediaBase, content.mediaId), content));
      setModelContent(target, { posterMediaId: img.mediaId, posterWidths: img.widths }, undoable);
    } catch (e) {
      setNotice(`The poster image was not made: ${(e as Error).message}`);
    }
  };

  // Models without a poster (for example from the demo season, made on the server) get one when the season opens.
  const posterPass = useRef(false);
  useEffect(() => {
    if (posterPass.current) return;
    posterPass.current = true;
    const d = latestDoc.current;
    const missing: [string, ModelContent][] = [
      ...d.items.filter((i) => i.type === "model_3d" && !i.content.posterMediaId).map((i) => [i.id, i.content as ModelContent] as [string, ModelContent]),
      ...(d.backgroundLayer?.kind === "model" && !d.backgroundLayer.model.posterMediaId ? [["background", d.backgroundLayer.model] as [string, ModelContent]] : []),
    ];
    void (async () => {
      for (const [target, content] of missing) await drawPoster(target, content, false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const newModelContent = (m: UploadedModel): ModelContent => ({
    mediaId: m.mediaId,
    posterMediaId: null,
    posterWidths: [],
    bytes: m.bytes,
    scale: 1,
    rotation: [0, 0, 0],
    spin: 0,
    follow: false,
    animate: m.hasAnimation,
    hasAnimation: m.hasAnimation,
    alt: "",
  });

  /** Uploads and compresses a .glb, for a new item or for the background. */
  const addModel = async (file: File, textureSize: 1024 | 2048, target: "item" | "background" = "item") => {
    if (target === "item" && latestDoc.current.items.filter((i) => i.type === "model_3d").length >= MAX_MODEL_ITEMS) {
      setNotice(`A season can hold at most ${MAX_MODEL_ITEMS} 3D models (each one needs its own WebGL context in the browser).`);
      return;
    }
    if (!isModelFile(file)) {
      setNotice(`${file.name}: 3D models must be glTF binary files (.glb).`);
      return;
    }
    setUploads((u) => ({ ...u, total: u.total + 1 }));
    setInfo(`compressing ${file.name}…`);
    try {
      const m = await uploadModel(file, textureSize);
      const content = newModelContent(m);
      const id = crypto.randomUUID();
      if (target === "item") addAndSelect({ id, type: "model_3d", desktop: place(420, 420), mobile: null, content });
      else change((d) => ({ ...d, backgroundLayer: { kind: "model", model: content } }));
      setUploads((u) => ({ ...u, done: u.done + 1 }));
      const warn = m.bytes > MODEL_WARN_BYTES ? ` Still large (${formatBytes(m.bytes)}): it will load slowly on phones. Try 1024 px textures, or simplify the model.` : "";
      setInfo(`${file.name}: ${modelReport(m)}.${m.warnings.length ? ` ${m.warnings.join(" ")}` : ""}${warn}`);
      await drawPoster(target === "item" ? id : "background", content, false);
    } catch (e) {
      failUpload(file.name, e);
      setInfo(null);
    }
  };

  /** Photos (3 at a time), videos (one at a time; compression is heavy) and audio files. */
  const uploadFiles = async (files: File[], at?: { x: number; y: number }) => {
    if (files.length) setSheet((s) => (s === "tools" ? null : s));
    // A .glb dropped or pasted becomes a 3D model item.
    for (const f of files.filter(isModelFile)) void addModel(f, 2048);
    files = files.filter((f) => !isModelFile(f));
    if (!files.length) return;
    const images = files.filter(isAcceptedImage);
    const videos = files.filter((f) => !isAcceptedImage(f) && isAcceptedVideo(f));
    const audios = files.filter((f) => !isAcceptedImage(f) && !isAcceptedVideo(f) && isAudio(f));
    const rejected = files.filter((f) => !images.includes(f) && !videos.includes(f) && !audios.includes(f)).map(rejectionReason);
    if (rejected.length) setUploads((u) => ({ ...u, failed: [...u.failed, ...rejected] }));
    if (!images.length && !videos.length && !audios.length) return;
    setUploads((u) => ({ ...u, total: u.total + images.length + videos.length }));

    let index = 0;
    const queue = images.map((file) => ({ file, index: index++ }));
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const img = await uploadImage(job.file);
          const w = 360;
          const h = Math.round((w * img.height) / img.width);
          change((d) =>
            addItem(d, {
              id: crypto.randomUUID(),
              type: "photo",
              desktop: place(w, h, at, job!.index),
              mobile: null,
              content: { mediaId: img.mediaId, width: img.width, height: img.height, widths: img.widths, alt: "", fit: "cover" },
            }),
          );
          setUploads((u) => ({ ...u, done: u.done + 1 }));
        } catch (e) {
          failUpload(job.file.name, e);
        }
      }
    };
    const videoWorker = async () => {
      for (const file of videos) {
        const n = index++;
        try {
          setVideoProgress(`compressing ${file.name}…`);
          const v = await uploadVideo(file, (p) => setVideoProgress(`compressing ${file.name}: ${Math.round(p * 100)}%`));
          const w = 360;
          change((d) =>
            addItem(d, {
              id: crypto.randomUUID(),
              type: "video",
              desktop: place(w, Math.round((w * v.height) / v.width), at, n),
              mobile: null,
              content: {
                mediaId: v.mediaId,
                posterMediaId: v.poster.mediaId,
                posterWidths: v.poster.widths,
                width: v.width,
                height: v.height,
                duration: v.duration,
                hasAudio: v.hasAudio,
                alt: "",
                fit: "cover",
              },
            }),
          );
          setUploads((u) => ({ ...u, done: u.done + 1 }));
        } catch (e) {
          failUpload(file.name, e);
        } finally {
          setVideoProgress(null);
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), videoWorker(), ...audios.map((f) => addVoiceNote(f, f.name, at))]);
  };

  // ---------- item commands ----------
  const updateSelected = (fn: (item: Item) => Item, key?: string) => {
    if (!selectedId) return;
    change((d) => ({ ...d, items: d.items.map((i) => (i.id === selectedId ? fn(i) : i)) }), key ?? null);
  };
  const layer = (move: LayerMove) => selectedId && change((d) => moveLayer(d, selectedId, move, layout));
  const duplicate = () => {
    if (!selectedId) return;
    const newId = crypto.randomUUID();
    change((d) => duplicateItem(d, selectedId, newId, layout));
    setSelectedId(newId);
  };
  const remove = () => {
    if (!selectedId) return;
    change((d) => removeItem(d, selectedId));
    setSelectedId(null);
  };
  /** Deletes every selected item that is not locked. */
  const removeGroup = () => {
    const ids = groupIds.filter((x) => !placementOf(doc.items.find((i) => i.id === x)!, layout)?.locked);
    if (!ids.length) return;
    change((d) => ids.reduce(removeItem, d));
    setSelectedId(null);
  };

  // ---------- keyboard and paste ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      setShift(e.shiftKey);
      setAlt(e.altKey);
      setSnapSkip(e.metaKey || e.ctrlKey);
      // On Windows a lone Alt press would focus the browser menu and swallow the next keys.
      if (e.key === "Alt") e.preventDefault();
      if (e.type !== "keydown" || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setHistory(redo);
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!grouped) duplicate();
      } else if (grouped && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        removeGroup();
      } else if (grouped && e.key.startsWith("Arrow") && !cropId) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        change((d) => moveItems(d, groupIds, dx, dy, layout), `nudge:${layout}:${groupIds.join(",")}`);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selected && !selectedPlacement?.locked) {
        e.preventDefault();
        remove();
      } else if (cropId && (e.key === "Escape" || e.key === "Enter")) {
        e.preventDefault();
        setCropId(null);
      } else if (e.key === "Escape") {
        setSelectedId(null);
      } else if (e.key.startsWith("Arrow") && !cropId && selected && selectedPlacement && !selectedPlacement.locked) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        change((d) => setPlacement(d, selected.id, { x: selectedPlacement.x + dx, y: selectedPlacement.y + dy }, layout), `nudge:${layout}:${selected.id}`);
      }
    };
    const onBlur = () => {
      setShift(false);
      setAlt(false);
      setSnapSkip(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  });

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || !e.clipboardData) return;
      const files = Array.from(e.clipboardData.files);
      if (files.length) {
        e.preventDefault();
        void uploadFiles(files);
        return;
      }
      const text = e.clipboardData.getData("text/plain").trim();
      if (!text) return;
      e.preventDefault();
      if (parseSpotifyLink(text)) void addPlaylist(text);
      else addQuote(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  });

  // ---------- publish ----------
  const hasChanges = useMemo(() => !published || JSON.stringify(published) !== JSON.stringify(doc), [published, doc]);

  const publish = async () => {
    try {
      await saveNow();
      await api(`/seasons/${id}/publish`, { body: {} });
      setPublished(latestDoc.current);
      setStatus("published");
      setNotice(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const unpublish = async () => {
    try {
      await api(`/seasons/${id}/publish`, { method: "DELETE" });
      setStatus("draft");
    } catch (e) {
      setNotice((e as Error).message);
    }
  };
  const discard = async () => {
    if (!confirm("Replace the draft with the published version?")) return;
    try {
      await saveNow();
      const res = await api<{ doc: SeasonDoc; version: number }>(`/seasons/${id}/discard`, { body: {} });
      version.current = res.version;
      savedDoc.current = res.doc;
      setHistory((h) => commit(h, res.doc));
      // The server already has this document; skip the autosave it would trigger.
      latestDoc.current = res.doc;
      savedDoc.current = res.doc;
      setSelectedId(null);
    } catch (e) {
      setNotice((e as Error).message);
    }
  };

  // ---------- Moveable ----------
  const target = !grouped && selected && selectedPlacement && cropId !== selected.id ? itemRefs.current.get(selected.id) ?? null : null;
  const locked = !!selectedPlacement?.locked;
  const live = (patch: Partial<Placement>) => {
    if (!selectedId) return;
    setHistory((h) => replace(h, setPlacement(h.present, selectedId, patch, layout)));
  };
  const startGesture = () => {
    gestureStart.current = altCopy.current?.before ?? latestDoc.current;
  };
  const endGesture = (moved = false) => {
    const before = gestureStart.current;
    gestureStart.current = null;
    if (altCopy.current) {
      // A press without a drag: the release handler in startAltCopy takes the copy away.
      if (!moved) return;
      altCopy.current.dragged = true;
    }
    if (!before || !selectedId) return;
    const snapping = moved && snapOn && !snapSkip;
    setHistory((h) => {
      const item = h.present.items.find((i) => i.id === selectedId);
      let p = item ? placementOf(item, layout) : null;
      if (p && snapping) {
        const others = h.present.items.filter((i) => i.id !== selectedId).map((i) => placementOf(i, layout)).filter((o): o is Placement => !!o);
        p = { ...p, ...refineSnap(p, { width: canvasWidth, height: pageHeight(h.present, layout) }, others) };
      }
      const rounded = p ? setPlacement(h.present, selectedId, roundPlacement(p), layout) : h.present;
      return commitGesture(replace(h, rounded), before);
    });
  };


  // Moveable's gesture layer listens to mouse and touch events (not pointer events),
  // so selection and drag start on mousedown / touchstart. Selecting and dragging
  // happen in one press.
  // ---------- crop mode ----------
  const canCrop = (item: Item | null): item is PhotoItem => !!item && item.type === "photo" && item.content.fit === "cover";
  // Leaving the photo (selecting something else, or nothing) ends crop mode.
  useEffect(() => {
    if (cropId && cropId !== selectedId) setCropId(null);
  }, [cropId, selectedId]);

  const setCrop = (itemId: string, crop: Crop, key: string | null, liveOnly = false) => {
    const update = (d: SeasonDoc) => updateItem(d, itemId, (i) => (i.type === "photo" ? { ...i, content: { ...i.content, crop } } : i));
    if (liveOnly) setHistory((h) => replace(h, update(h.present)));
    else change(update, key);
  };

  /** Drag inside a photo in crop mode: the photo follows the pointer or the finger. */
  const startCropPan = (item: Item, e: React.MouseEvent | React.TouchEvent) => {
    const p = placementOf(item, layout);
    if (!p || item.type !== "photo") return;
    const startCrop = item.content.crop ?? NO_CROP;
    const rect = photoRect(item.content.width, item.content.height, p.w, p.h, startCrop);
    const before = latestDoc.current;
    const rad = (-p.rotation * Math.PI) / 180;
    const touch = "touches" in e;
    const point = (ev: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => ("touches" in ev ? ev.touches[0] ?? ev.changedTouches[0] : ev);
    const { clientX: sx, clientY: sy } = point(e);
    const move = (ev: MouseEvent | TouchEvent) => {
      if (touch) ev.preventDefault();
      // Pointer movement in the photo's own (unrotated) frame, as fractions of its box.
      const { clientX, clientY } = point(ev);
      const dx = clientX - sx;
      const dy = clientY - sy;
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (p.w * scale);
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (p.h * scale);
      setCrop(item.id, panCrop(startCrop, rect, lx, ly), null, true);
    };
    const [moveEvent, upEvent] = touch ? (["touchmove", "touchend"] as const) : (["mousemove", "mouseup"] as const);
    const up = () => {
      window.removeEventListener(moveEvent, move);
      window.removeEventListener(upEvent, up);
      if (touch) window.removeEventListener("touchcancel", up);
      setHistory((h) => commitGesture(h, before));
    };
    window.addEventListener(moveEvent, move, { passive: false });
    window.addEventListener(upEvent, up);
    if (touch) window.addEventListener("touchcancel", up);
  };

  // The wheel zooms the photo in crop mode (a native listener, so the page does not scroll).
  useEffect(() => {
    const stage = stageWrapRef.current;
    if (!stage || !cropId) return;
    const onWheel = (ev: WheelEvent) => {
      const el = itemRefs.current.get(cropId);
      if (!el || !el.contains(ev.target as Node)) return;
      ev.preventDefault();
      const item = latestDoc.current.items.find((i) => i.id === cropId);
      const p = item ? placementOf(item, layout) : null;
      if (!item || item.type !== "photo" || !p) return;
      const c = item.content.crop ?? NO_CROP;
      const next = zoomCrop(c, item.content.width, item.content.height, p.w, p.h, c.zoom * Math.exp(-ev.deltaY * 0.0015));
      setCrop(cropId, next, `crop:${cropId}:zoom`);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  });

  /**
   * Drag on one of several selected items: they all follow the pointer or the
   * finger. A press that does not move calls `onTap`. `before` is what one undo
   * goes back to; the items move from where they are now.
   */
  const startGroupDrag = (ids: string[], e: React.MouseEvent | React.TouchEvent, onTap: () => void, before = latestDoc.current) => {
    const base = latestDoc.current;
    const touch = "touches" in e;
    const point = (ev: MouseEvent | TouchEvent | React.MouseEvent | React.TouchEvent) => ("touches" in ev ? ev.touches[0] ?? ev.changedTouches[0] : ev);
    const { clientX: sx, clientY: sy } = point(e);
    let moved = false;
    const move = (ev: MouseEvent | TouchEvent) => {
      if (touch) ev.preventDefault();
      const { clientX, clientY } = point(ev);
      if (!moved && Math.hypot(clientX - sx, clientY - sy) < 3) return;
      moved = true;
      const next = moveItems(base, ids, (clientX - sx) / scale, (clientY - sy) / scale, layout);
      setHistory((h) => replace(h, next));
    };
    const [moveEvent, upEvent] = touch ? (["touchmove", "touchend"] as const) : (["mousemove", "mouseup"] as const);
    const up = () => {
      window.removeEventListener(moveEvent, move);
      window.removeEventListener(upEvent, up);
      if (touch) window.removeEventListener("touchcancel", up);
      if (moved) setHistory((h) => commitGesture(h, before));
      else onTap();
    };
    window.addEventListener(moveEvent, move, { passive: false });
    window.addEventListener(upEvent, up);
    if (touch) window.addEventListener("touchcancel", up);
  };

  /**
   * Alt+drag: copies the pressed item (or every selected item, when it is one of
   * several) exactly in place, selects the copies and drags them. The originals
   * stay. Returns false when there is nothing to copy (locked items).
   */
  const startAltCopy = (item: Item, e: React.MouseEvent) => {
    const isLocked = (itemId: string) => {
      const it = latestDoc.current.items.find((i) => i.id === itemId);
      return !it || !!placementOf(it, layout)?.locked;
    };
    const originals = (grouped && groupIds.includes(item.id) ? groupIds : [item.id]).filter((x) => !isLocked(x));
    if (!originals.length) return false;
    const before = latestDoc.current;
    const copies = originals.map(() => crypto.randomUUID());
    const next = originals.reduce((d, id, n) => duplicateItem(d, id, copies[n], layout, false), before);
    flushSync(() => {
      setHistory((h) => replace(h, next));
      setPrimaryId(copies[0]);
      setExtraIds(copies.slice(1));
    });
    const takeBack = () => {
      setHistory((h) => replace(h, before));
      setPrimaryId(originals[0]);
      setExtraIds(originals.slice(1));
    };
    if (copies.length > 1) {
      startGroupDrag(copies, e, takeBack, before);
      return true;
    }
    altCopy.current = { before, originals, dragged: false };
    const up = () => {
      window.removeEventListener("mouseup", up);
      // After Moveable's own release handling (endGesture), which marks a real drag.
      setTimeout(() => {
        const a = altCopy.current;
        altCopy.current = null;
        if (a && !a.dragged) takeBack();
      });
    };
    window.addEventListener("mouseup", up);
    moveableRef.current?.dragStart(e.nativeEvent);
    return true;
  };

  const onItemPress = (item: Item, e: React.MouseEvent | React.TouchEvent) => {
    if ("button" in e && e.button !== 0) return;
    e.stopPropagation();
    if (cropId === item.id) return startCropPan(item, e);
    if (e.shiftKey && !("touches" in e)) return toggleSelected(item.id);
    if (e.altKey && !("touches" in e) && startAltCopy(item, e)) return;
    if (grouped && groupIds.includes(item.id)) return startGroupDrag(groupIds, e, () => setSelectedId(item.id));
    if (selectedId !== item.id) flushSync(() => setSelectedId(item.id));
    if (!placementOf(item, layout)?.locked) moveableRef.current?.dragStart(e.nativeEvent);
  };

  const sorted = doc.items
    .map((item) => ({ item, p: placementOf(item, layout) }))
    .filter((x): x is { item: Item; p: Placement } => x.p !== null)
    .sort((a, b) => a.p.z - b.p.z);
  const saveLabel =
    save.kind === "saved" ? "saved" : save.kind === "saving" ? "saving…" : save.kind === "pending" ? "unsaved changes" : `not saved: ${save.message}`;

  // Upload progress, size reports and errors. Beside the tools on a wide screen;
  // above the bottom bar on a small one, where the tools are usually hidden.
  const hasMessages = (uploads.total > 0 && uploads.done < uploads.total) || !!videoProgress || !!info || uploads.failed.length > 0 || !!notice;
  const messages = (
    <>
      {uploads.total > 0 && uploads.done < uploads.total ? (
        <p className="small" role="status">
          uploading {uploads.done + 1} of {uploads.total}…
        </p>
      ) : null}
      {videoProgress ? <p className="small">{videoProgress}</p> : null}
      {info ? (
        <p className="small muted size-report" onClick={() => setInfo(null)}>
          {info}
        </p>
      ) : null}
      {uploads.failed.length ? (
        <div className="small error">
          {uploads.failed.map((f, i) => (
            <p key={i}>{f}</p>
          ))}
          <button className="quiet" onClick={() => setUploads((u) => ({ ...u, failed: [] }))}>
            Clear
          </button>
        </div>
      ) : null}
      {notice ? (
        <p className="small error" onClick={() => setNotice(null)}>
          {notice}
        </p>
      ) : null}
    </>
  );
  const sheetHead = (title: string) =>
    compact ? (
      <div className="sheet-head">
        <strong>{title}</strong>
        <button className="quiet" onClick={() => setSheet(null)}>
          Done
        </button>
      </div>
    ) : null;

  // The bar's controls, arranged in two rows: on a wide screen by kind; on a small
  // one the title and save state come first and the actions scroll sideways below.
  const layoutControls = (
    <>
      <span className="segmented" role="group" aria-label="Layout">
        {(["desktop", "mobile"] as const).map((l) => (
          <button
            key={l}
            className={layout === l ? "primary" : ""}
            aria-pressed={layout === l}
            onClick={() => {
              setLayout(l);
              if (selected && l === "mobile" && !selected.mobile) setSelectedId(null);
            }}
          >
            {l === "desktop" ? "Desktop" : "Mobile"}
          </button>
        ))}
      </span>
      <button
        className={snapOn ? "primary snap-toggle" : "snap-toggle"}
        aria-pressed={snapOn}
        onClick={toggleSnap}
        title="Snap to the page and to other items while dragging and resizing. Hold ⌘ or Ctrl during a move to skip snapping once."
      >
        Snap {snapOn ? "on" : "off"}
      </button>
      <button
        onClick={() => change((d) => scatterLayout(d, layout, { ...(d.scatter ?? DEFAULT_SCATTER), seed: Math.floor(Math.random() * 1_000_000) }))}
        title={`Place every unlocked item on the ${layout} page at random, with a new seed. The page grows when there are many items. Lock items to keep them; Undo goes back. Seed and size range: Season settings (click an empty spot on the page).`}
      >
        Shuffle
      </button>
    </>
  );
  const saveStatus = (
    <span className={save.kind === "error" ? "error" : "muted"} role="status">
      {saveLabel}
    </span>
  );
  const historyControls = (
    <>
      <button className="quiet" onClick={() => setHistory(undo)} disabled={!history.past.length} title="Undo (⌘Z)">
        Undo
      </button>
      <button className="quiet" onClick={() => setHistory(redo)} disabled={!history.future.length} title="Redo (⇧⌘Z)">
        Redo
      </button>
    </>
  );
  const publishControls = (
    <>
      {/* On a small screen the preview opens full screen in this window (an installed app has no tabs). */}
      <a
        className="button"
        href={`${BASE_PATH}/edit/${id}/preview?device=${layout === "mobile" ? "phone" : "laptop"}${compact ? "&full=1" : ""}`}
        target={compact ? undefined : "_blank"}
        rel="noreferrer"
        onClick={(e) => {
          if (!compact) return void saveNow().catch(() => {});
          // Leave only once the draft is saved, so the preview shows the latest changes.
          e.preventDefault();
          const href = e.currentTarget.href;
          saveNow()
            .catch(() => {})
            .finally(() => window.location.assign(href));
        }}
      >
        Preview
      </a>
      {status === "published" ? (
        <>
          <a className="quiet-link" href={`${BASE_PATH}/${slug}`} target="_blank" rel="noreferrer">
            /{slug}
          </a>
          {hasChanges ? (
            <button className="quiet" onClick={discard}>
              Discard changes
            </button>
          ) : null}
          <button className="quiet" onClick={unpublish}>
            Unpublish
          </button>
          <button className="primary" onClick={publish} disabled={!hasChanges || fatal}>
            {hasChanges ? "Publish changes" : "Published"}
          </button>
        </>
      ) : (
        <button className="primary" onClick={publish} disabled={fatal}>
          Publish
        </button>
      )}
    </>
  );

  return (
    <div className={`editor${compact ? " is-compact" : ""}`}>
      <header className="editor-bar">
        {compact ? (
          <>
            <div className="row editor-bar-main">
              <Link href="/edit" className="quiet-link">
                ← seasons
              </Link>
              <strong className="editor-title">{doc.title || "untitled"}</strong>
              {saveStatus}
            </div>
            <div className="row editor-bar-actions">
              {historyControls}
              {layoutControls}
              {publishControls}
            </div>
          </>
        ) : (
            <>
              <div className="row">
                <Link href="/edit" className="quiet-link">
                  ← seasons
                </Link>
                <strong className="editor-title">{doc.title || "untitled"}</strong>
                {layoutControls}
                {saveStatus}
              </div>
              <div className="row">
                {historyControls}
                {publishControls}
              </div>
            </>
        )}
      </header>

      <aside className={`editor-tools${sheet === "tools" ? " is-open" : ""}`} aria-label="Add">
        {sheetHead("Add")}
        <Tools
          onFiles={(files) => void uploadFiles(files)}
          onQuote={() => addQuote()}
          onTitle={() => addQuote("", "title")}
          onSubtitle={() => addQuote("", "subtitle")}
          onPlaylist={addPlaylist}
          onSticker={addSticker}
          onMap={addMap}
          onShape={addShape}
          onRecording={(blob) => void addVoiceNote(blob)}
          onRoute={(file) => void addRoute(file)}
          onRouteStart={startRoute}
          onModel={(file, textureSize) => void addModel(file, textureSize)}
          playlistUrl={playlistUrl}
          setPlaylistUrl={setPlaylistUrl}
          setNotice={setNotice}
          mediaBase={mediaBase}
        />
        {!compact || sheet === "tools" ? messages : null}
      </aside>

      <div
        className="editor-stage"
        ref={stageWrapRef}
        onTouchStart={() => {
          lastTouch.current = Date.now();
        }}
        onMouseDown={(e) => {
          // Moveable's handles live inside the stage; clicks on them keep the selection.
          if (!(e.target as HTMLElement).closest(".moveable-control-box")) setSelectedId(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files);
          const canvas = (e.currentTarget.querySelector(".canvas") as HTMLElement).getBoundingClientRect();
          void uploadFiles(files, convertPoint({ x: (e.clientX - canvas.left) / scale, y: (e.clientY - canvas.top) / scale }, layout, "desktop"));
        }}
      >
        <div
          ref={canvasRef}
          className="canvas editor-canvas"
          style={{ width: stageWidth, aspectRatio: `${canvasWidth} / ${canvasHeight}`, background: doc.background.value }}
        >
          {doc.backgroundLayer ? (
            <BackgroundLayer
              layer={doc.backgroundLayer}
              mediaBase={mediaBase}
              live={false}
              poster={doc.backgroundLayer.kind === "model" ? modelPoster(mediaBase, doc.backgroundLayer.model) : null}
              onSketchError={setSketchError}
            />
          ) : null}
          {sorted.map(({ item, p }) => (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              data-item-id={item.id}
              className={`item item-${item.type}${isSelected(item.id) ? " is-selected" : ""}${p.locked ? " is-locked" : ""}${item.id === cropId ? " is-cropping" : ""}`}
              style={{ ...placementStyle(p, canvasHeight, canvasWidth), ...(item.id === cropId ? { zIndex: 100002 } : null) }}
              onDoubleClick={() => {
                if (canCrop(item) && !p.locked) {
                  setSelectedId(item.id);
                  setCropId(item.id);
                }
              }}
              // A mouse selects and drags in one press. A finger first taps to select,
              // so that swiping across the page scrolls it; then it drags the selected item.
              onMouseDown={(e) => {
                if (fromTouch()) e.stopPropagation();
                else onItemPress(item, e);
              }}
              onTouchStart={(e) => {
                lastTouch.current = Date.now();
                if (isSelected(item.id) || item.id === cropId) onItemPress(item, e);
              }}
              onClick={() => {
                if (fromTouch() && item.id !== selectedId) setSelectedId(item.id);
              }}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((h) => (h === item.id ? null : h))}
            >
              <ItemContent item={item} doc={doc} mediaBase={mediaBase} interactive={false} layout={layout} placement={p} cropping={item.id === cropId} />
              {item.type === "photo" && !item.content.alt ? <span className="badge badge-warn">no alt text</span> : null}
              {p.locked && item.id === selectedId ? <span className="badge">locked</span> : null}
              {item.type === "photo" && item.content.parallax && item.content.fit === "cover" ? (
                <span className="badge" style={{ left: "auto", right: 4 }} title="Fixed background on the page; see Preview">
                  parallax
                </span>
              ) : null}
            </div>
          ))}
          {alt && selectedPlacement && !grouped ? (
            <MeasureOverlay
              m={measure(
                selectedPlacement,
                { width: canvasWidth, height: pageEnd },
                (() => {
                  const hovered = hoveredId && hoveredId !== selectedId ? doc.items.find((i) => i.id === hoveredId) : null;
                  return hovered ? placementOf(hovered, layout) : null;
                })(),
              )}
              width={canvasWidth}
              height={canvasHeight}
              scale={scale}
            />
          ) : null}
          <div className="page-end" style={{ top: `${(pageEnd / canvasHeight) * 100}%` }} aria-hidden>
            <span>end of page · drag items below to make it longer</span>
          </div>
        </div>
        <div className="canvas-height-label muted small">
          {layout} page {canvasWidth} × {pageEnd}, grows to fit
        </div>
        <Moveable
          ref={moveableRef}
          target={target}
          draggable={!locked}
          resizable={!locked}
          rotatable={!locked && selected?.type !== "route"}
          keepRatio={shift}
          throttleRotate={shift ? 15 : 0}
          rotationPosition="top"
          origin={false}
          // Side handles stretch one way only, which text boxes need, on touch screens too.
          renderDirections={locked ? [] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
          // Fingers need a bigger target than the drawn handle.
          controlPadding={coarse ? 14 : 0}
          displayAroundControls={coarse}
          snappable={snapOn && !snapSkip}
          snapContainer={canvasRef}
          snapThreshold={6}
          snapDirections={SNAP_DIRECTIONS}
          elementSnapDirections={SNAP_DIRECTIONS}
          // Page edges and center, and the end of the page.
          verticalGuidelines={[0, stageWidth / 2, stageWidth]}
          horizontalGuidelines={[0, pageEnd * scale]}
          elementGuidelines={sorted.filter(({ item }) => item.id !== selectedId).map(({ item }) => itemRefs.current.get(item.id)).filter((el): el is HTMLDivElement => !!el)}
          isDisplaySnapDigit={false}
          isDisplayInnerSnapDigit={false}
          onDragStart={startGesture}
          onDrag={(e) => {
            // Write the DOM at once so Moveable's next measurement matches; React state follows.
            e.target.style.left = `${e.left}px`;
            e.target.style.top = `${e.top}px`;
            live({ x: e.left / scale, y: e.top / scale });
          }}
          onDragEnd={(e) => endGesture(e.isDrag)}
          onResizeStart={startGesture}
          onResize={(e) => {
            e.target.style.width = `${e.width}px`;
            e.target.style.height = `${e.height}px`;
            e.target.style.left = `${e.drag.left}px`;
            e.target.style.top = `${e.drag.top}px`;
            live({ w: e.width / scale, h: e.height / scale, x: e.drag.left / scale, y: e.drag.top / scale });
          }}
          onResizeEnd={() => endGesture()}
          onRotateStart={startGesture}
          onRotate={(e) => {
            e.target.style.transform = `rotate(${e.rotation}deg)`;
            live({ rotation: e.rotation });
          }}
          onRotateEnd={() => endGesture()}
        />
      </div>

      <aside className={`editor-inspector${sheet === "inspector" ? " is-open" : ""}`} aria-label={grouped ? "Items" : selected ? "Item" : "Season settings"}>
        {sheetHead(grouped ? "Items" : selected ? "Item" : "Season settings")}
        {grouped ? (
          <div className="stack">
            <p className="tools-heading">{groupIds.length} items selected</p>
            <span className="small muted">Drag any of them, or use the arrow keys, to move them together. Shift-click an item to add it or take it out. Click one without dragging to select just that one.</span>
            <div className="row">
              <button onClick={() => setSelectedId(null)}>Deselect</button>
              <button className="error" onClick={removeGroup}>
                Delete {groupIds.length} items
              </button>
            </div>
          </div>
        ) : (
        <Inspector
          id={id}
          doc={doc}
          item={selected}
          slug={slug}
          onSlugChange={(next: string) => {
            setSlug(next);
            setSlugAuto(false);
          }}
          slugAuto={slugAuto && status === "draft"}
          change={change}
          updateItem={updateSelected}
          layer={layer}
          duplicate={duplicate}
          remove={remove}
          mediaBase={mediaBase}
          layout={layout}
          cropping={!!selectedId && cropId === selectedId}
          setCropping={(on) => setCropId(on ? selectedId : null)}
          sortOrder={sortOrder}
          onSortOrderChange={setSortOrder}
          select={setSelectedId}
          setMobileVisible={(itemId, visible) => change((d) => setMobileVisible(d, itemId, visible))}
          addBackgroundModel={(file, textureSize) => void addModel(file, textureSize, "background")}
          setModelContent={setModelContent}
          redrawPoster={(target, content) => void drawPoster(target, content, true)}
          scatter={(s: Scatter) => change((d) => scatterLayout(d, layout, s))}
          sketchError={sketchError}
          clearSketchError={() => setSketchError(null)}
          resetMobile={(kind) => {
            const what = kind === "scaled" ? "the desktop layout scaled down" : "a single column";
            if (!confirm(`Replace the whole mobile layout with ${what}?`)) return;
            change((d) => (kind === "scaled" ? scaledMobileLayout(d) : singleColumnMobileLayout(d)));
          }}
        />
        )}
      </aside>

      {compact ? (
        <>
          {hasMessages && !sheet ? <div className="editor-toasts">{messages}</div> : null}
          {sheet ? <div className="sheet-backdrop" onClick={() => setSheet(null)} aria-hidden /> : null}
          <nav className="editor-dock" aria-label="Editor">
            <button className={sheet === "tools" ? "primary" : ""} aria-pressed={sheet === "tools"} onClick={() => setSheet((s) => (s === "tools" ? null : "tools"))}>
              + Add
            </button>
            <button className={sheet === "inspector" ? "primary" : ""} aria-pressed={sheet === "inspector"} onClick={() => setSheet((s) => (s === "inspector" ? null : "inspector"))}>
              {selected ? "Edit item" : "Season"}
            </button>
            {selected ? (
              <button className="quiet" onClick={() => setSelectedId(null)}>
                Deselect
              </button>
            ) : null}
          </nav>
        </>
      ) : null}
    </div>
  );
}
