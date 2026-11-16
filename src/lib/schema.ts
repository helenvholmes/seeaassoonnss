// The season document: everything on one season page, stored as one JSON value.
// Shared by the editor (client), the API (validation) and the public page (rendering).
import { z } from "zod";

export const DESKTOP_WIDTH = 1440;
export const MOBILE_WIDTH = 390;
/** The canvas never shows larger than this, so 2048 px images stay sharp. */
export const MAX_SCALE = 1.25;
export const IMAGE_WIDTHS = [640, 1280, 2048] as const;
/** Screens narrower than this show the mobile layout. */
export const MOBILE_BREAKPOINT = 960;
export const DEFAULT_BACKGROUND = "#fbfbf9";
/** Not a design limit, only a guard against absurd values. */
export const MAX_CANVAS_HEIGHT = 10_000_000;
export const MAX_CROP_ZOOM = 8;
export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

const num = z.number().finite();

export const placementSchema = z.object({
  x: num,
  y: num,
  w: num.positive(),
  h: num.positive(),
  rotation: num,
  z: z.number().int(),
  locked: z.boolean(),
  /**
   * Quote text size in this canvas's design units. Used by the mobile layout, where
   * text usually needs a different size than the desktop size in the item content.
   */
  textSize: num.positive().max(400).optional(),
});
export type Placement = z.infer<typeof placementSchema>;

/** Ties an item to a stop on a route map: when it scrolls into view, the map moves there. */
export const routeStopSchema = z.object({ routeId: z.string().uuid(), index: z.number().int().min(0) });
export type RouteStopLink = z.infer<typeof routeStopSchema>;

/** Most 3D model items one season may hold: each one is a WebGL context, and browsers allow about 16. */
export const MAX_MODEL_ITEMS = 6;
/** Above this size (bytes, after compression) the editor warns that a 3D model will be slow on phones. */
export const MODEL_WARN_BYTES = 5 * 1024 * 1024;
/** Largest p5.js sketch, in characters. */
export const MAX_SKETCH_CODE = 200_000;

const base = {
  id: z.string().uuid(),
  routeStop: routeStopSchema.nullable().optional(),
  /**
   * Cursor follow, 0 to 1: the item drifts toward the cursor by up to
   * FOLLOW_DISTANCE design units times this. On touch screens it moves with scroll.
   */
  follow: num.min(0).max(1).optional(),
  desktop: placementSchema,
  // Empty = not shown on mobile (once the season has a mobile layout).
  mobile: placementSchema.nullable(),
};

export const cropSchema = z.object({ x: num.min(0).max(1), y: num.min(0).max(1), zoom: num.min(1).max(MAX_CROP_ZOOM) });
export type Crop = z.infer<typeof cropSchema>;

export const photoSchema = z.object({
  ...base,
  type: z.literal("photo"),
  content: z.object({
    mediaId: z.string().uuid(),
    /** Original pixel size; the aspect ratio comes from these. */
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    /** Widths that exist in storage, smallest first. */
    widths: z.array(z.number().int().positive()).min(1),
    alt: z.string().max(1000),
    /** cover = crop to fill the box; contain = show the whole image. */
    fit: z.enum(["cover", "contain"]),
    /**
     * Which part of the photo shows when it fills its box (fit "cover"), as in
     * Figma's crop. zoom ≥ 1 enlarges it; x and y (0 to 1) choose the part shown:
     * 0 = left/top edge, 1 = right/bottom edge. Works for any box shape, so the
     * desktop and mobile layouts share it. Empty = centered, no zoom.
     */
    crop: cropSchema.nullable().optional(),
    /**
     * Background-image parallax (fit "cover" only): on the public page the photo
     * covers the screen and stays fixed while the page scrolls, so the box shows it
     * like a window, with a slight drift. The crop then applies to that screen-sized
     * photo. Empty = off.
     */
    parallax: z.boolean().optional(),
  }),
});

export const QUOTE_FONTS = ["serif", "mono", "sans"] as const;
/**
 * Generative type. repel: letters move away from the cursor. wave: letters ripple
 * as the page scrolls. gather: letters start scattered and come together as the
 * quote reaches the middle of the screen. typewriter: letters appear one at a time,
 * behind a blinking caret, the first time the quote scrolls into view.
 */
