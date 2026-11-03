import "server-only";
import { revalidatePath } from "next/cache";

/** Refreshes the cached public page for one slug. Paths exclude the /seasons base path. */
export function refreshPublicPage(...slugs: string[]) {
  for (const slug of slugs) revalidatePath(`/${slug}`);
  revalidatePath("/");
}
