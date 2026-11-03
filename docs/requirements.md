# Seasons — Requirements

Oct 28, 2026 · @Dbeueudvdbd Djeisisheneke · Updated Nov 3, 2026 (see [Decision log](#decision-log))

## Overview

Seasons is a single-author web app. It records one period of life as one public page of photos, video, quotes, a Spotify playlist and other items in a free-form layout.

1. **Name:** Seasons. One page is a season. (Earlier Pinterest versions used the word "moodboard".)
2. **Author:** one person (the owner). There are no other accounts, no collaborators and no comments.
3. **Audience:** the public. Visitors view seasons on the owner's website at `/seasons/[slug]`. Visitors cannot edit.
4. **Source code:** public on GitHub, so other people can fork the app and run their own copy.
5. **Device:** the owner creates on desktop. The owner also sets a separate layout for mobile.

## Goals and non-goals

The app must make one season fast to assemble and strange to look at, and must cost close to nothing to run.

### Goals

1. Collect 10–25 photos plus video, quotes, a playlist, stickers, maps and voice notes on one page.
2. Let the owner place each item by hand: drag, rotate, resize, layer, then lock.
3. Keep a separate, hand-placed layout for mobile.
4. Publish each season at a stable public URL.
5. Let other people fork and deploy their own copy with little setup.
6. Stay in free tiers for one owner.

### Non-goals

1. Multiple users, collaborators, comments or likes.
2. Automatic or random layout generation.
3. Visual effects: filters, grain, torn edges, tape, animation.
4. Export to image, PDF, video or print. The URL is the only output.
5. Reading photo metadata (date, place) for layout.
6. Autoplay of audio. (Videos loop silently; see [Item types](#item-types).)
7. Music services other than Spotify.
8. Photo import from cloud services. Upload is from the device only.
9. Native mobile apps.
10. Interactive maps or map tiles.

## Architecture and stack

Seasons is a separate Vercel project. The main website forwards `/seasons/*` to it, so visitors stay on the owner's domain. Items marked "proposed" are open for change.

Visitors reach season pages through the main site's rewrite. The owner uses the editor only after passkey sign-in. Only the Seasons app talks to the database, storage and Spotify.

| Part | Choice | Status |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Decided |
| Hosting | Vercel, separate project from the main site | Decided |
| URL | Main site rewrites `/seasons/:path*` to the Seasons deployment; Seasons sets `basePath: "/seasons"` | Proposed |
| Database | Hosted Postgres with a free tier (for example Neon); one JSON document per season | Proposed |
| Media storage | Cloudflare R2: a public bucket for processed media, a private bucket for originals | Decided |
| Sign-in | Passkey (WebAuthn), one owner | Decided |
| Media processing | In the browser: HEIC to JPEG, video compression. On the server: image resize and metadata removal (for example sharp) | Decided |
| Editor canvas | Client-side drag, rotate, resize library (for example react-moveable) | Proposed |
| Maps | D3 and TopoJSON vector outlines; no tile provider, no API key | Decided |

### Backend scope

A small backend is acceptable. It does these tasks only:

1. Passkey registration and sign-in.
2. Signed upload URLs for media storage.
3. Image processing after upload (video is compressed in the browser).
4. Read and write of season data.
5. Server-side fetch of Spotify playlist data (see [Item types](#item-types)).
6. Cache refresh of a public page after the owner saves.

### Passkey rules

1. The app accepts passkey registration only from the signed-in owner, or when the request includes the one-time setup token from the `SETUP_TOKEN` environment variable. The first passkey on a new deployment therefore also needs the token. This stops a stranger from claiming a new fork first.
2. The owner can register a second passkey (for example a phone) as a backup.
3. A session cookie (HTTP-only, secure) keeps the owner signed in.
4. All write routes require a valid session. All public routes are read-only.
5. **Recovery.** If the owner loses every passkey, they set a new setup token in the hosting settings and register again. The token is the only recovery path.

### Image processing

1. Accept JPEG, PNG, HEIC and WebP. GIF is not accepted.
2. Convert HEIC to JPEG in the browser before upload. (Prebuilt sharp packages usually cannot read HEIC.)
3. Make three widths (proposed: 640, 1280 and 2048 px) in WebP or AVIF on the server.
4. Remove all metadata (EXIF, GPS) before storage. Location data must not be public.
5. Keep the original file in the private bucket so new sizes can be made later.

### Video processing

1. Accept MP4, MOV and WebM. GIF is not accepted.
2. Compress in the browser before upload (for example WebCodecs or ffmpeg.wasm) to MP4 (H.264), which every browser plays. This also handles iPhone HEVC `.MOV` files.
3. Proposed size limits: 1080 px on the long side, and a target bitrate that keeps a 30-second clip under about 10 MB.
4. Remove all metadata, including location. iPhone videos store GPS data.
5. Capture the poster frame in the browser at upload.

### Public page delivery

The server renders each season page from its published snapshot and caches it. Publish refreshes the cache for that page only.

## Data model

Each season is stored as one JSON document in one database row: season fields, all items, and both placements of each item. With one owner and about 25 items per season, this keeps autosave to one write, undo to a stack of earlier documents, and the public page to one read.

Each season row holds two copies of the document:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Internal |
| `slug` | text, unique | URL part: `/seasons/[slug]` |
| `status` | `draft` or `published` | Drafts are not public |
| `draft` | JSONB | Working copy; the editor autosaves here |
| `published` | JSONB or empty | Frozen snapshot that visitors see |
| `published_at` | timestamp or empty | |
| `sort_order` | integer or empty | Optional manual position on the index page |
| `created_at`, `updated_at` | timestamp | |

Two other small tables: `stickers` (the sticker library) and `passkeys`.

The document shapes follow.

### Season document

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | Example: "leafy greens" |
| `subtitle` | markdown | Short description. Example: "moodboard for… who knows, really?" |
| `period` | free text | Owner sets any words. Example: "fall 2026" or "after the move" |
| `cover_item_id` | item reference | Image for the index page |
| `background` | color or image reference | Page background |
| `desktop_height` | number | Canvas height in design units |
| `mobile_height` | number | Canvas height in design units |
| `items` | list of items | See below |

### Item

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `type` | enum | `photo`, `video`, `quote`, `playlist`, `sticker`, `map`, `voice_note` |
| `content` | JSON | Different per type (see [Item types](#item-types)) |
| `desktop` | placement | Position on the desktop canvas |
| `mobile` | placement or empty | Empty = item is not shown on mobile |

### Placement

| Field | Type | Notes |
| --- | --- | --- |
| `x`, `y` | number | Top-left corner, in design units |
| `w`, `h` | number | Size, in design units |
| `rotation` | number | Degrees, any value |
| `z` | integer | Layer order; higher is in front |
| `locked` | boolean | Locked items cannot move by accident in the editor |

### Design units

A screen can be any width. The app must decide what happens to the layout when the screen is wider or narrower than the editor screen. Proposed rule:

1. The desktop canvas is always 1440 units wide. The mobile canvas is always 390 units wide.
2. The page scales the whole canvas to fit the screen width. A 1440-unit layout on a 1200 px screen shows at 83% size. Positions and overlaps stay exactly as placed.
3. Screens narrower than a breakpoint (proposed: 960 px) show the mobile layout. Wider screens show the desktop layout. (At 768 px the desktop layout would show at only 53% size.)
4. Scale is capped (proposed: 1.25×). On wider screens the canvas is centered and the background fills the sides. This keeps the 2048 px image size sharp.
5. Canvas height is free. The owner sets it, and the page scrolls down.

The alternative is a canvas that changes shape with the screen. That alternative moves items relative to each other, which breaks hand-placed overlaps. It is not recommended.

## Item types

Seven item types are in scope. No item plays sound until a visitor clicks it. Videos loop silently.

| Type | Input | Content stored | Display |
| --- | --- | --- | --- |
| Photo | Upload from device (JPEG, PNG, HEIC, WebP), 10–25 per season | Image sizes, alt text, original aspect ratio | Image; optional crop inside its box |
| Video | Upload (MP4, MOV, WebM); no GIF | Compressed MP4, poster frame | Plays muted on loop; sound only on click. With reduced motion turned on, shows the poster frame until clicked (proposed) |
| Quote | Markdown text, optional source line | Markdown, source | Text box; owner picks from a few preset fonts |
| Playlist | Link to an existing Spotify playlist | Playlist URL, title, cover image, owner caption | Custom card (see below) |
| Sticker | Upload transparent PNG, WebP or SVG; reuse from a sticker library | Image, library reference | Image with transparent background |
| Map | Place search or coordinates | Latitude, longitude, zoom, label | Vector outline drawn with D3 and TopoJSON, a dot and a label; no tiles |
| Voice note | Record in the browser or upload audio | Audio file, duration, optional caption, waveform (optional) | Small player; plays on click |

**Quote rules.** Markdown only: bold, italic, links, line breaks. No raw HTML. Quotes can come from any source: own writing, lyrics, books, messages. Preset fonts: EB Garamond (serif), IBM Plex Mono (monospace) and one plain sans-serif (to be picked). Each must look right in lowercase with the `//` prefix.

**Map rules.** Maps are vector outlines, not tile maps. No map provider account or API key is needed, so forks need no setup for maps. The same renderer draws the route map.

**Sticker library.** Each uploaded sticker goes into a library for reuse in any season. The repository can ship with no stickers, so forks start empty.

### Spotify playlist: limits and proposal

1. The standard Spotify embed is an iframe. Its own options are size and a color theme (Spotify community, Iframe API theme). The app cannot change the styles inside the iframe.
2. The Spotify oEmbed endpoint returns a title, a thumbnail image and the embed code for a Spotify URL, with no sign-in (Spotify oEmbed guide). The reference lists shows, episodes, artists, albums and tracks (oEmbed reference). **Tested Nov 3, 2026: playlist URLs work** and return `title`, `thumbnail_url` and `iframe_url`.
3. A full track list needs the Spotify Web API. Since February 2026, a Development Mode app needs the app owner to have Spotify Premium, and playlist items are available only for playlists the user owns or collaborates on (Spotify migration guide).

**Decided for version 1:** the server gets title and cover image through oEmbed. oEmbed gives no owner name or track count, so the owner types an optional caption instead (for example "for walking home"). The page shows a custom-styled card with that data. A click on the card opens the standard Spotify embed in place (or opens Spotify). The track list via the Web API is a later phase.

## Scroll-driven route map

A route map is an optional mode of the Map item. The map stays fixed on the screen while text and photos scroll next to it or over it. The route line draws in as the reader scrolls.

A season is always one canvas (no sections). The route map must therefore work inside the canvas; how is an open question.

### References

1. Visual: "The Russia Left Behind," *The New York Times*, October 2013 (producers: Mike Bostock, Shan Carter, Leslye Davis). Longform permalink.
2. Technical: OpenNews Source — Animating Maps with D3 and TopoJSON.

### Behavior

1. **Layout:** the map stays fixed on the screen. Text and photos scroll next to it or over it.
2. **Route drawing:** when the reader scrolls down, the route line draws in. When the reader scrolls up, the line pulls back.
3. **Method:** draw two copies of the same route path in two colors, one on top of the other. Set the top path's `stroke-dasharray` in proportion to scroll progress through the map section.
4. **Steps tied to places:** each content section links to a place on the route. When a section comes into view, the map moves to that place and highlights it.
5. **Reduced motion:** when the reader has reduced motion turned on, show the full route immediately with no animation.

### Data and tools

1. **Input:** an ordered list of places (name, latitude, longitude). One possible source: the owner's Odyssey list in Google Maps.
2. **Suggested tools:** D3 for the map and line. Scrollama (or an equal library) to detect which section is on the screen.

### Odyssey page

1. The owner's main website has an `/odyssey` route.
2. `/odyssey` shows the Odyssey season with the scroll-driven route map.

## Editor

The editor is a desktop canvas where the owner places each item by hand, then locks it. The page that visitors see is the same canvas without the controls.

### Canvas controls

1. Add an item: upload, paste text, paste a Spotify link, pick a sticker, search a place, record audio.
2. Drag to move. Handles to resize. A handle to rotate to any angle.
3. Hold Shift to keep the aspect ratio while resizing, and to rotate in 15° steps.
4. Layer order: bring forward, send backward, bring to front, send to back.
5. Lock an item. A locked item does not move, resize or rotate until the owner unlocks it.
6. Duplicate and delete an item.
7. Undo and redo (proposed: last 50 steps), kept as a stack of earlier season documents.
8. Change the canvas height and background.
9. Items can overlap and can extend past the canvas edge. The page cuts off parts outside the canvas.

Optional (build if time allows):

1. Arrow keys move the selected item 1 unit; Shift+arrow moves it 10 units.
2. Alignment guides while dragging, with a held key to turn them off.

### Desktop and mobile

1. A toggle switches the editor between the desktop canvas (1440 units) and the mobile canvas (390 units).
2. Content is shared. Placement is separate. A change to a quote's text shows in both layouts. A move in one layout does not change the other.
3. A new season's first mobile layout is the desktop layout scaled down to 390 units (about 0.27×), which keeps overlaps and composition. The owner then enlarges and moves items by hand.
4. A "Reset mobile layout" button offers two choices: scale the desktop layout down, or stack every item in a single column scaled to fit.
5. An item added after the mobile layout exists gets a starting mobile placement from the scaled desktop position.
6. The owner can hide an item on mobile.
7. A preview button shows each layout at real screen sizes.

### Saving

1. The editor saves the draft automatically after each change (proposed: 1 second after the last change).
2. Edits never go live on their own. **Publish** copies the draft into the published snapshot and refreshes the cache for that page.
3. **Discard changes** copies the published snapshot back into the draft.
4. The editor shows when the draft differs from the published snapshot.

## Public pages

Two public routes exist: the index and one page per season. Drafts are never public.

| Route | Shows | Notes |
| --- | --- | --- |
| `/seasons` | List of published seasons | Each entry: cover image, `// title`, period. Newest first; an optional `sort_order` pins a season to a position |
| `/seasons/[slug]` | One season canvas | Desktop or mobile layout by screen width |
| `/seasons/edit/...` | Editor | Owner only; requires passkey session |

### Season page rules

1. Title and subtitle are items on the canvas, so the owner can place them anywhere.
2. Images load lazily and in the size that fits the screen.
3. Each image has alt text for screen readers.
4. The page has share metadata (title, description, preview image from the cover).
5. A draft or unknown slug returns a 404 page.
6. Slug change: the old slug redirects to the new slug (proposed).
7. Optional: small "previous / next season" links at the bottom of the page.

## Source code and license

License: GNU AGPL-3.0 (`AGPL-3.0-only`). The full text is in [`LICENSE`](../LICENSE).

1. **Effect.** Anyone can use, change and share the code. A person who distributes a copy, changed or not, must share its source code under the same license.
2. **Hosted copies.** A person who changes Seasons and runs it as a website for others must offer those users the changed source code (section 13). This is the main reason to choose AGPL-3.0 over GPL-3.0 (the BookBox license): a web app is mostly run, not distributed.
3. **Commercial use.** AGPL-3.0 does not forbid sale or commercial use ([GNU: Selling Free Software](https://www.gnu.org/philosophy/selling)). Anyone may charge for a copy or a hosted service, but a changed version they run must still offer its source to its users. Forbidding sale outright would need a noncommercial license such as PolyForm Noncommercial, which is not open source; that option was rejected.
4. **Naming.** AGPL-3.0 is an open source license, so the README can say "open source".
5. **Source link.** As in BookBox, the app shows a "Seasons is open source" link. A `SOURCE_URL` constant points it at the fork's repository. Under AGPL-3.0 this link is the simplest way for a changed fork to meet section 13, so forks should keep it.
6. **Scope.** The license covers code only. Season content (photos, quotes, audio) lives in the database and storage, not in the repository.

### Fork requirements

1. A `.env.example` file lists every required variable: database URL, R2 keys and bucket names, setup token, site URL, source URL.
2. The README gives deploy steps for Vercel, one Postgres provider and Cloudflare R2.
3. The repository includes no personal content, no stickers and no real keys.
4. A seed command makes one demo season with placeholder items.

## Visual references and prior art

Prior seasons exist as Pinterest boards (called "moodboards" there). The reference board is "// leafy greens", 14 pins, subtitle "moodboard for… who knows, really?".

### What the board shows

1. Mostly flat-lay photos on white or pale gray backgrounds: leaves, a fern, pears, flowers on a string, a hand with a bouquet, ink-covered hands.
2. One typography pin (a large figure "8") and one line drawing (stairs and a face with the words "STAIRS" and "STARES").
3. One red envelope as the only strong color among soft greens and neutrals.
4. Title format: lowercase, prefixed with `//`.

### What Pinterest cannot do (the reason for the app)

1. The layout is a fixed masonry grid. Items cannot overlap, rotate or change size.
2. No music, quotes as text, voice notes or maps.
3. The board lives on Pinterest, not on the owner's site.

### Design implications

1. Default page background: near-white, so photo backgrounds blend into the page.
2. Title and subtitle styles must support the lowercase `//` format.
3. Further references are to be collected later (see open questions).

## Proposed scope by phase

Version 1 must replace one Pinterest board with one published season. Everything else waits.

| Phase | Features | Done when |
| --- | --- | --- |
| 1 | Passkey sign-in; season create, edit, draft, publish; photos, quotes, playlist card; desktop canvas with drag, rotate, resize, z-order, lock; season page at `/seasons/[slug]`; rewrite from main site | "leafy greens" is rebuilt and live on the owner's site |
| 2 | Mobile canvas and toggle; mobile preview; index page `/seasons`; share metadata | A phone shows a hand-placed mobile layout |
| 3 | Video; stickers and sticker library; voice notes; maps | All seven item types work |
| 4 | README, `.env.example`, seed demo; public repository | A second person deploys a fork from the README alone |
| Later | Spotify track list via Web API; Live Photos; slug redirects; undo history beyond one session | Decided case by case |

## Open questions

- [x] Media storage provider: Cloudflare R2.
- [x] Framework: keep Next.js.
- [x] Does Spotify oEmbed return data for playlist URLs? Yes (tested Nov 3, 2026).
- [x] Playlist card: cover, title and an owner-written caption. Track count waits for the Web API.
- [x] Saving: edits go live only after Publish.
- [x] Index page: cover, `// title`, period. Newest first, with optional manual pinning.
- [x] Map style: D3 vector outlines, no tiles, no API key.
- [x] Video: muted autoloop; sound on click. No GIF.
- [ ] Live Photos: needed? If yes, show as a short video or as a still?
- [ ] Quote fonts: EB Garamond and IBM Plex Mono decided; the sans-serif is still to pick.
- [x] Design units: 1440 / 390 widths, 960 px breakpoint (proposed), scale cap 1.25× (proposed).
- [x] License: AGPL-3.0. Sale is allowed; a changed hosted copy must offer its source.
- [ ] Route data format: GeoJSON, or a CSV export from Google Maps?
- [ ] Route map layout: a season is one canvas, so how does a fixed, scroll-driven map work inside it?
- [ ] Phase for the route map and `/odyssey`.
- [ ] Visual references beyond "leafy greens".
- [ ] Video compression: confirm size limits (1080 px, about 10 MB per 30 s) and whether to keep the original video in private storage.

## Sources

1. Spotify community: Iframe API theme option
2. Spotify: Using the oEmbed API
3. Spotify: oEmbed API reference
4. Spotify: February 2026 Web API Dev Mode changes
5. PolyForm Noncommercial License 1.0.0
6. SPDX: PolyForm-Noncommercial-1.0.0
7. SPDX license list data (OSI status)
8. Open Source Initiative: The Open Source Definition (annotated)
9. [choosealicense.com: GPL-3.0](https://choosealicense.com/licenses/gpl-3.0/)
10. [GNU: Selling Free Software](https://www.gnu.org/philosophy/selling)
11. [BookBox repository](https://github.com/helenvholmes/bookbox)
12. [choosealicense.com: AGPL-3.0](https://choosealicense.com/licenses/agpl-3.0/)

## Decision log

**Nov 3, 2026**

1. Each season is one JSON document per row, with a draft copy and a published snapshot. Edits go live only on Publish.
2. A season is one canvas. No sections.
3. Maps are D3 vector outlines. No tile maps.
4. HEIC converts to JPEG and video is compressed in the browser. Videos loop silently; only audio autoplay is a non-goal. GIF is not accepted.
5. Mobile breakpoint raised to 960 px (proposed); scale capped at 1.25× (proposed).
6. The first mobile layout is the scaled-down desktop layout; a reset button offers scaled or single-column.
7. Storage: Cloudflare R2. Framework: Next.js. Playlist card gets an owner caption. Index: newest first with optional pinning. Quote fonts: EB Garamond, IBM Plex Mono, one sans-serif. Passkey recovery: setup token.
8. License: AGPL-3.0.
9. Optional extras: voice-note waveform, arrow-key nudging, alignment guides, previous/next season links.

**Nov 3, 2026 (phase 1 build)**

1. Spotify oEmbed returns title and cover for playlist URLs.
2. Passkey registration needs either a signed-in session or the unused setup token, also for the first passkey. ("When no passkey exists" alone would let a stranger claim a fresh fork.)
3. The title and subtitle are quote items set to show the season title or subtitle.
4. Phase 1 shows the desktop layout at every screen width, scaled to fit. The mobile layout arrives in phase 2.
