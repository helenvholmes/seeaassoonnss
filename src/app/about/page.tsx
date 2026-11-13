import type { Metadata } from "next";
import Link from "next/link";
import { Collage, type CollagePiece } from "@/components/landing/Collage";
import { Wordmark } from "@/components/landing/Wordmark";
import { BASE_PATH, config } from "@/lib/config";

// The landing page for the project: what it is and how to run your own copy. It
// reads nothing from the database, so it builds and renders on a fresh fork. With
// LANDING_PAGE=on, "/" sends visitors here (see next.config.ts).
export const dynamic = "force-static";

const NAME = "seeaassoonnss";
const DESCRIPTION =
  "A period of your life, set to photos, voice notes, quotes. Open source; run your own copy for free.";

export function generateMetadata(): Metadata {
  const site = process.env.SITE_URL;
  const url = site ? new URL(`${BASE_PATH}/about`, site).toString() : undefined;
  return {
    title: `${NAME} · a page for a season of your life`,
    description: DESCRIPTION,
    alternates: url ? { canonical: url } : undefined,
    openGraph: { type: "website", siteName: NAME, title: NAME, description: DESCRIPTION, url },
  };
}

const sticker = (file: string) => `${BASE_PATH}/sticker-packs/botanical/${file}.webp`;

/** Pseudo-random but fixed bar heights for the sample voice note. */
const WAVE = Array.from({ length: 36 }, (_, i) => 0.25 + 0.7 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.45)));

