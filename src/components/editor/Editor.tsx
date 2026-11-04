"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Moveable from "react-moveable";
import { api, BASE_PATH } from "@/lib/client";
import { CANVAS_WIDTH, DESKTOP_WIDTH, type Crop, type Item, type Layout, type PhotoItem, type Placement, type SeasonDoc } from "@/lib/schema";
import { NO_CROP, panCrop, photoRect, zoomCrop } from "@/lib/crop";
import { pageHeight } from "@/lib/layout";
import { placementStyle } from "../geometry";
import { ItemContent } from "../ItemContent";
import { commit, commitGesture, createHistory, redo, replace, undo, type History } from "./history";
import { Inspector } from "./Inspector";
import {
  addItem,
  convertPoint,
  duplicateItem,
  moveLayer,
  placementOf,
  removeItem,
  roundPlacement,
  scaledMobileLayout,
  setMobileVisible,
  setPlacement,
  singleColumnMobileLayout,
  updateItem,
  withMobileLayout,
  MOBILE_FACTOR,
  type LayerMove,
} from "./ops";
import { parseRouteGeoJSON } from "@/lib/route";
import { isAcceptedImage, isAcceptedVideo, isAudio, rejectionReason, uploadAudio, uploadImage, uploadVideo, type StickerEntry } from "./upload";
import { Tools } from "./Tools";
import { measure, refineSnap } from "./measure";
import { MeasureOverlay } from "./MeasureOverlay";
import type { Place } from "@/lib/geo";
import { parsePlaylistId } from "@/lib/spotify";

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

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function Editor(props: EditorProps) {
  const { id, mediaBase } = props;
  const [history, setHistory] = useState<History<SeasonDoc>>(() => createHistory(withMobileLayout(props.initialDoc)));
  const doc = history.present;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [slug, setSlug] = useState(props.initialSlug);
  const [status, setStatus] = useState(props.initialStatus);
  const [published, setPublished] = useState<SeasonDoc | null>(props.initialPublished);
  const [save, setSave] = useState<SaveState>({ kind: "saved" });
  const [notice, setNotice] = useState<string | null>(null);
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

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const moveableRef = useRef<Moveable>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const gestureStart = useRef<SeasonDoc | null>(null);

  const canvasWidth = CANVAS_WIDTH[layout];
  // The page grows to fit its lowest item. Below the end of the page the editor
  // keeps empty working room; dragging an item there makes the page longer.
  const pageEnd = pageHeight(doc, layout);
  const canvasHeight = pageEnd + (layout === "desktop" ? 900 : 500);
  const scale = stageWidth / canvasWidth;
  const selected = doc.items.find((i) => i.id === selectedId) ?? null;
  const selectedPlacement = selected ? placementOf(selected, layout) : null;

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
    const measure = () => setStageWidth(layout === "mobile" ? Math.min(520, Math.max(320, el.clientWidth - 64)) : Math.max(320, el.clientWidth - 64));
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
    if (!parsePlaylistId(url)) {
      setNotice("That is not a Spotify playlist link.");
      return;
    }
    try {
      const info = await api<{ url: string; spotifyId: string; title: string; coverUrl: string | null }>("/spotify", { body: { url } });
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

  const addSticker = (s: StickerEntry) => {
    const w = 200;
    addAndSelect({
      id: crypto.randomUUID(),
      type: "sticker",
      desktop: place(w, Math.round((w * s.height) / s.width)),
      mobile: null,
      content: { stickerId: s.id, mediaId: s.mediaId, width: s.width, height: s.height, widths: s.widths, alt: "" },
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

  const addMap = (p: Place) => {
    addAndSelect({
      id: crypto.randomUUID(),
      type: "map",
      desktop: place(320, 320),
      mobile: null,
      content: { lat: p.lat, lon: p.lon, zoom: 5, label: p.label, borders: true },
    });
  };

  /** Photos (3 at a time), videos (one at a time; compression is heavy) and audio files. */
  const uploadFiles = async (files: File[], at?: { x: number; y: number }) => {
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
        duplicate();
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
      if (parsePlaylistId(text)) void addPlaylist(text);
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
  const target = selected && selectedPlacement && cropId !== selected.id ? itemRefs.current.get(selected.id) ?? null : null;
  const locked = !!selectedPlacement?.locked;
  const live = (patch: Partial<Placement>) => {
    if (!selectedId) return;
    setHistory((h) => replace(h, setPlacement(h.present, selectedId, patch, layout)));
  };
  const startGesture = () => {
    gestureStart.current = latestDoc.current;
  };
  const endGesture = (moved = false) => {
    const before = gestureStart.current;
    gestureStart.current = null;
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

  /** Drag inside a photo in crop mode: the photo follows the pointer. */
  const startCropPan = (item: Item, e: React.MouseEvent) => {
    const p = placementOf(item, layout);
    if (!p || item.type !== "photo") return;
    const startCrop = item.content.crop ?? NO_CROP;
    const rect = photoRect(item.content.width, item.content.height, p.w, p.h, startCrop);
    const before = latestDoc.current;
    const rad = (-p.rotation * Math.PI) / 180;
    const sx = e.clientX;
    const sy = e.clientY;
    const move = (ev: MouseEvent) => {
      // Pointer movement in the photo's own (unrotated) frame, as fractions of its box.
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const lx = (dx * Math.cos(rad) - dy * Math.sin(rad)) / (p.w * scale);
      const ly = (dx * Math.sin(rad) + dy * Math.cos(rad)) / (p.h * scale);
      setCrop(item.id, panCrop(startCrop, rect, lx, ly), null, true);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setHistory((h) => commitGesture(h, before));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
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

  const onItemPress = (item: Item, e: React.MouseEvent | React.TouchEvent) => {
    if ("button" in e && e.button !== 0) return;
    e.stopPropagation();
    if (cropId === item.id && "clientX" in e) return startCropPan(item, e);
    if (selectedId !== item.id) flushSync(() => setSelectedId(item.id));
    if (!placementOf(item, layout)?.locked) moveableRef.current?.dragStart(e.nativeEvent);
  };

  const sorted = doc.items
    .map((item) => ({ item, p: placementOf(item, layout) }))
    .filter((x): x is { item: Item; p: Placement } => x.p !== null)
    .sort((a, b) => a.p.z - b.p.z);
  const saveLabel =
    save.kind === "saved" ? "saved" : save.kind === "saving" ? "saving…" : save.kind === "pending" ? "unsaved changes" : `not saved: ${save.message}`;

  return (
    <div className="editor">
      <header className="editor-bar">
        <div className="row">
          <Link href="/edit" className="quiet-link">
            ← seasons
          </Link>
          <strong>{doc.title || "untitled"}</strong>
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
          <span className={save.kind === "error" ? "error" : "muted"} role="status">
            {saveLabel}
          </span>
        </div>
        <div className="row">
          <button className="quiet" onClick={() => setHistory(undo)} disabled={!history.past.length} title="Undo (⌘Z)">
            Undo
          </button>
          <button className="quiet" onClick={() => setHistory(redo)} disabled={!history.future.length} title="Redo (⇧⌘Z)">
            Redo
          </button>
          <a className="button" href={`${BASE_PATH}/edit/${id}/preview?device=${layout === "mobile" ? "phone" : "laptop"}`} target="_blank" rel="noreferrer" onClick={() => void saveNow().catch(() => {})}>
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
        </div>
      </header>

      <aside className="editor-tools">
        <Tools
          onFiles={(files) => void uploadFiles(files)}
          onQuote={() => addQuote()}
          onTitle={() => addQuote("", "title")}
          onSubtitle={() => addQuote("", "subtitle")}
          onPlaylist={addPlaylist}
          onSticker={addSticker}
          onMap={addMap}
          onRecording={(blob) => void addVoiceNote(blob)}
          onRoute={(file) => void addRoute(file)}
          playlistUrl={playlistUrl}
          setPlaylistUrl={setPlaylistUrl}
          setNotice={setNotice}
          mediaBase={mediaBase}
        />
        {uploads.total > 0 && uploads.done < uploads.total ? (
          <p className="small" role="status">
            uploading {uploads.done + 1} of {uploads.total}…
          </p>
        ) : null}
        {videoProgress ? <p className="small">{videoProgress}</p> : null}
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
      </aside>

      <div
        className="editor-stage"
        ref={stageWrapRef}
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
          {sorted.map(({ item, p }) => (
            <div
              key={item.id}
              ref={(el) => {
                if (el) itemRefs.current.set(item.id, el);
                else itemRefs.current.delete(item.id);
              }}
              data-item-id={item.id}
              className={`item item-${item.type}${item.id === selectedId ? " is-selected" : ""}${p.locked ? " is-locked" : ""}${item.id === cropId ? " is-cropping" : ""}`}
              style={{ ...placementStyle(p, canvasHeight, canvasWidth), ...(item.id === cropId ? { zIndex: 100002 } : null) }}
              onDoubleClick={() => {
                if (canCrop(item) && !p.locked) {
                  setSelectedId(item.id);
                  setCropId(item.id);
                }
              }}
              onMouseDown={(e) => onItemPress(item, e)}
              onTouchStart={(e) => onItemPress(item, e)}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId((h) => (h === item.id ? null : h))}
            >
              <ItemContent item={item} doc={doc} mediaBase={mediaBase} interactive={false} layout={layout} placement={p} cropping={item.id === cropId} />
              {item.type === "photo" && !item.content.alt ? <span className="badge badge-warn">no alt text</span> : null}
              {p.locked && item.id === selectedId ? <span className="badge">locked</span> : null}
            </div>
          ))}
          {alt && selectedPlacement ? (
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
          renderDirections={locked ? [] : ["nw", "n", "ne", "w", "e", "sw", "s", "se"]}
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
          onDragEnd={() => endGesture(true)}
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

      <aside className="editor-inspector">
        <Inspector
          id={id}
          doc={doc}
          item={selected}
          slug={slug}
          onSlugChange={setSlug}
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
          resetMobile={(kind) => {
            const what = kind === "scaled" ? "the desktop layout scaled down" : "a single column";
            if (!confirm(`Replace the whole mobile layout with ${what}?`)) return;
            change((d) => (kind === "scaled" ? scaledMobileLayout(d) : singleColumnMobileLayout(d)));
          }}
        />
      </aside>
    </div>
  );
}
