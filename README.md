# Seasons

A single-author web app for recording one period of life as one public page: photos, video, quotes, a Spotify playlist, stickers, maps and voice notes, each placed by hand on a free-form canvas. Open source; fork your own.

The full specification is in [docs/requirements.md](docs/requirements.md).

## Status

**Phase 1** (built):

- Passkey sign-in for one owner, with a one-time setup token.
- Seasons: create, edit, autosave a draft, publish, publish changes, discard changes, unpublish, rename the slug, delete.
- Item types: photo, quote (including the season title and subtitle), Spotify playlist card.
- Desktop canvas (1440 units wide): drag, resize, rotate, layer order, lock, duplicate, delete, undo/redo (50 steps). Shift keeps the aspect ratio and snaps rotation to 15°. Arrow keys nudge.
- Public page at `/seasons/[slug]`, cached until the next publish.

**Phase 2** (built):

- Mobile canvas (390 units wide) with a Desktop / Mobile toggle in the editor. Content is shared; position, size, rotation, layer, lock and quote text size are separate per layout.
- A new season's mobile layout starts as the desktop layout scaled down. Reset it to that, or to a single column. Hide any item on mobile.
- Screens narrower than 960 px show the mobile layout. Both layouts are in the page's HTML and CSS picks one, so the page needs no JavaScript to choose.
- Preview at real screen sizes: phone, large phone, tablet, laptop, desktop, wide.
- Index page at `/seasons`: cover, `// title` and period for each published season. Pinned seasons first, then newest first.
- Share metadata: title, description, canonical URL and the cover image for link previews.

Phases 3 and 4 (video, stickers, voice notes, maps, seed data) are not built yet.

## How it works

- **Next.js** (App Router) with `basePath: "/seasons"`. The owner's main site rewrites `/seasons/*` to this deployment.
- **Postgres** stores each season as one row with two JSON documents: `draft` (autosaved by the editor) and `published` (the snapshot visitors see). Publish copies one into the other.
- **Cloudflare R2** stores media: originals in a private bucket, resized WebP copies (640, 1280 and 2048 px) in a public bucket. HEIC photos are converted to JPEG in the browser before upload. The server strips all metadata, including GPS location.
- **Spotify** playlist title and cover come from Spotify's oEmbed endpoint, which needs no account or key. The Spotify player loads only after a visitor clicks the card.

## Run it locally

You need Node.js 20 or later and Postgres.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Edit `.env.local`: set `DATABASE_URL`, and set `SETUP_TOKEN` to any secret string. Leave `STORAGE_DRIVER=local` to store uploads in `.data/` instead of R2.

```bash
npm run db:migrate
```

```bash
npm run dev
```

Open http://localhost:3000/seasons/edit, enter your setup token and register a passkey.

Other commands:

```bash
npm test
```

```bash
npm run lint
```

## Deploy your own copy

1. **Fork** this repository.
2. **Database.** Create a free Postgres database (for example on [Neon](https://neon.tech)). Run `npm run db:migrate` once with `DATABASE_URL` set to it.
3. **Storage.** In Cloudflare R2, create two buckets: a private one for originals and a public one for processed images. Give the public bucket a public URL (a custom domain or the `r2.dev` URL). Create an R2 API token with read and write access to both buckets.
4. **CORS on the private bucket.** The browser uploads originals straight to R2, so allow `PUT` from your site:

   ```json
   [
     {
       "AllowedOrigins": ["https://your-domain.example"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

5. **Vercel.** Import the fork as a new project. Set every variable from `.env.example`, with `STORAGE_DRIVER=r2`. `SITE_URL` is the address visitors use (your main domain, without `/seasons`).
6. **Main site rewrite.** On your main site, forward `/seasons` to the Seasons deployment. In a Next.js main site:

   ```ts
   // next.config.ts of the main site
   async rewrites() {
     return [
       { source: "/seasons", destination: "https://YOUR-SEASONS-PROJECT.vercel.app/seasons" },
       { source: "/seasons/:path*", destination: "https://YOUR-SEASONS-PROJECT.vercel.app/seasons/:path*" },
     ];
   }
   ```

   In any other site on Vercel, add the same two rewrites to `vercel.json`.
7. **First passkey.** Open `https://your-domain.example/seasons/edit`, enter `SETUP_TOKEN` and register a passkey. Then add a backup passkey (for example on your phone) from the editor's home page.

Passkeys are bound to the domain in `SITE_URL`. Always open the editor through your main domain, not the `*.vercel.app` address.

**Lost every passkey?** Set a new `SETUP_TOKEN` in Vercel, redeploy, and register again with it. Each setup token works once.

## License

[GNU AGPL-3.0](LICENSE) (`AGPL-3.0-only`). If you run a changed version for others, you must offer them its source code. The "Seasons is open source" link on every season page does this; point `SOURCE_URL` at your fork.
