import "server-only";
import type { Metadata } from "next";
import { imageUrl } from "@/components/ItemContent";
import { BASE_PATH, config } from "./config";
import { formatMonth } from "./layout";
import type { PhotoItem, SeasonDoc } from "./schema";

/** The season's cover photo: the chosen cover, or else the first photo. */
export function coverPhoto(doc: SeasonDoc): PhotoItem | null {
  const photos = doc.items.filter((i): i is PhotoItem => i.type === "photo");
  return photos.find((p) => p.id === doc.coverItemId) ?? photos[0] ?? null;
}

/** An absolute URL on the owner's site (share previews need absolute URLs). */
export function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, config.siteUrl).toString();
}

/** Markdown to plain text, for descriptions. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** "// leafy greens": the lowercase // title format, without doubling an existing //. */
export function slashTitle(title: string): string {
  const t = title.trim() || "untitled";
  return t.startsWith("//") ? t : `// ${t}`;
}

export function seasonMetadata(slug: string, doc: SeasonDoc, mediaBase: string): Metadata {
  const title = doc.title || "untitled";
  const description = [doc.period || formatMonth(doc.month), plainText(doc.subtitle)].filter(Boolean).join(" · ") || undefined;
  const url = absoluteUrl(`${BASE_PATH}/${slug}`);
  const cover = coverPhoto(doc);
  const width = cover ? [...cover.content.widths].reverse().find((w) => w <= 1280) ?? cover.content.widths[0] : 0;
  const images = cover
    ? [
        {
          url: absoluteUrl(imageUrl(mediaBase, cover.content.mediaId, width)),
          width,
          height: Math.round((width * cover.content.height) / cover.content.width),
          alt: cover.content.alt || title,
        },
      ]
    : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "article", siteName: "seeaassoonnss", title, description, url, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}