export const QUOTE_EFFECTS = ["none", "repel", "wave", "gather", "typewriter"] as const;
export type QuoteEffect = (typeof QUOTE_EFFECTS)[number];

export const quoteSchema = z.object({
  ...base,
  type: z.literal("quote"),
  content: z.object({
    /** Markdown: bold, italic, links, line breaks. Raw HTML is never rendered. */
    markdown: z.string().max(10000),
    source: z.string().max(500),
    font: z.enum(QUOTE_FONTS),
    /** Font size in design units. */
    size: num.positive().max(400),
    align: z.enum(["left", "center", "right"]),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    /** Show the season title or subtitle instead of the markdown. */
    binding: z.enum(["title", "subtitle"]).nullable(),
    effect: z.enum(QUOTE_EFFECTS).optional(),
  }),
});

export const playlistSchema = z.object({
  ...base,
  type: z.literal("playlist"),
  content: z.object({
    url: z.string().url(),
    /** A playlist or a single song. Empty = playlist (seasons from before songs). */
    kind: z.enum(["playlist", "track"]).optional(),
    /** Spotify playlist or track id, used for the embed. */
    spotifyId: z.string().regex(/^[A-Za-z0-9]+$/),
    title: z.string().max(500),
    coverUrl: z.string().url().nullable(),
    caption: z.string().max(500),
  }),
});

