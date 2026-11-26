import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Collage, type CollagePiece } from "@/components/landing/Collage";
import { existsSync } from "node:fs";
import path from "node:path";
import { Wordmark } from "@/components/landing/Wordmark";
import { mapUrl } from "@/components/ItemContent";
import { VoiceNoteView } from "@/components/items/VoiceNoteView";
import { PlayIcon } from "@/components/PlayIcon";
import { BASE_PATH, config } from "@/lib/config";

// The landing page for the project: what it is and how to run your own copy. It
// reads nothing from the database, so it builds and renders on a fresh fork. With
// LANDING_PAGE=on, "/" sends visitors here (see next.config.ts). On seeaassoonnss.app
// it is served at "/" and "/about" instead (see vercel.json).
export const dynamic = "force-static";

const NAME = "seeaassoonnss";
const DESCRIPTION =
  "A period of your life, set to photos, voice notes, quotes. Open source; run your own copy for free.";

export function generateMetadata(): Metadata {
  const site = process.env.SITE_URL;
  // With LANDING_PAGE=on this page is the site's front page (on seeaassoonnss.app,
  // vercel.json serves it at "/" and "/about"), so "/" is its canonical address.
  const url = site ? new URL(process.env.LANDING_PAGE === "on" ? "/" : `${BASE_PATH}/about`, site).toString() : undefined;
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

/**
 * The sample season's voice note: 42 seconds of frogs (public/landing/media/frogs/audio.mp3),
 * cut from "frogs_01" by musicbrain on Freesound (CC0), mono MP3 like an upload.
 */
const FROGS = {
  mediaId: "frogs",
  caption: "frogs, 10 pm",
  duration: 42,
  waveform: [
    0.62, 1, 0.82, 0.71, 0.77, 0.76, 0.96, 0.84, 0.8, 0.83, 0.7, 0.51, 0.75, 0.57, 0.79, 0.61, 0.66, 0.61, 0.66, 0.75, 0.66, 0.57,
    0.64, 0.67, 0.81, 0.74, 0.83, 0.86, 0.96, 0.85, 0.62, 0.82, 0.77, 0.75, 0.64, 0.41,
  ],
};

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
    live: true,
    children: (
      <VoiceNoteView
        item={{ id: "frogs", type: "voice_note", desktop: null, mobile: null, content: FROGS } as never}
        mediaBase={`${BASE_PATH}/landing`}
        interactive
      />
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

/** The landing page's own voice note, kept with the page (public/landing/media/voice-note/audio.mp3). */
const VOICE_MEDIA_BASE = `${BASE_PATH}/landing`;
const VOICE_FILE = path.join(process.cwd(), "public/landing/media/voice-note/audio.mp3");
const VOICE_NOTE = { caption: "what this is, in my words", duration: 0, waveform: [] as number[] };

const EAGLES_MERE = { lat: 41.4087, lon: -76.5833, zoom: 3, label: "eagles mere, pa", borders: true };

/** A short handwritten-looking note beside an item: its name, then what it does. */
function Note({ name, mark = false, children }: { name: string; mark?: boolean; children: ReactNode }) {
  return (
    <p className="tour-note">
      <span className="tour-note-name">
        {mark ? <span className="tour-mark">◦ </span> : null}
        {name}
      </span>{" "}
      {children}
    </p>
  );
}

/** A voice note that does nothing yet: shown until the recording is in place. */
function VoiceNotePlaceholder({ caption }: { caption: string }) {
  return (
    <div className="voice-note">
      <span className="voice-play"><PlayIcon /></span>
      <span className="voice-body">
        <svg className="voice-wave" viewBox={`0 0 ${WAVE.length * 3} 20`} preserveAspectRatio="none" aria-hidden>
          {WAVE.map((h, i) => (
            <rect key={i} x={i * 3} y={10 - h * 10} width={2} height={h * 20} />
          ))}
        </svg>
        <span className="voice-meta">
          <span className="voice-caption">{caption}</span>
          <span className="voice-time">soon</span>
        </span>
      </span>
    </div>
  );
}

function tourPieces(): CollagePiece[] {
  const voice = existsSync(VOICE_FILE) ? (
    <VoiceNoteView
      item={{ id: "voice", type: "voice_note", desktop: null, mobile: null, content: { mediaId: "voice-note", ...VOICE_NOTE } } as never}
      mediaBase={VOICE_MEDIA_BASE}
      interactive
    />
  ) : (
    <VoiceNotePlaceholder caption={VOICE_NOTE.caption} />
  );
  return [
    {
      id: "tour-heading",
      desktop: [3, 1, 50, -1],
      mobile: [4, 0.2, 90, -1],
      z: 5,
      className: "tour-heading",
      children: <h2 id="tour-heading">// what goes on a page</h2>,
    },
    {
      id: "map",
      desktop: [5, 9, 22, -2],
      mobile: [6, 3.2, 60, -2],
      z: 3,
      className: "tour-map",
      children: (
        <div className="map-item">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mapUrl(EAGLES_MERE)} alt="Map: Eagles Mere, Pennsylvania" loading="lazy" decoding="async" draggable={false} />
          <span className="map-label">{EAGLES_MERE.label}</span>
        </div>
      ),
    },
    {
      id: "map-note",
      desktop: [6, 38, 20, 0],
      mobile: [8, 18, 80, 0],
      z: 4,
      children: <Note name="map">Search a place. A plain outline, a dot and a label; no tiles, no API key.</Note>,
    },
    {
      id: "voice",
      desktop: [35, 9, 30, 1],
      mobile: [4, 23.6, 90, 1],
      z: 5,
      className: "tour-voice",
      children: voice,
    },
    {
      id: "voice-note",
      desktop: [36, 17, 26, 0],
      mobile: [6, 27.9, 86, 0],
      z: 4,
      children: <Note name="voice note">Record it in the browser or upload one. Nothing plays until someone presses play.</Note>,
    },
    {
      id: "lake",
      desktop: [75, 5, 17, 4],
      mobile: [52, 34.6, 42, 4],
      z: 3,
      className: "collage-photo",
      children: (
        <svg viewBox="0 0 1600 2000" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A drawing of a lake at dusk">
          <rect width="1600" height="2000" fill="#e9e4d8" />
          <path d="M0 980 C300 860 520 900 760 820 C1040 730 1300 800 1600 760 V1160 H0Z" fill="#7d8f6a" />
          <rect y="1140" width="1600" height="860" fill="#4f6670" />
          <path d="M140 1360 H700 M900 1500 H1460 M300 1680 H1000" stroke="#8fa6ad" strokeWidth="14" strokeLinecap="round" />
          <circle cx="1180" cy="520" r="120" fill="#f3d9a4" />
        </svg>
      ),
    },
    {
      id: "lake-note",
      desktop: [73, 36, 21, 0],
      mobile: [52, 48, 42, 0],
      z: 4,
      children: <Note name="photo">Cropped inside its box, or set to parallax, like a view through a window. Location data is removed.</Note>,
    },
    {
      id: "rain",
      desktop: [34, 29, 32, -1],
      mobile: [4, 35.1, 46, -1],
      z: 4,
      className: "tour-quote",
      children: (
        <p>
          it rained the whole second week, and <em>nobody minded.</em>
        </p>
      ),
    },
    {
      id: "rain-note",
      desktop: [35, 42, 27, 0],
      mobile: [4, 42, 44, 0],
      z: 4,
      children: <Note name="quote">Markdown in a serif, a mono or a sans. The letters can ripple, or follow the cursor.</Note>,
    },
    {
      id: "rose",
      desktop: [5, 50, 13, -6],
      mobile: [8, 51.3, 30, -6],
      z: 2,
      children: <Sticker file="rose-bush-and-butterfly" />,
    },
    {
      id: "rose-note",
      desktop: [19, 60, 17, 0],
      mobile: [46, 57.7, 48, 0],
      z: 4,
      children: <Note name="sticker">Your own cut-outs, or the built-in packs of botanical plates and doodles.</Note>,
    },
    {
      id: "route",
      desktop: [42, 55, 30, 0],
      mobile: [4, 65.1, 92, 0],
      z: 3,
      className: "tour-route",
      children: (
        <svg viewBox="0 0 600 260" role="img" aria-label="A route drawn from Philadelphia up to Eagles Mere">
          <path
            className="tour-route-line"
            d="M400 222 C370 206 330 198 338 166 C346 134 300 124 302 96 C304 70 284 56 267 40"
          />
          {/* Eagles Mere is north-northwest of Philadelphia (about 1.5° N, 1.4° W). */}
          <circle cx="400" cy="222" r="7" />
          <circle cx="267" cy="40" r="7" />
          <text x="416" y="238">philadelphia</text>
          <text x="283" y="36">eagles mere</text>
        </svg>
      ),
    },
    {
      id: "route-note",
      desktop: [44, 76, 26, 0],
      mobile: [6, 75.3, 86, 0],
      z: 4,
      children: <Note name="route map">The map stays put while the line draws in as you scroll.</Note>,
    },
    {
      id: "hand",
      desktop: [76, 52, 19, 2],
      mobile: [6, 80.8, 42, 2],
      z: 4,
      className: "tour-trait",
      children: <Note name="hand-placed" mark>Even the phone layout. It is never a squashed copy of the desktop.</Note>,
    },
    {
      id: "quiet",
      desktop: [78, 68, 17, -2],
      mobile: [52, 80.8, 42, -2],
      z: 4,
      className: "tour-trait",
      children: <Note name="quiet" mark>No likes, no comments, no other accounts. Nothing makes a sound until you click.</Note>,
    },
    {
      id: "more",
      desktop: [6, 84, 32, 0],
      mobile: [6, 91.9, 88, 0],
      z: 4,
      className: "tour-trait tour-more",
      children: <Note name="also">Video loops, Spotify songs and playlists, 3D models that turn toward the cursor, and p5.js sketches behind it all.</Note>,
    },
  ];
}

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
      <nav className="landing-nav" aria-label="Account">
        <Link className="button" href="/edit/sign-in">
          log in
        </Link>
      </nav>
      <header className="landing-hero">
        <h1 className="landing-name">
          <Wordmark />
        </h1>
        <p className="landing-lede">
          A period of your life, set to photos, voice notes, quotes.
        </p>
        <div className="landing-actions">
          <a className="button primary" href="#tour">
            see a season ▾
          </a>
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

      <section className="landing-sample landing-tour" id="tour" aria-labelledby="tour-heading">
        <p className="landing-hint">
          // this part is a season too<span className="landing-hint-drag"> — move things around</span>
        </p>
        <Collage pieces={tourPieces()} aspect="16 / 12" mobileAspect="3 / 13" readable />
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
