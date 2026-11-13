# seeaassoonnss

A single-author web app for recording one period of life as one public page: photos, video, quotes, Spotify playlists and songs, stickers, maps, voice notes and 3D models, each placed by hand on a free-form canvas, with optional generative effects. Open source; fork your own.

- **One owner.** You sign in with a passkey. There are no other accounts, comments or likes.
- **Hand-placed.** Drag, rotate, resize, layer and lock every item. A separate mobile layout is placed by hand too.
- **Public pages** at `/seasons/[slug]`, plus an index at `/seasons` and a landing page for the project at `/seasons/about`. Drafts stay private until you publish.
- **Cheap to run.** Vercel (Hobby), a free Postgres database and Cloudflare R2's free tier are enough for one person.

The full specification and decision log are in [docs/requirements.md](docs/requirements.md).

## Contents

- [What's in a season](#whats-in-a-season)
- [Deploy your own copy](#deploy-your-own-copy)
- [Environment variables](#environment-variables)
- [Put it on your own site](#put-it-on-your-own-site)
- [Updating your copy](#updating-your-copy)
- [Troubleshooting](#troubleshooting)
- [Run it locally](#run-it-locally)
- [How it works](#how-it-works)
- [License](#license)

## What's in a season

| Item | How you add it | What visitors see |
| --- | --- | --- |
| Photo | Upload JPEG, PNG, HEIC or WebP; double-click to crop (drag to move the photo in its box, scroll to zoom); optionally turn on **Parallax background**; pick the season's cover in Season settings → Cover image | The photo, sized for their screen. All location data is removed. With parallax, the photo fills the screen and stays put while the page scrolls past its box, like a view through a window. |
| Video | Upload MP4, MOV or WebM (no GIF) | A silent loop while on screen; sound after a click |
| Quote | Type Markdown (bold, italic, links) | Text in EB Garamond, IBM Plex Mono or a sans-serif |
| Title, subtitle | Quote items that show the season's title or subtitle | |
| Playlist or song | Paste a public Spotify playlist link or a song link | A card with cover and title; the Spotify player loads on click |
| Sticker | Upload transparent PNG, WebP or SVG, reuse one from your sticker library, or pick one from the built-in packs: botanical plates (public-domain prints, cut out), Open Doodles, Open Peeps and Humaaans | The image with its transparent background |
| Map | Search a place or type coordinates | A simple outline map with a dot and a label |
| Voice note | Record in the browser or upload audio | A small player; nothing plays until they press play |
| Route map | Import a GeoJSON file (points are the stops, lines the path) | A band of the page where the map stays on screen while the route draws in as they scroll; linked items move the map to their stop |
| 3D model | Upload a glTF binary (`.glb`), up to 50 MB | The model in its box; it can spin, turn toward the cursor and play its animation. A still poster shows while it loads and where WebGL is missing |

Nothing makes sound until a visitor clicks.

### Generative effects

All optional, and all off for visitors who have "reduce motion" turned on.

| Effect | Where | What it does |
| --- | --- | --- |
| Random layout | **Shuffle** in the editor bar (new seed), or Season settings → random layout (seed and size range) | Places every unlocked item at random, spreading them down a longer page when there are many, and gives photos, videos, stickers and 3D models a random size in a range you set. The same seed always gives the same layout; lock what you like and try another seed. |
| Follow the cursor | Any item's settings | The item drifts toward the cursor. On phones it moves with scroll. |
| Type effects | Quote settings | Letters move away from the cursor, ripple as the page scrolls, or gather as the quote reaches the middle of the screen. Screen readers read the plain text. |
| Background | Season settings → behind all items | One 3D model, or one p5.js sketch, fills the screen behind all items. |

**p5.js sketches.** Write a sketch in p5's global mode (`setup()` and `draw()`), as in the [p5.js web editor](https://editor.p5js.org), and paste it in. `mouseX` and `mouseY` follow the cursor (on phones, the scroll position), and `seasons.scroll` is 0 at the top of the page and 1 at the end. Sketches are saved in your own database, in a sketch library you can reuse across seasons; `npm run seed` adds three examples. A sketch runs in a sealed frame (`sandbox="allow-scripts"`): it cannot see the page, your sign-in or the editor. p5.js is served from your own deployment, not a CDN.

**3D models** are compressed on upload: textures become WebP at most 2048 px (or 1024 px, your choice) and geometry is packed with [meshopt](https://meshoptimizer.org). The original is kept in the private bucket. A season can hold up to 6 models plus one background. Pages without a model or sketch load no 3D or p5.js code.

## Deploy your own copy

This takes about 30 minutes. You need accounts on [GitHub](https://github.com), [Vercel](https://vercel.com) and [Cloudflare](https://dash.cloudflare.com). All three are free for this use, though Cloudflare may ask for a payment method before it turns on R2.

### 1. Fork the repository

On GitHub, click **Fork** on this repository.

### 2. Set up media storage in Cloudflare R2

seeaassoonnss keeps photos, video and audio in two R2 buckets: a **private** one for original uploads, and a **public** one for the files your pages load.

1. In the Cloudflare dashboard, open **R2 Object Storage** and create two buckets, for example `seeaassoonnss-originals` (private) and `seeaassoonnss-media` (public).
2. Open the public bucket → **Settings** → **Public access**. Either connect a custom domain (for example `media.example.com`) or allow the `r2.dev` URL. Copy that URL: it is `R2_PUBLIC_URL`.
3. On **each** bucket, open **Settings** → **CORS policy** and add this rule, with your site's address in place of `https://your-domain.example`. The browser uploads straight to R2, so both buckets need it.

   ```json
   [
     {
       "AllowedOrigins": ["https://your-domain.example"],
       "AllowedMethods": ["GET", "PUT"],
       "AllowedHeaders": ["content-type", "cache-control"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   `PUT` lets the browser upload. `GET` lets season pages load 3D models, which are fetched by script.

   Your site's address is the one visitors will use: your own domain if you [put seeaassoonnss on your own site](#put-it-on-your-own-site), or otherwise the `https://<project>.vercel.app` address Vercel gives you in step 3. You can come back and change it.

4. Go to **R2 Object Storage** → **Manage API tokens** → **Create API token**. Give it **Object Read & Write** for the two buckets. Copy the **Access Key ID** and **Secret Access Key**. Your **Account ID** is on the R2 overview page.

### 3. Create the Vercel project

1. In Vercel, click **Add New → Project** and import your fork. Vercel detects Next.js.
2. Vercel may suggest an "Amazon S3" integration. Skip it: seeaassoonnss talks to R2 directly.
3. Open **Environment Variables** and add the variables from [the table below](#environment-variables). Make the setup token with `openssl rand -base64 32`, or any password generator.
4. Click **Deploy**. The first build prints a warning that the database is missing. That is expected.
5. Add a database: in the project, open **Storage** → **Create Database** → **Neon** (Postgres) and connect it to the project. This sets `DATABASE_URL` for you. Any Postgres works; set `DATABASE_URL` yourself for another provider.
6. Open **Deployments**, and **Redeploy** the latest one. Each build sets up the database tables automatically.

### 4. Check the setup (recommended)

This runs a check of every setting: database, setup token, both buckets, public URL and upload permissions. It reports what to fix. On your computer, with [Node.js](https://nodejs.org) 20 or later:

```bash
git clone https://github.com/YOUR-NAME/seasons.git
```

```bash
cd seasons && npm install
```

```bash
npx vercel link
```

```bash
npx vercel env pull .env.local
```

```bash
npm run doctor
```

If Vercel marks a variable as sensitive, `env pull` leaves it empty; paste that value into `.env.local` yourself. Delete `.env.local` afterwards if you do not develop locally.

### 5. Register your passkey

Open `https://<your site>/seasons/edit`. Enter your setup token and register a passkey (Touch ID, Face ID, Windows Hello, a phone or a security key). Then add a backup passkey from the editor's home page, for example on your phone.

Each setup token works once. Nobody can register a passkey without it, so a stranger cannot claim your copy before you do.

### 6. Make your first season

In the editor, click **New season**. Or, to see an example first, click **Create demo season**: it makes a draft at `/seasons/demo` with placeholder photos, a 3D pear, a type effect, cursor follow and a p5.js sketch background, and adds three example sketches to your sketch library. Publish it to see it as visitors would, or delete it from its season settings.

`npm run seed`, run from your computer with the deployment's settings in `.env.local`, does the same.

## Environment variables

| Variable | Required | Secret | What it is |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | **yes** | Postgres connection string. It contains the database password. Set automatically by the Neon integration. |
| `SITE_URL` | yes | no | The address visitors use, without `/seasons`. For example `https://example.com` or `https://my-seasons.vercel.app`. Passkeys are bound to this domain. |
| `SETUP_TOKEN` | yes, for the first sign-in | **yes** | A long random string. Anyone who has it can register a passkey and take over the editor until it is used. Each value works once. |
| `LANDING_PAGE` | no | no | `on` sends `/` to the landing page (what the app is and how to run your own) instead of to `/seasons`. It is read at build time, so redeploy after changing it. The landing page is always at `/seasons/about`. |
| `SOURCE_URL` | recommended | no | Your fork's GitHub URL, for the "seeaassoonnss is open source" link. |
| `STORAGE_DRIVER` | yes | no | `r2` for a deployment. `local` stores files on disk and only works in development. |
| `R2_ACCOUNT_ID` | with r2 | no | Cloudflare account ID. It identifies your account but grants no access on its own. |
| `R2_ACCESS_KEY_ID` | with r2 | **yes** | From the R2 API token. Keep it with the secret key. |
| `R2_SECRET_ACCESS_KEY` | with r2 | **yes** | From the R2 API token. With the access key ID, it can read, write and delete everything in both buckets. |
| `R2_PRIVATE_BUCKET` | with r2 | no | Bucket for original uploads, for example `seeaassoonnss-originals`. |
| `R2_PUBLIC_BUCKET` | with r2 | no | Bucket for processed media, for example `seeaassoonnss-media`. |
| `R2_PUBLIC_URL` | with r2 | no | Public URL of the public bucket, no trailing slash. |

In Vercel, turn on **Sensitive** for the four secrets. Vercel then never shows their values again, and `vercel env pull` leaves them empty. Never commit them: `.env.local` is ignored by git for this reason. If a secret leaks, replace it: rotate the database password in Neon, delete the R2 API token and make a new one, or set a new `SETUP_TOKEN`.

[`.env.example`](.env.example) lists the same variables.

## Put it on your own site

seeaassoonnss serves everything under `/seasons`, so it can sit inside another website on the same domain. On your main site, forward `/seasons` to the seeaassoonnss deployment. In a Next.js main site:

```ts
// next.config.ts of the main site
async rewrites() {
  return [
    { source: "/seasons", destination: "https://YOUR-SEASONS-PROJECT.vercel.app/seasons" },
    { source: "/seasons/:path*", destination: "https://YOUR-SEASONS-PROJECT.vercel.app/seasons/:path*" },
  ];
}
```

Any other site on Vercel can add the same two rewrites to its `vercel.json`. Then:

1. Set `SITE_URL` to the main domain and redeploy seeaassoonnss.
2. Update the CORS rule on both buckets to the main domain.
3. Sign in at `https://<main domain>/seasons/edit`, not at the `*.vercel.app` address. Passkeys only work on the domain in `SITE_URL`. If you already registered a passkey on the old address, set a new `SETUP_TOKEN` and register again.

On its own, without a main site, a seeaassoonnss deployment sends `/` to `/seasons`. Set `LANDING_PAGE=on` to send it to the landing page at `/seasons/about` instead, as [seeaassoonnss.app](https://seeaassoonnss.app) does. Its "see a season" button opens `/seasons/demo`, so publish the demo season on that deployment.

## Updating your copy

On GitHub, open your fork and click **Sync fork**. Vercel deploys the update and applies any new database changes during the build.

Copies set up before 3D models existed (November 2026) need one change by hand: add `"GET"` to `AllowedMethods` in the public bucket's CORS rule (see [step 2](#2-set-up-media-storage-in-cloudflare-r2)). Without it, 3D models show only their poster.

## Troubleshooting

Open `https://<your site>/seasons/api/health` first. It says which part of the setup fails (address, database, tables or storage) without showing any secret values. For a deeper check, including uploads, run `npm run doctor` (see [step 4](#4-check-the-setup-recommended)).

| Problem | Cause and fix |
| --- | --- |
| "The setup token is wrong" | `SETUP_TOKEN` in Vercel differs from what you typed, or you changed it without redeploying. |
| "This setup token was already used" | Each token works once. Set a new `SETUP_TOKEN`, redeploy, and register again. This is also how you recover if you lose every passkey. |
| The passkey prompt fails or shows an error about the domain | You are not on the domain in `SITE_URL`. Open the editor at exactly that address. |
| Uploads fail with "storage refused the upload" (or "NetworkError") | The CORS rule of a bucket does not list the address the editor is open at, for example `https://<project>.vercel.app`. The error names that address: add it to `AllowedOrigins` on **both** buckets. See [step 2](#2-set-up-media-storage-in-cloudflare-r2). `/seasons/api/health` checks this for the address in `SITE_URL`. |
| Photos upload but do not show | `R2_PUBLIC_URL` is wrong, or public access is off on the public bucket. |
| 3D models show only their poster | The public bucket's CORS rule lacks `GET`, or the browser has no WebGL. `npm run doctor` checks the first. |
| A sketch background stays empty | The sketch has an error: the editor shows it under the code. Sketches must use p5.js 2 and global mode (`function setup()`, `function draw()`). |
| "This browser cannot compress video" | Video is compressed in the browser. Use a current Chrome, Edge, Safari or Firefox on a computer. |
| A playlist link is refused | The playlist must be public. |
| "Application error: a server-side exception has occurred" | A setting is missing or wrong. `/seasons/api/health` names it, and Vercel's runtime logs show a line starting with `[seasons]`. Fix the setting, then redeploy. |

## Run it locally

You need Node.js 20 or later and Postgres.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local`: set `DATABASE_URL`, and set `SETUP_TOKEN` to any string. Leave `STORAGE_DRIVER=local` to store uploads in `.data/` instead of R2.

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open http://localhost:3000/seasons/edit, enter your setup token and register a passkey. Browsers allow passkeys on `localhost` without https.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build (needs no environment variables) |
| `npm run db:migrate` | Applies database migrations in `db/migrations/` |
| `npm run seed` | Creates a demo season with placeholder items, a 3D pear, and three example p5.js sketches in the sketch library |
| `npm run doctor` | Checks the setup and says what to fix |
| `npm test` | Unit tests |
| `npm run lint` | Type check |

## How it works

- **Next.js** (App Router) with `basePath: "/seasons"`. Public pages are cached and refreshed when you publish.
- **Postgres** stores each season as one row with two JSON documents: `draft`, which the editor autosaves, and `published`, the snapshot visitors see. Publish copies one into the other.
- **Layouts:** the desktop canvas is 1440 units wide and the mobile canvas 390. Each scales to the screen, so overlaps stay as placed. Screens narrower than 960 px get the mobile layout. A page has no length limit: it grows to fit its lowest item, and visitors scroll.
- **Index order:** pinned seasons first, then by each season's month (newest first), then by creation date.
- **Media** lives in Cloudflare R2. Photos and stickers are resized to WebP on the server ([sharp](https://sharp.pixelplumbing.com)), without metadata. HEIC is converted to JPEG, video compressed to MP4 ([Mediabunny](https://mediabunny.dev)) and audio encoded to MP3 (LAME) in the browser, so the server never runs ffmpeg.
- **Maps** are SVG drawn on the server from [Natural Earth](https://www.naturalearthdata.com) outlines and cached per place and zoom. Place search uses OpenStreetMap's [Nominatim](https://nominatim.org), from the editor only.
- **Sticker packs** are free to use and are listed with their sources and licenses in [public/sticker-packs/CREDITS.md](public/sticker-packs/CREDITS.md). They ship with the app; a sticker is copied into your own storage when you add it.
- **Spotify** playlist and song titles and covers come from Spotify's oEmbed endpoint, which needs no account or key.
- **3D** uses [three.js](https://threejs.org) with [React Three Fiber](https://r3f.docs.pmnd.rs), loaded only on seasons with a model. Models are compressed on the server with [glTF Transform](https://gltf-transform.dev) and meshopt; posters are drawn in the editor's browser.
- **Generative** effects use plain DOM and CSS (cursor follow, type effects) and [p5.js](https://p5js.org) 2 (sketch backgrounds, in a sandboxed iframe).
- **Sign-in** uses passkeys (WebAuthn, via [SimpleWebAuthn](https://simplewebauthn.dev)) and an HTTP-only session cookie.

## License

[GNU AGPL-3.0](LICENSE) (`AGPL-3.0-only`). You may use, change, share and sell seeaassoonnss. If you run a changed version for other people, you must offer them its source code. The "seeaassoonnss is open source" link on every season page does this; point `SOURCE_URL` at your fork.

Season content (photos, quotes, audio) lives in your database and storage, not in the repository, and the license does not cover it.
