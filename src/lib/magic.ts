/** Checks the start of a browser-made file, so only real MP4 / MP3 data is accepted. */
export function looksLike(kind: "video" | "audio", head: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (kind === "video") return head.length >= 12 && ascii(4, 8) === "ftyp";
  if (head.length < 3) return false;
  if (ascii(0, 3) === "ID3") return true;
  return head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
}