export const videoSchema = z.object({
  ...base,
  type: z.literal("video"),
  content: z.object({
    /** The compressed MP4, stored as media/<mediaId>/video.mp4. */
    mediaId: z.string().uuid(),
    /** The poster frame, stored like a photo. */
    posterMediaId: z.string().uuid(),
    posterWidths: z.array(z.number().int().positive()).min(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    duration: num.nonnegative(),
    hasAudio: z.boolean(),
    /** Description for screen readers. */
    alt: z.string().max(1000),
    fit: z.enum(["cover", "contain"]),
  }),
});

export const stickerSchema = z.object({
  ...base,
  type: z.literal("sticker"),
  content: z.object({
    /** The sticker library entry this came from. */
    stickerId: z.string().uuid(),
    /** Copied from the library, so the page needs no lookup and survives library deletes. */
    mediaId: z.string().uuid(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    widths: z.array(z.number().int().positive()).min(1),
    alt: z.string().max(1000),
  }),
});

export const MAP_ZOOM_MIN = 0;
export const MAP_ZOOM_MAX = 12;

export const mapSchema = z.object({
  ...base,
  type: z.literal("map"),
  content: z.object({
    lat: num.min(-85).max(85),
    lon: num.min(-180).max(180),
    /** 0 = the whole world; each step doubles the scale. */
    zoom: num.min(MAP_ZOOM_MIN).max(MAP_ZOOM_MAX),
    label: z.string().max(200),
    borders: z.boolean(),
    /** Turns the map this many degrees counterclockwise around the place (0 = north up). */
    angle: num.min(-180).max(180).optional(),
  }),
});

export const voiceNoteSchema = z.object({
  ...base,
  type: z.literal("voice_note"),
  content: z.object({
    /** MP3, stored as media/<mediaId>/audio.mp3. */
    mediaId: z.string().uuid(),
    duration: num.nonnegative(),
    caption: z.string().max(500),
    /** Peak levels 0–1 for drawing the waveform. */
    waveform: z.array(num.min(0).max(1)).max(200),
  }),
});

export const ROUTE_MAX_STOPS = 500;
export const ROUTE_MAX_LINE_POINTS = 5000;
const lonLat = z.tuple([num.min(-180).max(180), num.min(-85).max(85)]);

/**
 * A scroll-driven route map. The item's box is a band of the canvas: while the
 * reader scrolls through it, the map stays fixed on screen and the route draws in.
 */
export const routeSchema = z.object({
  ...base,
  type: z.literal("route"),
  content: z.object({
    /** Ordered places along the route. */
    stops: z
      .array(z.object({ name: z.string().max(200), lat: num.min(-85).max(85), lon: num.min(-180).max(180) }))
      .min(1)
      .max(ROUTE_MAX_STOPS),
    /** The drawn path as [lon, lat] pairs. Empty: straight (great-circle) lines between stops. */
    line: z.array(lonLat).max(ROUTE_MAX_LINE_POINTS),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    borders: z.boolean(),
    /** How far the map zooms in on a stop when an item linked to it is in view. */
    stepZoom: num.min(1).max(16),
    /** "map" (default): land, stops and the line. "line": only the line, on the page's own background. */
    style: z.enum(["map", "line"]).optional(),
    /** Place names along the line, each appearing when the line reaches it. */
    labels: z.boolean().optional(),
    /** Turns the map this many degrees counterclockwise (0 = north up). */
    angle: num.min(-180).max(180).optional(),
    /** Line thickness in screen pixels (default 3.5). */
    lineWidth: num.min(1).max(24).optional(),
    /** Line-only style: "faint" (default) shows the route ahead as a grey dashed line with grey stops and names; "hidden" draws in from nothing. */
    ahead: z.enum(["faint", "hidden"]).optional(),
    /** What the saved line was last made to follow, so the editor can offer to redo it the same way. */
    follow: z.enum(["roads", "rail"]).optional(),
  }),
});

/** Simple shapes, drawn as SVG that stretches to fill the item's box. */
export const SHAPES = ["square", "rounded", "circle", "triangle", "diamond", "pentagon", "hexagon", "star", "heart", "arrow"] as const;
export type ShapeKind = (typeof SHAPES)[number];
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const shapeSchema = z.object({
  ...base,
  type: z.literal("shape"),
  content: z.object({
    shape: z.enum(SHAPES),
    /** Fill color; null = no fill (outline only). */
    fill: hexColor.nullable(),
    stroke: hexColor,
    /** Outline width in design units; 0 = no outline. */
    strokeWidth: num.min(0).max(60),
  }),
});

/** How a 3D model is shown: shared by model items and a 3D season background. */
export const modelContentSchema = z.object({
  /** The processed model, stored as media/<mediaId>/model.glb. */
  mediaId: z.string().uuid(),
  /** A still of the model, stored like a photo. Shown before the model loads and when WebGL is missing. */
  posterMediaId: z.string().uuid().nullable(),
  posterWidths: z.array(z.number().int().positive()),
  /** Size of model.glb in bytes. */
  bytes: z.number().int().nonnegative(),
  /** 1 = the model just fills its box. */
  scale: num.min(0.05).max(10),
  /** Turn of the model in degrees, around its x, y and z axes. */
  rotation: z.tuple([num, num, num]),
  /** Slow turn around the vertical axis, degrees per second (0 = still). */
  spin: num.min(-360).max(360),
  /** Turns toward the cursor (with scroll on touch screens). */
  follow: z.boolean(),
  /** Plays the model's first animation, if it has one. */
  animate: z.boolean(),
  hasAnimation: z.boolean(),
  /** Description for screen readers. */
  alt: z.string().max(1000),
});
export type ModelContent = z.infer<typeof modelContentSchema>;

export const modelSchema = z.object({
  ...base,
  type: z.literal("model_3d"),
  content: modelContentSchema,
});

export const itemSchema = z.discriminatedUnion("type", [photoSchema, quoteSchema, playlistSchema, videoSchema, stickerSchema, mapSchema, voiceNoteSchema, routeSchema, modelSchema, shapeSchema]);
export type Item = z.infer<typeof itemSchema>;
export type PhotoItem = z.infer<typeof photoSchema>;
export type QuoteItem = z.infer<typeof quoteSchema>;
export type PlaylistItem = z.infer<typeof playlistSchema>;
export type VideoItem = z.infer<typeof videoSchema>;
export type StickerItem = z.infer<typeof stickerSchema>;
export type MapItem = z.infer<typeof mapSchema>;
export type VoiceNoteItem = z.infer<typeof voiceNoteSchema>;
export type RouteItem = z.infer<typeof routeSchema>;
export type ModelItem = z.infer<typeof modelSchema>;
export type ShapeItem = z.infer<typeof shapeSchema>;
export type RouteContent = RouteItem["content"];
export type ItemType = Item["type"];

/**
 * Something behind all items, filling the screen while the page scrolls: one 3D
 * model, or a p5.js sketch. The season keeps its own copy of the sketch code, so
 * the page only changes on Publish.
 */
export const backgroundLayerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("model"), model: modelContentSchema }),
  z.object({
    kind: z.literal("sketch"),
    /** The library entry it came from (empty if written here). */
    sketchId: z.string().uuid().nullable(),
    name: z.string().max(200),
    code: z.string().max(MAX_SKETCH_CODE),
  }),
]);
export type BackgroundLayer = z.infer<typeof backgroundLayerSchema>;

