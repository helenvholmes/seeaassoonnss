// The season document: everything on one season page, stored as one JSON value.
// Shared by the editor (client), the API (validation) and the public page (rendering).
import { z } from "zod";

export const DESKTOP_WIDTH = 1440;
export const MOBILE_WIDTH = 390;
/** The canvas never shows larger than this, so 2048 px images stay sharp. */
export const MAX_SCALE = 1.25;
export const IMAGE_WIDTHS = [640, 1280, 2048] as const;
export const DEFAULT_BACKGROUND = "#fbfbf9";

const num = z.number().finite();

export const placementSchema = z.object({
  x: num,
  y: num,
  w: num.positive(),
  h: num.positive(),
  rotation: num,
  z: z.number().int(),
  locked: z.boolean(),
});
export type Placement = z.infer<typeof placementSchema>;

const base = {
  id: z.string().uuid(),
  desktop: placementSchema,
  // Empty = not shown on mobile. The mobile layout arrives in phase 2.
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

export const itemSchema = z.discriminatedUnion("type", [photoSchema, quoteSchema, playlistSchema]);
export type Item = z.infer<typeof itemSchema>;
export type PhotoItem = z.infer<typeof photoSchema>;
export type QuoteItem = z.infer<typeof quoteSchema>;
export type PlaylistItem = z.infer<typeof playlistSchema>;
export type ItemType = Item["type"];

export const seasonDocSchema = z.object({
  title: z.string().max(200),
  subtitle: z.string().max(2000),
  period: z.string().max(200),
  coverItemId: z.string().uuid().nullable(),
  background: z.object({ type: z.literal("color"), value: z.string().regex(/^#[0-9a-f]{6}$/i) }),
  desktopHeight: num.min(200).max(40000),
  mobileHeight: num.min(200).max(40000),
  items: z.array(itemSchema).max(500),
});
export type SeasonDoc = z.infer<typeof seasonDocSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths used by the app itself, so no season can take them. */
export const RESERVED_SLUGS = new Set(["edit", "api", "local-media", "_next"]);

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
    background: { type: "color", value: DEFAULT_BACKGROUND },
    desktopHeight: 1800,
    mobileHeight: 2400,
    items: [],
  };
}
