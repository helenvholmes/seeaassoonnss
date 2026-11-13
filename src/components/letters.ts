// Shared by the motion layer and the quote view.

/** How far (design units) an item with follow 1 drifts toward the cursor. */
export const FOLLOW_DISTANCE = 40;
/** Generative type moves at most this many letters per quote; longer quotes stay still. */
export const MAX_EFFECT_LETTERS = 1500;

/**
 * Wraps each letter under `root` in its own inline-block span so it can move on
 * its own. Words are wrapped in no-break spans, so lines still break only between
 * words. Runs once per element. Returns the letter spans (none if there are more
 * than `max` letters: the text is left as it is).
 */
export function splitLetters(root: HTMLElement, max: number): HTMLElement[] {
  if (root.dataset.split === "1") return Array.from(root.querySelectorAll<HTMLElement>(".fx-letter"));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  let count = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    texts.push(n as Text);
    count += (n.textContent ?? "").replace(/\s/g, "").length;
  }
  if (count > max) return [];
  const letters: HTMLElement[] = [];
  for (const text of texts) {
    const frag = document.createDocumentFragment();
    for (const part of (text.textContent ?? "").split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        frag.append(part);
        continue;
      }
      const word = document.createElement("span");
      word.className = "fx-word";
      for (const ch of Array.from(part)) {
        const span = document.createElement("span");
        span.className = "fx-letter";
        span.textContent = ch;
        word.append(span);
        letters.push(span);
      }
      frag.append(word);
    }
    text.replaceWith(frag);
  }
  root.dataset.split = "1";
  return letters;
}
