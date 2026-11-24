# seeaassoonnss — Requirements

Oct 28, 2026 · @Dbeueudvdbd Djeisisheneke · Updated Nov 9, 2026 (see [Decision log](#decision-log))

## Overview

seeaassoonnss is a single-author web app. It records one period of life as one public page of photos, video, quotes, a Spotify playlist and other items in a free-form layout.

1. **Name:** seeaassoonnss ("seasons" with each letter after the first doubled; renamed from Seasons on Nov 10 for the domain seeaassoonnss.app). One page is a season. (Earlier Pinterest versions used the word "moodboard".)
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
2. Automatic layout generation without the owner's control. (Seeded random placement that the owner starts, reseeds and locks is in scope; see [Generative and 3D layer](#generative-and-3d-layer).)
3. Photo effects: filters, grain, torn edges, tape. (Motion is limited to the effects in [Generative and 3D layer](#generative-and-3d-layer).)
4. Export to image, PDF, video or print. The URL is the only output.
5. Reading photo metadata (date, place) for layout.
6. Autoplay of audio. (Videos loop silently; see [Item types](#item-types).)
7. Music services other than Spotify.
8. Photo import from cloud services. Upload is from the device only.
9. Native mobile apps.
10. Interactive maps or map tiles.

## Architecture and stack

seeaassoonnss is a separate Vercel project. The main website forwards `/seasons/*` to it, so visitors stay on the owner's domain. Items marked "proposed" are open for change.

Visitors reach season pages through the main site's rewrite. The owner uses the editor only after passkey sign-in. Only the seeaassoonnss app talks to the database, storage and Spotify.

| Part | Choice | Status |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Decided |
| Hosting | Vercel, separate project from the main site | Decided |
| URL | Main site rewrites `/seasons/:path*` to the seeaassoonnss deployment; seeaassoonnss sets `basePath: "/seasons"` | Proposed |
| Database | Hosted Postgres with a free tier (for example Neon); one JSON document per season | Proposed |
| Media storage | Cloudflare R2: a public bucket for processed media, a private bucket for originals | Decided |
| Sign-in | Passkey (WebAuthn), one owner | Decided |
| Media processing | In the browser: HEIC to JPEG, video compression. On the server: image resize and metadata removal (for example sharp) | Decided |
| Editor canvas | Client-side drag, rotate, resize library (for example react-moveable) | Proposed |
| Maps | D3 and TopoJSON vector outlines; no tile provider, no API key | Decided |
| Generative 2D | p5.js 2.x, global mode, in a sandboxed iframe; served from the app | Decided (phase 6) |
| 3D | React Three Fiber and three.js; glTF binary (`.glb`) models compressed with glTF Transform and meshopt | Decided (phase 6) |

### Backend scope

A small backend is acceptable. It does these tasks only:

1. Passkey registration and sign-in.
2. Signed upload URLs for media storage.
3. Image and 3D model processing after upload (video is compressed in the browser).
4. Read and write of season data.
5. Server-side fetch of Spotify playlist data (see [Item types](#item-types)).
6. Cache refresh of a public page after the owner saves.
7. The owner's p5.js sketch library (read and write).
8. Serving p5.js to sketch frames.

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

Other small tables: `stickers` (the sticker library), `sketches` (the p5.js sketch library) and `passkeys`.

The document shapes follow.

### Season document

| Field | Type | Notes |
| --- | --- | --- |
| `title` | text | Example: "leafy greens" |
| `subtitle` | markdown | Short description. Example: "moodboard for… who knows, really?" |
| `period` | free text | Owner sets any words. Example: "fall 2026" or "after the move" |
| `cover_item_id` | item reference | Image for the index page |
| `background` | color, image reference, or (proposed) 3D scene or p5.js sketch | Page background |
| `month` | `YYYY-MM` or empty | Optional month the season belongs to. Orders the index |
| `desktop_height` | number | Minimum page length in design units. The page grows to fit its lowest item |
| `mobile_height` | number | Minimum page length in design units. The page grows to fit its lowest item |
| `mobile_layout` | boolean | False only for seasons made before phase 2; they show the scaled desktop layout on mobile until opened in the editor |
| `backgroundLayer` | 3D model, p5.js sketch, or empty | Behind all items. A sketch layer holds its own copy of the code |
| `scatter` | seed, minimum scale, maximum scale | Last random layout settings (see [Generative and 3D layer](#generative-and-3d-layer)) |
| `items` | list of items | See below |

### Item

| Field | Type | Notes |
| --- | --- | --- |
| `id` | UUID | |
| `type` | enum | `photo`, `video`, `quote`, `playlist`, `sticker`, `map`, `voice_note`, `route`, `model_3d`, `shape` |
| `content` | JSON | Different per type (see [Item types](#item-types)) |
| `desktop` | placement | Position on the desktop canvas |
| `mobile` | placement or empty | Empty = item is not shown on mobile |
| `follow` | number 0–1, optional | Cursor follow strength |

### Placement

| Field | Type | Notes |
| --- | --- | --- |
| `x`, `y` | number | Top-left corner, in design units |
| `w`, `h` | number | Size, in design units |
| `rotation` | number | Degrees, any value |
| `z` | integer | Layer order; higher is in front |
| `locked` | boolean | Locked items cannot move by accident in the editor |
| `textSize` | number, optional | Quote text size in this canvas's units. Used by the mobile layout; desktop uses the size in the quote content |

### Design units

A screen can be any width. The app must decide what happens to the layout when the screen is wider or narrower than the editor screen. Proposed rule:

1. The desktop canvas is always 1440 units wide. The mobile canvas is always 390 units wide.
2. The page scales the whole canvas to fit the screen width. A 1440-unit layout on a 1200 px screen shows at 83% size. Positions and overlaps stay exactly as placed.
3. Screens narrower than a breakpoint (proposed: 960 px) show the mobile layout. Wider screens show the desktop layout. (At 768 px the desktop layout would show at only 53% size.)
4. Scale is capped (proposed: 1.25×). On wider screens the canvas is centered and the background fills the sides. This keeps the 2048 px image size sharp.
5. A page has no length limit. It grows to fit its lowest item (rotated corners included), and visitors scroll. The owner can set a minimum length.

The alternative is a canvas that changes shape with the screen. That alternative moves items relative to each other, which breaks hand-placed overlaps. It is not recommended.

## Item types

Eight item types are in scope. The route map is a separate item type (see [Scroll-driven route map](#scroll-driven-route-map)). No item plays sound until a visitor clicks it. Videos loop silently.

| Type | Input | Content stored | Display |
| --- | --- | --- | --- |
| Photo | Upload from device (JPEG, PNG, HEIC, WebP), 10–25 per season | Image sizes, alt text, original aspect ratio | Image; optional crop inside its box |
| Video | Upload (MP4, MOV, WebM); no GIF | Compressed MP4, poster frame | Plays muted on loop; sound only on click. With reduced motion turned on, shows the poster frame until clicked (proposed) |
| Quote | Markdown text, optional source line | Markdown, source | Text box; owner picks from a few preset fonts |
| Playlist | Link to an existing Spotify playlist or a single song (track) | URL, kind (playlist or song), title, cover image, owner caption | Custom card (see below) |
| Sticker | Upload transparent PNG, WebP or SVG; reuse from a sticker library | Image, library reference | Image with transparent background |
| Map | Place search or coordinates | Latitude, longitude, zoom, label | Vector outline drawn with D3 and TopoJSON, a dot and a label; no tiles |
| Voice note | Record in the browser or upload audio | Audio file, duration, optional caption, waveform (optional) | Small player; plays on click |
| 3D model | Upload a glTF binary file (`.glb`), up to 50 MB | Compressed model file, size, scale, rotation (x, y, z), spin speed, turn toward cursor on or off, play animation on or off, poster image, alt text | 3D view in its box (React Three Fiber); poster image while loading and if WebGL is not available |
| Shape | Pick from the Shapes panel: square, rounded square, circle, triangle, diamond, pentagon, hexagon, star, heart, arrow | Shape, fill color or none, outline color and width | SVG that stretches to fill its box; the outline keeps its width |

**Quote rules.** Markdown only: bold, italic, links, line breaks. No raw HTML. Quotes can come from any source: own writing, lyrics, books, messages. Preset fonts: EB Garamond (serif), IBM Plex Mono (monospace) and one plain sans-serif (to be picked). Each must look right in lowercase with the `//` prefix.

**Map rules.** Maps are vector outlines, not tile maps. No map provider account or API key is needed, so forks need no setup for maps. The route map can reuse the same Natural Earth outlines.

**Sticker library.** Each uploaded sticker goes into a library for reuse in any season. The repository can ship with no stickers, so forks start empty.

**Sticker packs (added Nov 9).** The editor also offers four built-in packs of free illustrations: botanical plates (CC0 / public-domain prints from the Cleveland Museum of Art and the Art Institute of Chicago, cut out of their paper), Open Doodles, Open Peeps and Humaaans (Pablo Stanley; CC0 or free for any use). They live in `public/sticker-packs/` with a manifest in `src/lib/sticker-packs.json` and credits in `public/sticker-packs/CREDITS.md`. Picking one uploads it like any sticker, so it joins the owner's library and storage; adding it again reuses that copy. unDraw was considered and left out: its license forbids redistributing its illustrations as packs.

### Spotify playlist: limits and proposal

1. The standard Spotify embed is an iframe. Its own options are size and a color theme (Spotify community, Iframe API theme). The app cannot change the styles inside the iframe.
2. The Spotify oEmbed endpoint returns a title, a thumbnail image and the embed code for a Spotify URL, with no sign-in (Spotify oEmbed guide). The reference lists shows, episodes, artists, albums and tracks (oEmbed reference). **Tested Nov 3, 2026: playlist URLs work** and return `title`, `thumbnail_url` and `iframe_url`. **Tested Nov 9, 2026: track URLs work the same way**; the title is the song name only, with no artist, so the owner can put the artist in the caption.
3. A full track list needs the Spotify Web API. Since February 2026, a Development Mode app needs the app owner to have Spotify Premium, and playlist items are available only for playlists the user owns or collaborates on (Spotify migration guide).

**Decided for version 1:** the server gets title and cover image through oEmbed. oEmbed gives no owner name or track count, so the owner types an optional caption instead (for example "for walking home"). The page shows a custom-styled card with that data. A click on the card opens the standard Spotify embed in place (or opens Spotify). The track list via the Web API is a later phase.

## Scroll-driven route map

A route map is an optional mode of the Map item. The map stays fixed on the screen while text and photos scroll next to it or over it. The route line draws in as the reader scrolls.

Odyssey is built with seeaassoonnss: it is one season, and the route map is part of its page. A season is one canvas, and a page now grows without a length limit, so the route map has to work as part of that canvas. How it does is an open question (see Open questions).

### References

1. Visual: "The Russia Left Behind," *The New York Times*, October 2013 (producers: Mike Bostock, Shan Carter, Leslye Davis). Longform permalink.
2. Technical: OpenNews Source — Animating Maps with D3 and TopoJSON.

### Behavior

1. **Layout:** the map stays fixed on the screen. Text and photos scroll next to it or over it.
2. **Route drawing:** when the reader scrolls down, the route line draws in. When the reader scrolls up, the line pulls back.
3. **Method:** draw two copies of the same route path in two colors, one on top of the other. Set the top path's `stroke-dasharray` in proportion to scroll progress through the map section.
4. **Steps tied to places:** each content section links to a place on the route. When a section comes into view, the map moves to that place and highlights it.
5. **Reduced motion:** when the reader has reduced motion turned on, show the full route immediately with no animation.
6. **Follow roads (added Nov 15).** A button in the route settings replaces the straight lines between stops with the driving route through them, from the public OSRM server on OpenStreetMap data (no key). Only the owner's editor asks for it; the path is saved with the route, so readers never call the service. The path is the fastest route, so a stop placed on a road the owner took pulls the line onto it. Adding or moving stops leaves the saved path as it is until the owner follows roads again.
7. **Line-only style (added Nov 15).** A style setting shows only the route line on the page's own background, with no land, grey base line, stop dots or place label, as in "The Russia Left Behind". Linked items still move the map to their stop.
8. **Place names, rotation, line thickness (added Nov 15).** In either style, place names can sit along the line; each fades in when the line reaches it and the current one is bold (they replace the corner label). The map can be turned (−180° to 180°): the route is fitted to the frame at that angle and the land is drawn turned to match, so a route can run up and down a tall band as the railway does in "The Russia Left Behind". The line thickness can be set from 1 to 16 pixels.
9. **Line-only look after the Times (added Nov 15).** By default the route ahead shows as a thin grey dashed line with grey stop dots; place names stay hidden until the line reaches them and then softly enter (fade in, rise a little, come into focus), and the current stop has a black dot. The drawn line is slightly see-through, and names are set in a sans-serif. "The route ahead: hidden" keeps the earlier draw-in-from-nothing look. Names can sit on the left or right of the stops, and the map is fitted with room for them on that side. The Times map runs straight down because it is turned about 40° from north.
10. **Follow railway (added Nov 15).** Next to Follow roads, Follow railway makes the line run along train tracks between stops, from the public BRouter server's rail profile (OpenStreetMap data, no key). Stops should be stations on the line taken: a town on a branch line becomes a spur out and back. The route remembers which it last followed.
11. **Place names and the band in the editor (added Nov 15).** Place names are set in Inter, regular weight with no outline, at a size that grows with the line. Each name sits wherever it covers the least of the line, the stops and the other names, inside the frame; the map leaves equal room on opposite sides so the route stays centered. In the editor the map preview sits in the middle of the band, and a scale down its left edge shows, at mid-screen, where the line starts drawing, where it reaches each stop and where it is complete; the striped parts above and below are where the map scrolls in and out.

### Editor zoom and pan (added Nov 15)

The page is a labeled frame on a larger artboard. Zoom with a trackpad pinch, ⌘/Ctrl + scroll, ⌘+ / ⌘−, or the controls in the stage's corner (which show the real size, 100% = one design unit per pixel); ⌘0 or Fit fits the page to the stage's width. The point under the pointer stays put while zooming. Pan by scrolling (Shift + scroll for sideways), or by holding Space or the middle mouse button and dragging. Zoom is desktop-only; small screens keep the fitted page.

### Data and tools

1. **Input:** an ordered list of places (name, latitude, longitude). One possible source: the owner's Odyssey list in Google Maps.
2. **Suggested tools:** D3 for the map and line. Scrollama (or an equal library) to detect which section is on the screen.

### Odyssey page

1. Odyssey is a season in seeaassoonnss, for example at `/seasons/odyssey`.
2. The owner's main website has an `/odyssey` route that shows that season with the scroll-driven route map, through a rewrite or redirect to the season page.

## Generative and 3D layer

seeaassoonnss uses p5.js for 2D generative backgrounds and React Three Fiber for 3D. Spline is not a requirement. All 3D models use the open glTF format, so a fork does not need a paid tool. Built in phase 6.

### Effects

1. **Random placement:** the editor places every unlocked item of the current layout (desktop or mobile) at a random position. A seed keeps the same layout; the owner can change the seed, and lock the items to keep. Route maps and hidden items do not move. Items spread over the minimum page length, and further when they would cover more than 35% of it, so a season with many items gets a longer page instead of a pile. A Shuffle button in the editor bar scatters with a new seed.
2. **Random scale:** photos, videos, stickers, shapes and 3D models get a random width between a minimum and a maximum that the owner sets, as a multiple of the width a new photo gets (360 desktop units, 180 mobile). Aspect ratios and rotations are kept. Quotes, playlists and maps keep their size.
3. **Background objects:** one 3D model or one p5.js sketch can be the season background, behind all items. It fills the screen and stays there while the page scrolls.
4. **Cursor follow:** any item can drift toward the cursor (strength 0–100%, at most 40 design units). 3D models can also turn toward it. On touch devices, the "cursor" moves down the screen with the scroll position.
5. **Type:** quotes can use one of four effects: letters move away from the cursor (repel), ripple as the page scrolls (wave), start scattered and gather as the quote reaches the middle of the screen (gather), or type in one at a time behind a blinking caret the first time the quote scrolls into view (typewriter).
6. **Embedded 3D items:** a 3D model is an item on the canvas. It has position, size, rotation and z-order, the same as other items. Inside its box it can be scaled, tilted, turned and rolled, spin slowly, and play its own animation.

### Tools

1. **p5.js 2.x** in a sandboxed iframe (`sandbox="allow-scripts"`, `srcdoc`), in p5's global mode, so sketches can be pasted from the p5.js web editor. The iframe gives stronger isolation than instance mode inside a React component: the sketch runs in an opaque origin and cannot read the page, the owner's session cookie or storage, or call the app's API as the owner. p5.js is served from the deployment itself (`/seasons/vendor/p5.min.js`), not a CDN.
2. **React Three Fiber** (`@react-three/fiber`) with three.js's own GLTFLoader and meshopt decoder. drei is not used: nothing in it was needed, and leaving it out keeps the bundle smaller.
3. **Generative type** uses DOM and CSS, not p5: each letter is its own element. The text stays real text, a plain copy is kept for screen readers, and fonts render as everywhere else on the page.
4. **Models:** glTF binary files (`.glb`), compressed on upload with glTF Transform and meshopt (see [3D model compression](#3d-model-compression)), kept in media storage.

### Rules

1. **Reduced motion:** when the visitor's system has "reduce motion" on, effects stop and items stay in their seeded positions. Sketches draw one frame and stop. 3D models stand still.
2. **Performance:** p5.js and 3D code load only on seasons that use them (three.js comes in a separate chunk; the season page without it is 152 kB on first load). One background per season. At most 6 model items per season, because each live model needs a WebGL context and browsers allow about 16. A model's live view starts only near the screen and is removed far from it, which frees its context.
3. **Fallback:** if WebGL is not available, or a model fails to load, its poster image shows. The poster is drawn in the editor's browser with the same camera and light as the live view.
4. **Phones:** 3D backgrounds and items run on phones too (decided Nov 9), at a pixel ratio of at most 2.
5. **Sketches belong to the owner.** Sketches are code that the owner writes or pastes. They live in the owner's own database: a sketch library for reuse, and a copy inside each season that uses one, so editing a library sketch never changes a published page until it is chosen again and published. The repository ships three example sketches (`src/lib/demo-sketches.ts`), which the demo season adds to the library.

### 3D model compression

Measured on Nov 9, 2026 with five Khronos glTF sample models, rendered with three.js before and after at 600 × 600 px. "Changed pixels" are pixels whose color moved by more than 16 of 255 on any channel; PSNR above about 40 dB is generally invisible.

| Model | Original | Textures | 2048 px + meshopt | Changed pixels | 1024 px + meshopt | Changed pixels |
| --- | --- | --- | --- | --- | --- | --- |
| DamagedHelmet | 3.6 MB | 3.1 MB (5 × 2048 px) | 1.7 MB (−52%) | 0.15% (42 dB) | 0.66 MB (−82%) | 1.0% (38 dB) |
| Lantern | 9.1 MB | 8.9 MB (4 × 2048 px) | 1.2 MB (−87%) | 0.02% (51 dB) | 0.37 MB (−96%) | 0.03% (49 dB) |
| BoomBox | 10.1 MB | 9.9 MB (4 × 2048 px) | 0.62 MB (−94%) | 1.0% (35 dB) | 0.23 MB (−98%) | 2.5% (30 dB) |
| Avocado | 7.7 MB | 7.7 MB (3 × 2048 px) | 0.22 MB (−97%) | 0.02% (48 dB) | 0.08 MB (−99%) | 0.02% (46 dB) |
| Fox (animated) | 0.16 MB | 0.03 MB (1024 px) | 0.11 MB (−31%) | 0.14% (48 dB) | 0.11 MB | 0.14% (48 dB) |

What this shows:

1. **Textures are the file.** In four of five models, textures were 85–99% of the bytes. Geometry compression alone (meshopt, textures untouched) saved only 1–9% on those four.
2. **2048 px WebP textures look the same** as the originals at page size. Differences are a few pixels on fine, high-contrast detail (BoomBox's speaker grille).
3. **1024 px textures** cut the file by another two thirds. Fine detail softens when the model is large on screen or zoomed in (helmet visor lines, grille); small items look the same.
4. **Geometry**: meshopt stores positions in 14 bits per axis (a grid of about 0.06 mm on a model 1 m across), normals in 10 bits and texture coordinates in 12. No change was visible on any model. Animated and skinned models (Fox) keep working.
5. **Draco** gave files within about 10% of meshopt. Meshopt was chosen because its decoder is about 20 KB of JavaScript bundled with the app, while Draco's is about 300 KB of WebAssembly that three.js loads from a CDN by default, and decodes slower.

**Decided (Nov 9):**

1. Every model is compressed on upload: textures to WebP (quality 85), at most 2048 px by default; geometry with meshopt; unused data removed; redundant animation keyframes dropped. Re-encoding textures also removes any EXIF or GPS data inside embedded JPEG textures.
2. The owner can pick 1024 px textures per upload, for small items or backgrounds that do not need the detail.
3. The original upload is kept in the private bucket, so a model can be processed again with other settings.
4. Upload limit 50 MB. After compression, the editor shows the size before and after, and warns above 5 MB that the page will load slowly on phones.
5. Draco-compressed uploads are accepted (decoded on the server and re-packed with meshopt). KTX2 (Basis) textures are left as they are.

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
2. Built: snapping while dragging and resizing, to the page edges, center and end, and to other items' edges and centers, with guide lines. A Snap button turns it off (remembered per browser); holding ⌘ or Ctrl skips it for one move.
3. Built: hold Alt (Option) to measure, as in Figma. It shows distances from the selected item to the page edges or to the item under the pointer, and a center line that marks when the selection is centered on the page or on that item.

### Desktop and mobile

1. A toggle switches the editor between the desktop canvas (1440 units) and the mobile canvas (390 units).
2. Content is shared. Placement is separate. A change to a quote's text shows in both layouts. A move in one layout does not change the other.
3. A new season's first mobile layout is the desktop layout scaled down to 390 units (about 0.27×), which keeps overlaps and composition. The owner then enlarges and moves items by hand.
4. A "Reset mobile layout" button offers two choices: scale the desktop layout down, or stack every item in a single column scaled to fit.
5. An item added after the mobile layout exists gets a starting mobile placement from the scaled desktop position.
6. **Automatic mobile layout (added Nov 15).** New seasons build their mobile layout from desktop and rebuild it after every change. Items that sit side by side on desktop are read as one row; rows go top to bottom and items in a row left to right. Big items go full width; small ones (under 400 desktop units wide) pair up two per line. A sticker or shape sitting mostly on a bigger item stays attached to it. Items beside a route map go inside its band, below the pinned map. Moving, resizing, hiding or resetting anything on mobile turns the automatic layout off; undo turns it back on, and a checkbox in the mobile settings turns it on again. Seasons from before Nov 15 switch to it the next time they are opened in the editor; one undo restores the hand-made layout with the setting off. The published page changes only when the season is published again.
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
| `/seasons/about` | Landing page for the project | What the app is, a sample season visitors can drag about, and how to run a copy. Static; no database. With `LANDING_PAGE=on`, `/` redirects to it. On seeaassoonnss.app, `vercel.json` serves it at `/` and `/about` and redirects `/seasons/about` to `/about` |
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
2. **Hosted copies.** A person who changes seeaassoonnss and runs it as a website for others must offer those users the changed source code (section 13). This is the main reason to choose AGPL-3.0 over GPL-3.0 (the BookBox license): a web app is mostly run, not distributed.
3. **Commercial use.** AGPL-3.0 does not forbid sale or commercial use ([GNU: Selling Free Software](https://www.gnu.org/philosophy/selling)). Anyone may charge for a copy or a hosted service, but a changed version they run must still offer its source to its users. Forbidding sale outright would need a noncommercial license such as PolyForm Noncommercial, which is not open source; that option was rejected.
4. **Naming.** AGPL-3.0 is an open source license, so the README can say "open source".
5. **Source link.** As in BookBox, the app shows a "seeaassoonnss is open source" link. A `SOURCE_URL` constant points it at the fork's repository. Under AGPL-3.0 this link is the simplest way for a changed fork to meet section 13, so forks should keep it.
6. **Scope.** The license covers code only. Season content (photos, quotes, audio) lives in the database and storage, not in the repository.

### Fork requirements

1. The public bucket's CORS rule allows `GET` as well as `PUT` from the site, so pages can load 3D models. `npm run doctor` checks it.
2. A `.env.example` file lists every required variable: database URL, R2 keys and bucket names, setup token, site URL, source URL.
3. The README gives deploy steps for Vercel, one Postgres provider and Cloudflare R2.
4. The repository includes no personal content, no stickers, no model files and no real keys.
5. A seed command makes one demo season with placeholder items, including a 3D model built by the script, a type effect, cursor follow and a sketch background, and adds three example sketches to the sketch library.
6. **Who runs a copy.** seeaassoonnss stays single-owner. The owner may run copies for friends or family; each of them gets their own deployment (own database, storage and passkey), not an account on the owner's. Anyone else forks the repository.
7. **Public demo.** As with BookBox, a demo deployment shows what seeaassoonnss does: a separate deployment with the seeded demo season published. Its editor stays locked to its owner; visitors cannot try it (decided Nov 9). An open editor would let anyone upload files to public storage and publish pages on the owner's domain, which would need moderation, upload quotas and regular resets to run safely.

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
| 3 | Video; stickers and sticker library; voice notes; maps | The first seven item types work (3D model is phase 6) |
| 4 | README, `.env.example`, seed demo; public repository | A second person deploys a fork from the README alone |
| 5 | Scroll-driven route map (built); Odyssey season and `/odyssey` on the main site (owner) | Odyssey is live at `/odyssey` |
| 6 | Seeded random placement and scale; cursor follow; generative type; 3D model item (glTF); 3D or p5.js background (built Nov 9) | One season has a 3D background, a 3D item and a seeded random layout |
| Later | Spotify track list via Web API; Live Photos; slug redirects; undo history beyond one session | Decided case by case |

## Open questions

- [x] Media storage provider: Cloudflare R2.
- [x] Framework: keep Next.js.
- [x] Does Spotify oEmbed return data for playlist URLs? Yes (tested Nov 3, 2026).
- [x] Playlist card: cover, title and an owner-written caption. Track count waits for the Web API.
- [x] Saving: edits go live only after Publish.
- [x] Index page: cover, `// title`, period. Newest first, with optional manual pinning.
- [x] Map style: D3 vector outlines, no tiles, no API key.
- [x] Video: muted autoloop; sound on click. No GIF. Originals are not kept: the compressed MP4 is the only copy.
- [ ] Live Photos: needed? If yes, show as a short video or as a still?
- [ ] Quote fonts: EB Garamond and IBM Plex Mono decided; the sans-serif is still to pick.
- [x] Design units: 1440 / 390 widths, 960 px breakpoint (proposed), scale cap 1.25× (proposed).
- [x] License: AGPL-3.0. Sale is allowed; a changed hosted copy must offer its source.
- [x] Route data format: GeoJSON.
- [x] Route map layout: a band of the canvas. The map stays fixed while the items placed in that band scroll past.
- [x] Route map on mobile: same behavior on the 390-wide layout.
- [ ] Visual references beyond "leafy greens".
- [x] Random placement: all unlocked items, in whichever layout the editor shows (desktop or mobile).
- [x] 3D on phones: show the 3D background and items.
- [x] 3D model limits: 50 MB upload; compressed on upload (WebP textures at most 2048 px, or 1024 px by choice; meshopt geometry); warning above 5 MB. See [3D model compression](#3d-model-compression).
- [x] p5.js backgrounds: the owner writes or pastes their own sketches, stored in their own database. They run in a sandboxed frame. The repository ships three examples for the demo.
- [x] Demo editor: visitors cannot use the editor on the demo. The demo shows published seasons only.
- [ ] Demo deployment: where does the public demo run (its own Vercel project, database and R2 buckets)?
- [ ] Video compression: confirm size limits (built: 1080 px long side, 2 Mbit/s video, 80 MB per file). Originals are not kept (built); keep them instead?

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
13. p5.js 2.x reference (typography: variable fonts, text to contours)
14. React Three Fiber and drei documentation
15. Khronos: glTF 2.0 specification

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

**Nov 3, 2026 (phase 2 build)**

1. Each placement can carry its own quote text size (`textSize`), so text can be larger on mobile than the scaled desktop size.
2. Layer order and lock are separate per layout.
3. New items get their mobile placement from the scaled desktop placement, also when added in mobile mode.
4. The preview offers six real sizes: 390, 430, 820, 1280, 1440 and 1920 px wide. 820 px (tablet) shows the mobile layout.
5. Index entries: cover (the chosen cover, else the first photo), `// title` (no double `//`), period. Pinned seasons first by position, then newest first by creation date.
6. Share previews use the cover image at up to 1280 px wide.

**Nov 3, 2026 (phase 3 build)**

1. Video is compressed in the browser with Mediabunny (WebCodecs): H.264 at 2 Mbit/s, long side at most 1080 px, audio AAC (or Opus where the browser has no AAC encoder). Metadata tags are not copied. The original is not kept.
2. The poster is a frame from 0.5 s in, stored like a photo.
3. Videos play only while on screen, and pause when scrolled away.
4. Voice notes are mono MP3 at 64 kbit/s, encoded in the browser, with a 64-bar waveform.
5. Stickers are always converted to WebP on the server, including SVG, so no SVG markup is served.
6. Removing a sticker from the library does not remove it from seasons that use it.
7. Maps use an orthographic (globe) projection centered on the place, drawn from Natural Earth data at three levels of detail. Zoom runs from 0 (whole globe) to 12. Country borders are optional.
8. Place search uses OpenStreetMap Nominatim from the server, owner only, at most one request per second. Typed coordinates need no search.

**Nov 3, 2026 (phase 4 build)**

1. `npm run seed` creates one demo season at `/seasons/demo` as a draft, with placeholder photos drawn by the script (no photos ship in the repository). It never overwrites an existing demo unless run with `--force`.
2. `npm run doctor` checks a setup: environment, database and migrations, passkeys and setup token, both R2 buckets (write, read, public URL, CORS from `SITE_URL`) and Spotify. It writes and deletes one test file per bucket.
3. Vercel builds apply database migrations (`vercel-build`). Without `DATABASE_URL` the build warns and continues, so a fork's first deploy succeeds before its database exists.
4. The app builds with no environment variables. The database connects on first use.
5. A deployment without a main site sends `/` to `/seasons`.
6. CI (GitHub Actions) type-checks, runs unit tests, builds without environment variables, and runs migrate, seed (twice) and doctor against Postgres.
7. The README is a step-by-step deploy guide for a second person, with an environment variable table and troubleshooting.

**Nov 3, 2026**

1. Odyssey is out of scope. The owner builds it by hand on the main site. The scroll-driven route map, which existed only for Odyssey, is removed with it.

**Nov 3, 2026 (after deploying)**

1. `GET /seasons/api/health` reports whether `SITE_URL`, the database, its tables and the storage settings work, without showing values. Page errors are logged with a `[seasons]` prefix.
2. Public pages need only `R2_PUBLIC_URL`; the R2 keys are read only for uploads.
3. Seasons have an optional month (`YYYY-MM`). The index sorts pinned seasons first, then by month (newest first), then by creation date. The month shows when the period is empty.
4. Pages have no length limit. The stored height is a minimum; the page grows to fit its lowest item. The editor shows the end of the page with working room below it.

**Nov 4, 2026**

1. Odyssey is back in scope, built with seeaassoonnss. This reverses the Nov 3 entry above. The scroll-driven route map returns as part of the Odyssey season, proposed as phase 5.

**Nov 4, 2026 (phase 5 build)**

1. The route map is its own item type, `route`. Its box is a band of the canvas. While the page scrolls through the band, the map panel stays at the top of the screen (CSS `position: sticky`; the canvas uses `overflow: clip` so sticky works). The panel is one screen tall, or the band's height if shorter. Route bands do not rotate.
2. GeoJSON import: Point features, in file order, are the stops; LineString and MultiLineString features are the path. Names come from `name`, `title` or Google Takeout's `location.name`. A file with only a line gets start and end stops. Limits: 500 stops, 5,000 path points (longer paths are thinned evenly).
   Routes can also be built in the editor (added Nov 15): Add → Route map… starts a route at a searched place, and the route's settings add stops at the end (the same place search as Map items), reorder them and remove them. Items linked to a stop follow it when stops are renumbered. Without an imported path, stops are joined by great-circle lines; a route with an imported path keeps it, and a button switches it to straight lines.
3. Drawing follows the method above: a grey base line, and a colored copy whose `stroke-dashoffset` follows scroll progress through the band. Stops fill in as the line reaches them.
4. Steps: any item can be linked to a stop ("Route stop" in its settings). The map never moves to a stop; the text comes to the map instead. Linking an item moves it up or down so it reaches the middle of the screen just as the line reaches its stop ("Line up with its stop" does it again; the route's settings line up every linked item at once, and locked items stay put). While a linked item is at or above the middle of the screen, its stop is marked (larger) and named. Without one in view, the map labels the last stop reached.
5. Reduced motion: the whole route shows at once.
6. Land comes from the server as SVG for exactly the route's frame (`/seasons/map/frame`), drawn from the same Natural Earth data as Map items, cached forever. The browser and server build the same projection from rounded parameters. Frame sizes are rounded to 40 px so small window changes reuse cached images.
7. Odyssey itself is a season the owner builds with this; `/odyssey` on the main site is a rewrite or redirect the owner adds there.

**Nov 4, 2026 (editor)**

1. Alt measuring: with an item selected, holding Alt shows distances in design units to the page edges, or to the hovered item (the gap between them, or the distances to its edges when one contains the other). A center line marks the page's middle and turns solid with a "centered" tag when the selection is centered within half a unit; the same check runs against the hovered item. Rotated items are measured by their outer box. It updates while dragging.
2. Snapping: items snap within 6 screen pixels to the page's left edge, center, right edge and end, and to other items' edges and centers, on both axes, with pink guide lines. After a snapped move the position is corrected to the exact unit (Moveable snaps in whole screen pixels). A "Snap on/off" button in the editor bar turns it off and is remembered in the browser; holding ⌘ or Ctrl during a move skips snapping once.
3. Positions and sizes are stored in whole design units after a drag, resize or rotate (previously 0.1).
4. Photo crop, as in Figma: double-click a photo (or press Crop in its settings) to enter crop mode. The whole photo shows faintly around its box; dragging moves the photo inside the box, the wheel or a slider zooms (1× to 8×), Esc or Enter ends it, Reset crop clears it. The crop is stored with the photo as `crop: { x, y, zoom }`: x and y (0 to 1) choose which part shows (0 = left/top edge, 1 = right/bottom edge) and zoom enlarges it. Because it is independent of the box's shape, desktop and mobile share it and the box is always filled. It applies to photos set to "Crop to fill the box".
5. Parallax background (photos set to "Crop to fill the box"): a checkbox stores `parallax: true` with the photo. On the public page and in Preview the photo covers the whole screen (plus 10% above and below) and stays fixed while the page scrolls, so its box shows it like a window; while the box crosses the screen the photo also drifts down by 20% of the screen height. The crop applies to that screen-sized photo. It is done with a scroll handler rather than `position: fixed`, so it also works in rotated boxes. With reduced motion, or before scripts load, the photo just fills its box. The editor canvas shows the still photo with a "parallax" badge.

**Nov 9, 2026**

1. New generative and 3D layer: seeded random placement and scale, background objects (one 3D scene or p5.js sketch), cursor follow (scroll on touch devices), generative type, and a 3D model item (`.glb`, React Three Fiber). Spline is not required.
2. Proposed as phase 6. The updated requirements call it phase 5, but phase 5 is already the scroll-driven route map (built).
3. Two non-goals are narrowed so they don't conflict with it: random layout is allowed when the owner starts it, sets the seed and can lock items; visual-effect non-goals now cover photo effects only.
4. Item types: eight, adding the 3D model. The route map stays its own item type.
5. The rest of the Oct 28 base in the updated requirements (GPL-3.0, GIF upload, framework and storage still open, Odyssey on the main site) is replaced by the decisions recorded above and does not change them.

**Nov 9, 2026 (phase 6 build)**

1. Answers: random placement moves all unlocked items; 3D runs on phones; models are compressed on upload (measurements and reasons in [3D model compression](#3d-model-compression)); the owner writes their own p5.js sketches, stored in their own database.
2. seeaassoonnss stays single-owner. Friends or family who want seasons get their own deployment. A public demo deployment, as for BookBox, shows the seeded demo season.
3. p5.js runs in global mode in a sandboxed iframe instead of instance mode in a React component: stronger isolation for owner-written code, and sketches paste straight from the p5.js web editor. The page passes the cursor in as messages, so `mouseX` and `mouseY` work; `seasons.scroll` gives scroll progress. Write routes refuse requests with any origin other than `SITE_URL`, which includes a sketch frame's `null` origin.
4. A season stores its own copy of a sketch's code. Editing the library copy never changes a published page.
5. drei is not used. Generative type is DOM and CSS, not p5, so it stays readable text.
6. The doc's `layout_seed` is stored as `scatter` (seed plus scale range). The scatter area is the minimum page length, or the bottom of the lowest item that stays put, so one seed always gives one layout.
7. Limits: 6 model items per season plus one background; 200,000 characters per sketch.
8. The public bucket's CORS rule now needs `GET` as well as `PUT`, because 3D models are fetched by script. Existing forks must add it.

**Nov 9, 2026 (demo)**

1. Visitors cannot use the editor on the public demo. It shows the published demo season only.

**Nov 10, 2026 (name and landing page)**

1. The project is renamed seeaassoonnss, for the domain seeaassoonnss.app ("seasons" was not available). It is written in lowercase. A page is still a season, and internal names stay: the `/seasons` base path, database tables, cookies and the `seasons.scroll` sketch variable, so existing pages, sign-ins and sketches keep working.
2. A landing page at `/seasons/about` explains the app and how to run a copy, in the app's own type and colors: EB Garamond, IBM Plex Mono, `//` headings. Its sample season is built from the botanical sticker pack and the app's playlist and voice note cards, with a separate phone layout, and can be dragged with a mouse.
3. With `LANDING_PAGE=on`, `/` redirects to it (Next.js cannot rewrite outside the base path). Without it, `/` still goes to `/seasons`, so forks keep their behavior. `about` is now a reserved slug.
