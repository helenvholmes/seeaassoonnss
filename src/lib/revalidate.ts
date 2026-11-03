import "server-only";
import { revalidatePath, revalidateTag } from "next/cache";

export const INDEX_TAG = "seasons-index";

/** Refreshes the cached public page for each slug, and the index. Paths exclude the /seasons base path. */
export function refreshPublicPage(...slugs: string[]) {
  for (const slug of slugs) revalidatePath(`/${slug}`);
  revalidateTag(INDEX_TAG);
}
