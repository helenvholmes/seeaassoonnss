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

const base = {
  id: z.string().uuid(),
  desktop: placementSchema,
  // Empty = not shown on mobile (once the season has a mobile layout).
  mobile: placementSchema.nullable(),
};

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
  }),
});

export const QUOTE_FONTS = ["serif", "mono", "sans"] as const;

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
  }),
});

export const playlistSchema = z.object({
  ...base,
  type: z.literal("playlist"),
  content: z.object({
    url: z.string().url(),
    /** Spotify playlist id, used for the embed. */
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

export const itemSchema = z.discriminatedUnion("type", [photoSchema, quoteSchema, playlistSchema, videoSchema, stickerSchema, mapSchema, voiceNoteSchema]);
export type Item = z.infer<typeof itemSchema>;
export type PhotoItem = z.infer<typeof photoSchema>;
export type QuoteItem = z.infer<typeof quoteSchema>;
export type PlaylistItem = z.infer<typeof playlistSchema>;
export type VideoItem = z.infer<typeof videoSchema>;
export type StickerItem = z.infer<typeof stickerSchema>;
export type MapItem = z.infer<typeof mapSchema>;
export type VoiceNoteItem = z.infer<typeof voiceNoteSchema>;
export type ItemType = Item["type"];

export const seasonDocSchema = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(2000),
  period: z.string().max(200),
  coverItemId: z.string().uuid().nullable(),
  background: z.object({ type: z.literal("color"), value: z.string().regex(/^#[0-9a-f]{6}$/i) }),
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
  items: z.array(itemSchema).max(500),
});
export type SeasonDoc = z.infer<typeof seasonDocSchema>;

export type Layout = "desktop" | "mobile";
export const CANVAS_WIDTH: Record<Layout, number> = { desktop: DESKTOP_WIDTH, mobile: MOBILE_WIDTH };

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths used by the app itself, so no season can take them. */
export const RESERVED_SLUGS = new Set(["edit", "api", "local-media", "map", "_next"]);

export function slugProblem(slug: string): string | null {
  if (!slug) return "Slug is empty.";
  if (slug.length > 80) return "Slug is longer than 80 characters.";
  if (!SLUG_PATTERN.test(slug)) return "Use lowercase letters, numbers and single hyphens.";
  if (RESERVED_SLUGS.has(slug)) return `"${slug}" is reserved.`;
  return null;
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
    desktopHeight: 900,
    mobileHeight: Math.round(900 * (MOBILE_WIDTH / DESKTOP_WIDTH)),
    mobileLayout: true,
    items: [],
  };
}
