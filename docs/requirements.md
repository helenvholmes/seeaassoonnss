# Seasons — Requirements

Oct 28, 2026 · @Dbeueudvdbd Djeisisheneke

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
6. Autoplay of any audio or video.
7. Music services other than Spotify.
8. Photo import from cloud services. Upload is from the device only.
9. Native mobile apps.

## Architecture and stack

Seasons is a separate Vercel project. The main website forwards `/seasons/*` to it, so visitors stay on the owner's domain. Items marked "proposed" are open for change.

Visitors reach season pages through the main site's rewrite. The owner uses the editor only after passkey sign-in. Only the Seasons app talks to the database, storage and Spotify.

| Part | Choice | Status |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Proposed (owner is not attached to Next.js) |
| Hosting | Vercel, separate project from the main site | Decided |
| URL | Main site rewrites `/seasons/:path*` to the Seasons deployment; Seasons sets `basePath: "/seasons"` | Proposed |
| Database | Hosted Postgres with a free tier (for example Neon) | Proposed |
| Media storage | External object storage (Cloudflare R2 or Vercel Blob) | Decided: external; provider open |
| Sign-in | Passkey (WebAuthn), one owner | Decided |
| Image processing | Server-side resize and convert on upload (for example sharp) | Decided: compress on upload |
| Editor canvas | Client-side drag, rotate, resize library (for example react-moveable) | Proposed |

### Backend scope

A small backend is acceptable. It does these tasks only:

1. Passkey registration and sign-in.
2. Signed upload URLs for media storage.
3. Image and video processing after upload.
4. Read and write of season data.
5. Server-side fetch of Spotify playlist data (see [Item types](#item-types)).
6. Cache refresh of a public page after the owner saves.

### Passkey rules

1. The app accepts passkey registration only when no passkey exists, or when the request includes a one-time setup token from an environment variable. This stops a stranger from claiming a new fork first.
2. The owner can register a second passkey (for example a phone) as a backup.
3. A session cookie (HTTP-only, secure) keeps the owner signed in.
4. All write routes require a valid session. All public routes are read-only.

### Image processing

1. Accept JPEG, PNG, HEIC, WebP and GIF.
2. Make three widths (proposed: 640, 1280 and 2048 px) in WebP or AVIF.
3. Remove all metadata (EXIF, GPS) before storage. Location data must not be public.
4. Keep the original file in private storage (proposed) so new sizes can be made later.

### Public page delivery

The server renders each season page and caches it. A save in the editor refreshes the cache for that page only.

## Data model

A season holds items. Each item has content plus two placements: one for desktop, one for mobile.

### Season

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | Internal |
| `slug` | text, unique | URL part: `/seasons/[slug]` |
| `title` | text | Example: "leafy greens" |
| `subtitle` | markdown | Short description. Example: "moodboard for… who knows, really?" |
| `period` | free text | Owner sets any words. Example: "fall 2026" or "after the move" |
| `status` | `draft` or `published` | Drafts are not public |
| `cover_item_id` | item reference | Image for the index page |
| `background` | color or image reference | Page background |
| `desktop_height` | number | Canvas height in design units |
| `mobile_height` | number | Canvas height in design units |
| `created_at`, `updated_at` | timestamp | |

### Item

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `season_id` | season reference | |
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

### Design units (explains question 11)

A screen can be any width. The app must decide what happens to the layout when the screen is wider or narrower than the editor screen. Proposed rule:

1. The desktop canvas is always 1440 units wide. The mobile canvas is always 390 units wide.
2. The page scales the whole canvas to fit the screen width. A 1440-unit layout on a 1200 px screen shows at 83% size. Positions and overlaps stay exactly as placed.
3. Screens narrower than a breakpoint (proposed: 768 px) show the mobile layout. Wider screens show the desktop layout.
4. Canvas height is free. The owner sets it, and the page scrolls down.

The alternative is a canvas that changes shape with the screen. That alternative moves items relative to each other, which breaks hand-placed overlaps. It is not recommended.

## Item types

Seven item types are in scope. No item plays sound or video until a visitor clicks it.

| Type | Input | Content stored | Display |
| --- | --- | --- | --- |
| Photo | Upload from device, 10–25 per season | Image sizes, alt text, original aspect ratio | Image; optional crop inside its box |
| Video | Upload (MP4, MOV, WebM); GIF converts to video | Video file, poster frame | Poster frame; plays on click |
| Quote | Markdown text, optional source line | Markdown, source | Text box; owner picks from a few preset fonts |
| Playlist | Link to an existing Spotify playlist | Playlist URL, title, cover image | Custom card (see below) |
| Sticker | Upload transparent PNG, WebP or SVG; reuse from a sticker library | Image, library reference | Image with transparent background |
| Map | Place search or coordinates | Latitude, longitude, zoom, label | Map image (see open questions) |
| Voice note | Record in the browser or upload audio | Audio file, duration, optional caption | Small player; plays on click |

**Quote rules.** Markdown only: bold, italic, links, line breaks. No raw HTML. Quotes can come from any source: own writing, lyrics, books, messages.

**Sticker library.** Each uploaded sticker goes into a library for reuse in any season. The repository can ship with no stickers, so forks start empty.

### Spotify playlist: limits and proposal

1. The standard Spotify embed is an iframe. Its own options are size and a color theme (Spotify community, Iframe API theme). The app cannot change the styles inside the iframe.
2. The Spotify oEmbed endpoint returns a title, a thumbnail image and the embed code for a Spotify URL, with no sign-in (Spotify oEmbed guide). The reference lists shows, episodes, artists, albums and tracks (oEmbed reference). Playlist support must be tested before the build.
3. A full track list needs the Spotify Web API. Since February 2026, a Development Mode app needs the app owner to have Spotify Premium, and playlist items are available only for playlists the user owns or collaborates on (Spotify migration guide).

**Proposed for version 1:** the server gets title and cover image through oEmbed. The page shows a custom-styled card with that data. A click on the card opens the standard Spotify embed in place (or opens Spotify). The track list via the Web API is a later phase.

## Scroll-driven route map

A route map is an optional mode of the Map item. The map stays fixed on the screen while text and photos scroll next to it or over it. The route line draws in as the reader scrolls.

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
7. Undo and redo (proposed: last 50 steps).
8. Change the canvas height and background.
9. Items can overlap and can extend past the canvas edge. The page cuts off parts outside the canvas.

### Desktop and mobile

1. A toggle switches the editor between the desktop canvas (1440 units) and the mobile canvas (390 units).
2. Content is shared. Placement is separate. A change to a quote's text shows in both layouts. A move in one layout does not change the other.
3. A new item gets a starting mobile placement (proposed: stacked in a single column, scaled to fit). The owner then moves it by hand.
4. The owner can hide an item on mobile.
5. A preview button shows each layout at real screen sizes.

### Saving

1. The editor saves automatically after each change (proposed: 1 second after the last change).
2. A published season updates on the public page after each save. Proposed alternative: changes stay private until the owner clicks Publish again. See open questions.

## Public pages

Two public routes exist: the index and one page per season. Drafts are never public.

| Route | Shows | Notes |
| --- | --- | --- |
| `/seasons` | List of published seasons | Entry content is open (see open questions); proposed: cover image, title, period text |
| `/seasons/[slug]` | One season canvas | Desktop or mobile layout by screen width |
| `/seasons/edit/...` | Editor | Owner only; requires passkey session |

### Season page rules

1. Title and subtitle are items on the canvas, so the owner can place them anywhere.
2. Images load lazily and in the size that fits the screen.
3. Each image has alt text for screen readers.
4. The page has share metadata (title, description, preview image from the cover).
5. A draft or unknown slug returns a 404 page.
6. Slug change: the old slug redirects to the new slug (proposed).

## Source code and license

License: GNU GPL-3.0 (`GPL-3.0-only`), the same license as BookBox.

1. **Effect.** Anyone can use, change and share the code. A person who distributes a copy, changed or not, must share its source code under the same license.
2. **Commercial use.** GPL-3.0 does not forbid sale or commercial use ([GNU: Selling Free Software](https://www.gnu.org/philosophy/selling)).
3. **Hosted copies.** GPL-3.0 requires source only on distribution. A person who changes Seasons and only runs it as a website does not have to share the changes. AGPL-3.0 closes that gap.
4. **Naming.** GPL-3.0 is an open source license, so the README can say "open source".
5. **Source link.** As in BookBox, the app shows a "Seasons is open source" link. A `SOURCE_URL` constant points it at the fork's repository.
6. **Scope.** The license covers code only. Season content (photos, quotes, audio) lives in the database and storage, not in the repository.

### Fork requirements

1. A `.env.example` file lists every required variable: database URL, storage keys, setup token, site URL.
2. The README gives deploy steps for Vercel plus one database and one storage provider.
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
3. Further references are to be collected later (question 20).

## Proposed scope by phase

Version 1 must replace one Pinterest board with one published season. Everything else waits.

| Phase | Features | Done when |
| --- | --- | --- |
| 1 | Passkey sign-in; season create, edit, draft, publish; photos, quotes, playlist card; desktop canvas with drag, rotate, resize, z-order, lock; season page at `/seasons/[slug]`; rewrite from main site | "leafy greens" is rebuilt and live on the owner's site |
| 2 | Mobile canvas and toggle; mobile preview; index page `/seasons`; share metadata | A phone shows a hand-placed mobile layout |
| 3 | Video and GIF; stickers and sticker library; voice notes; maps | All seven item types work |
| 4 | README, `.env.example`, seed demo, license file; public repository | A second person deploys a fork from the README alone |
| Later | Spotify track list via Web API; Live Photos; slug redirects; undo history beyond one session | Decided case by case |

## Open questions

- [ ] Media storage provider: Cloudflare R2 or Vercel Blob?
- [ ] Framework: keep Next.js, or change?
- [ ] Does Spotify oEmbed return data for playlist URLs? Test one playlist before the build.
- [ ] Playlist card: what does it show (cover, title, owner name, track count)? Track count needs the Web API.
- [ ] Saving: do edits to a published season go live at once, or only after Publish?
- [ ] Index page: what does each entry show? Order: newest first, or manual?
- [ ] Map style: static image or interactive map? Which tile provider (most need an API key)?
- [ ] Video: play on click only, or allow a silent loop?
- [ ] Live Photos: needed? If yes, show as a short video or as a still?
- [ ] Quote fonts: which preset fonts?
- [ ] Design units: accept 1440 / 390 widths and a 768 px breakpoint?
- [ ] License: decided, GPL-3.0.
- [ ] License conflict: a new requirement says the license must prevent other people from charging for or selling the software. GPL-3.0 (BookBox) permits sale. Keep GPL-3.0, or change to a noncommercial license (for example PolyForm Noncommercial 1.0.0, which is not OSI open source)?
- [ ] Route data format: GeoJSON, or a CSV export from Google Maps?
- [ ] Route map layout: a full-screen scroll section inside a season, or a separate page type? The fixed map does not fit the free-form canvas.
- [ ] Phase for the route map and `/odyssey`.
- [ ] Visual references beyond "leafy greens" (question 20).

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
