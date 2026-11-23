import Link from "next/link";
import { BASE_PATH } from "@/lib/config";

// Shown for any address with nothing behind it: an unknown or unpublished season
// (notFound() in [slug]), an editor link to a deleted season, or a mistyped path.
// The title is a <title> element (React hoists it into <head>) rather than a
// `metadata` export, which Next.js ignores when a page calls notFound().
export default function NotFound() {
  return (
    <main className="owner not-found">
      <title>not here · seeaassoonnss</title>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="not-found-sticker"
        src={`${BASE_PATH}/sticker-packs/botanical/mushrooms.webp`}
        alt=""
        draggable={false}
        decoding="async"
      />
      <h1>// not here</h1>
      <p className="muted">There is no season at this address. It may have been unpublished, renamed or never existed.</p>
      <p>
        <Link href="/">See all seasons →</Link>
      </p>
    </main>
  );
}