/** Seeded random placement: the same seed always gives the same layout. */
export const scatterSchema = z.object({
  seed: z.number().int().min(0).max(2 ** 31 - 1),
  /** Random scale range for photos, videos, stickers and 3D models. */
  minScale: num.min(0.1).max(5),
  maxScale: num.min(0.1).max(5),
});
export type Scatter = z.infer<typeof scatterSchema>;
export const DEFAULT_SCATTER: Scatter = { seed: 1, minScale: 0.7, maxScale: 1.3 };

export const seasonDocSchema = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(2000),
  period: z.string().max(200),
  coverItemId: z.string().uuid().nullable(),
  background: z.object({ type: z.literal("color"), value: z.string().regex(/^#[0-9a-f]{6}$/i) }),
  /** One 3D model or p5.js sketch behind all items, at most. */
  backgroundLayer: backgroundLayerSchema.nullable().default(null),
  scatter: scatterSchema.default(DEFAULT_SCATTER),
  /** Optional month the season belongs to, "YYYY-MM". Orders the index. */
  month: z.string().regex(MONTH_PATTERN).nullable().default(null),
  /**
   * Minimum canvas heights. The page always grows to fit its lowest item (see
   * lib/layout.ts), so these only add empty space; there is no upper limit.
   */
  desktopHeight: num.min(200).max(MAX_CANVAS_HEIGHT),
  mobileHeight: num.min(200).max(MAX_CANVAS_HEIGHT),
  /**
   * False for seasons from before the mobile layout existed. Their items have no
   * mobile placement yet, and the page uses the scaled-down desktop layout.
   */
  mobileLayout: z.boolean().default(false),
  /**
   * The editor rebuilds the mobile layout from desktop after every change (see
   * autoMobileLayout in components/editor/ops.ts). Arranging anything on mobile by
   * hand turns it off (false). Empty, for seasons from before it existed, counts as
   * on: the editor switches it on when the season is next opened.
   */
  mobileAuto: z.boolean().optional(),
  items: z
    .array(itemSchema)
    .max(500)
    .refine((items) => items.filter((i) => i.type === "model_3d").length <= MAX_MODEL_ITEMS, `A season can hold at most ${MAX_MODEL_ITEMS} 3D models.`),
});
export type SeasonDoc = z.infer<typeof seasonDocSchema>;

export type Layout = "desktop" | "mobile";
export const CANVAS_WIDTH: Record<Layout, number> = { desktop: DESKTOP_WIDTH, mobile: MOBILE_WIDTH };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths used by the app itself, so no season can take them. */
export const RESERVED_SLUGS = new Set(["about", "edit", "api", "local-media", "map", "vendor", "_next"]);

export function slugProblem(slug: string): string | null {
  if (!slug) return "Slug is empty.";
  if (slug.length > 80) return "Slug is longer than 80 characters.";
  if (!SLUG_PATTERN.test(slug)) return "Use lowercase letters, numbers and single hyphens.";
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved.`;
  return null;
}

/** The slug a title gives: its slugified form, or "season" when nothing is left. */
export function titleSlug(title: string): string {
  return slugify(title) || "season";
}

/**
 * Whether a slug looks made from the title rather than chosen by hand: the
 * title's slug, that slug with a number added (when it was taken), or the
 * slug of a new, untitled season.
 */
export function slugFollowsTitle(slug: string, title: string): boolean {
  const base = titleSlug(title);
  const auto = (b: string) => slug === b || (slug.startsWith(`${b}-`) && /^\d+$/.test(slug.slice(b.length + 1)));
  return auto(base) || auto("untitled-season") || auto("season");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function emptySeasonDoc(title: string): SeasonDoc {
  return {
    title,
    subtitle: "",
    period: "",
    coverItemId: null,
    month: null,
    background: { type: "color", value: DEFAULT_BACKGROUND },
    backgroundLayer: null,
    scatter: DEFAULT_SCATTER,
    desktopHeight: 900,
    mobileHeight: Math.round(900 * (MOBILE_WIDTH / DESKTOP_WIDTH)),
    mobileLayout: true,
    mobileAuto: true,
    items: [],
  };
}