function Sticker({ file }: { file: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="collage-sticker" src={sticker(file)} alt="" draggable={false} decoding="async" />;
}

const PIECES: CollagePiece[] = [
  {
    id: "iris",
    desktop: [3, 4, 11, -7],
    mobile: [2, 1, 26, -7],
    z: 2,
    children: <Sticker file="gold-banded-iris" />,
  },
  {
    id: "title",
    desktop: [17, 6, 40, -2],
    mobile: [30, 3, 66, -2],
    z: 5,
    className: "collage-title",
    children: (
      <>
        <p className="collage-heading">// a long june</p>
        <p className="collage-period">june 2026</p>
      </>
    ),
  },
  {
    id: "photo",
    desktop: [38, 36, 17, -3],
    mobile: [36, 26, 40, -3],
    z: 3,
    className: "collage-photo",
    children: (
      <svg viewBox="0 0 1600 2000" preserveAspectRatio="xMidYMid slice">
        <rect width="1600" height="2000" fill="#ecece8" />
        <circle cx="800" cy="1260" r="420" fill="#c9cf7a" />
        <circle cx="800" cy="820" r="250" fill="#c9cf7a" />
        <path d="M800 580 C810 480 850 420 900 380" stroke="#6b5a3a" strokeWidth="22" fill="none" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "butterfly",
    desktop: [57, 3, 13, 14],
    mobile: [70, 21, 28, 14],
    z: 6,
    children: <Sticker file="butterfly" />,
  },
  {
    id: "quote",
    desktop: [61, 26, 22, 2],
    mobile: [4, 58, 58, 2],
    z: 4,
    className: "collage-quote",
    children: (
      <p>
        we swam every evening until the lake <em>went dark</em>, and nobody wanted to be the first one out.
      </p>
    ),
  },
  {
    id: "playlist",
    desktop: [83, 16, 14, 5],
    mobile: [62, 50, 33, 5],
    z: 5,
    className: "collage-playlist",
    children: (
      <div className="playlist-card">
        <svg className="playlist-cover" viewBox="0 0 1600 1600" preserveAspectRatio="xMidYMid slice">
          <rect width="1600" height="1600" fill="#f4f4f0" />
          <path d="M800 160 C1220 440 1220 1140 800 1440 C380 1140 380 440 800 160Z" fill="#9fbf8a" />
          <path d="M800 260 V1420" stroke="#6f8f5c" strokeWidth="18" fill="none" />
        </svg>
        <span className="playlist-text">
          <span className="playlist-label">playlist ▸</span>
          <span className="playlist-title">porch radio</span>
          <span className="playlist-caption">23 songs</span>
        </span>
      </div>
    ),
  },
  {
    id: "plum",
    desktop: [24, 48, 11, 9],
    mobile: [6, 34, 27, 9],
    z: 2,
    children: <Sticker file="reine-claude-plum" />,
  },
  {
    id: "voice",
    desktop: [5, 82, 28, 0],
    mobile: [4, 80, 62, 0],
    z: 5,
    className: "collage-voice",
    children: (
      <div className="voice-note">
        <span className="voice-play">▶</span>
        <span className="voice-body">
          <svg className="voice-wave" viewBox={`0 0 ${WAVE.length * 3} 20`} preserveAspectRatio="none">
            {WAVE.map((h, i) => (
              <rect key={i} x={i * 3} y={10 - h * 10} width={2} height={h * 20} className={i < 11 ? "played" : undefined} />
            ))}
          </svg>
          <span className="voice-meta">
            <span className="voice-caption">frogs, 10 pm</span>
            <span className="voice-time">0:42</span>
          </span>
        </span>
      </div>
    ),
  },
  {
    id: "tulip",
    desktop: [87, 56, 9, -10],
    mobile: [76, 76, 20, -10],
    z: 3,
    children: <Sticker file="study-of-a-tulip-perregoen-machieu" />,
  },
  {
    id: "mushrooms",
    desktop: [60, 72, 19, -2],
    mobile: [28, 90, 44, -2],
    z: 2,
    children: <Sticker file="mushrooms" />,
  },
];

const ITEMS: [string, string][] = [
  ["photo", "Upload and crop inside its box. Location data is removed. Optional parallax, like a view through a window."],
  ["video", "Plays as a silent loop on screen; sound only after a click."],
  ["quote", "Markdown in EB Garamond, IBM Plex Mono or a sans-serif. Doubles as the title and subtitle."],
  ["playlist or song", "Paste a Spotify link. A card with its cover; the player loads on click."],
  ["sticker", "Your own cut-outs, or the built-in packs: botanical plates, Open Doodles, Open Peeps, Humaaans."],
  ["map", "Search a place. A plain outline map with a dot and a label."],
  ["voice note", "Record in the browser or upload. Nothing plays until someone presses play."],
  ["route map", "Import GeoJSON. The map stays on screen and the route draws in as the page scrolls."],
  ["3D model", "Upload a .glb. It can spin, turn toward the cursor or play its animation."],
];

const TRAITS: [string, string][] = [
  ["hand-placed", "Drag, rotate, resize, layer and lock every item. The phone layout is placed by hand too, so it is not a squashed copy of the desktop."],
  ["quiet", "No other accounts, comments or likes. Nothing makes a sound until a visitor clicks."],
  ["yours", "One owner, signed in with a passkey. Your database, your storage, your domain. Drafts stay private until you publish."],
  ["generative, if you want", "Shuffle the layout from a seed, let items follow the cursor, set letters rippling, or put a p5.js sketch or a 3D model behind it all. All of it turns off for visitors who ask for less motion."],
];

const STEPS: [string, string][] = [
  ["fork", "Fork the repository on GitHub."],
  ["deploy", "Import the fork into Vercel. The Hobby plan is enough."],
  ["connect", "Add a free Postgres database (Neon) and two Cloudflare R2 buckets for media."],
  ["sign in", "Open /seasons/edit, register your passkey and make your first season."],
];

export default function Landing() {
  const source = config.sourceUrl;
  const guide = `${source}#deploy-your-own-copy`;
  return (
    <main className="landing">
      <header className="landing-hero">
        <h1 className="landing-name">
          <Wordmark />
        </h1>
        <p className="landing-lede">
          A period of your life, set to photos, voice notes, quotes.
        </p>
        <div className="landing-actions">
          <Link className="button primary" href="/demo">
            see a season ▸
          </Link>
          <a className="button" href={guide}>
            run your own
          </a>
        </div>
      </header>

      <section className="landing-sample" aria-labelledby="sample-heading">
        <p className="landing-hint" id="sample-heading">
          // a season, hand-placed<span className="landing-hint-drag"> — drag anything</span>
        </p>
        <Collage
          pieces={PIECES}
          label="A sample season: botanical stickers, a photo of a pear, a quote about swimming in a lake, a playlist card and a voice note, arranged by hand."
        />
      </section>

      <section className="landing-section" aria-labelledby="items-heading">
        <h2 id="items-heading">// what goes on a page</h2>
        <ul className="landing-items">
          {ITEMS.map(([name, text]) => (
            <li key={name}>
              <span className="landing-item-name">{name}</span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="landing-section" aria-labelledby="traits-heading">
        <h2 id="traits-heading">// how it feels</h2>
        <div className="landing-traits">
          {TRAITS.map(([name, text]) => (
            <div key={name}>
              <h3>{name}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-run" aria-labelledby="run-heading">
        <h2 id="run-heading">// run your own</h2>
        <p className="landing-run-lede">
          There is no sign-up. Each person runs their own copy, and for one person the free tiers of Vercel, Neon and Cloudflare R2 are
          enough.
        </p>
        <ol className="landing-steps">
          {STEPS.map(([name, text]) => (
            <li key={name}>
              <span className="landing-item-name">{name}</span>
              <span>{text}</span>
            </li>
          ))}
        </ol>
        <div className="landing-actions">
          <a className="button primary" href={guide}>
            read the setup guide ▸
          </a>
          <a className="button" href={source}>
            view the source
          </a>
        </div>
        <p className="muted small landing-license">
          {NAME} is free software under the GNU AGPL-3.0. Change it, share it, sell it; if you run a changed version for other people, offer
          them its source.
        </p>
      </section>

      <footer className="season-footer">
        <Link href="/">// all seasons</Link>
        <a href={source}>{NAME} is open source</a>
        <a href={`${source}/blob/main/public/sticker-packs/CREDITS.md`}>sticker credits</a>
      </footer>
    </main>
  );
}
