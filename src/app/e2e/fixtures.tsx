"use client";
// Fixed seasons for the browser tests. See [fixture]/page.tsx.
import { Editor } from "@/components/editor/Editor";
import { RouteView } from "@/components/items/RouteView";
import { SeriesMenu, SeriesNext } from "@/components/SeriesNav";
import { seriesNavigation, type SeriesOption } from "@/lib/series";
import { emptySeasonDoc, type Item, type RouteItem, type SeasonDoc } from "@/lib/schema";

const QUOTE: Item = {
  id: "00000000-0000-4000-8000-000000000002",
  type: "quote",
  desktop: { x: 200, y: 120, w: 700, h: 160, rotation: 0, z: 2, locked: false },
  mobile: null,
  content: { markdown: "A summer of trains", source: "", font: "serif", size: 56, align: "left", color: "#1d1d1b", binding: null },
};

const ROUTE: RouteItem = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "route",
  desktop: { x: 360, y: 400, w: 720, h: 2700, rotation: 0, z: 1, locked: false },
  mobile: null,
  content: {
    stops: [
      { name: "Lisbon", lon: -9.14, lat: 38.72 },
      { name: "Madrid", lon: -3.7, lat: 40.42 },
      { name: "Barcelona", lon: 2.17, lat: 41.39 },
    ],
    line: [],
    color: "#e0892b",
    borders: false,
    stepZoom: 1,
    style: "line",
    labels: true,
  },
};

const doc = (title: string, items: Item[]): SeasonDoc => ({ ...emptySeasonDoc(title), items });

/** Two parts of "Odyssey" in the owner's other seasons. */
const SERIES_OPTIONS: SeriesOption[] = [
  {
    name: "Odyssey",
    members: [
      { id: "00000000-0000-4000-8000-0000000000b1", title: "Odyssey p 1", part: 1, status: "published" },
      { id: "00000000-0000-4000-8000-0000000000b2", title: "Odyssey p 2", part: 2, status: "draft" },
    ],
  },
];

function EditorFixture({ initial }: { initial: SeasonDoc }) {
  return <Editor id="00000000-0000-4000-8000-0000000000aa" initialSlug="e2e" initialDoc={initial} initialVersion={1} initialStatus="draft" initialPublished={null} initialSortOrder={null} mediaBase="/seasons/local-media" seriesOptions={SERIES_OPTIONS} />;
}

/** The middle part of a three-part series, as a season page shows it. */
function ReaderSeries() {
  const part = (n: number) => ({ slug: `odyssey-p-${n}`, title: `Odyssey p ${n}`, part: n });
  const nav = seriesNavigation("Odyssey", part(2), [part(1), part(2), part(3)])!;
  return (
    <main className="season-page" style={{ background: "#fbfbf9" }}>
      <SeriesMenu nav={nav} />
      <div style={{ height: "250vh" }} />
      <SeriesNext nav={nav} />
    </main>
  );
}

function ReaderRoute() {
  return (
    <div className="canvas" style={{ background: "#fff" }}>
      <div style={{ height: "400vh", width: 540 }}>
        <RouteView item={{ ...ROUTE, content: { ...ROUTE.content, drawStart: 0.4 } }} interactive layout="desktop" placement={ROUTE.desktop} />
      </div>
      <div style={{ height: "50vh" }} />
    </div>
  );
}

/** A text block linked to Madrid, partway down the band. */
function ReaderRouteText() {
  return (
    <div className="canvas" style={{ background: "#fff", position: "relative" }}>
      <div style={{ height: "400vh", width: 540 }}>
        <RouteView item={ROUTE} interactive layout="desktop" placement={ROUTE.desktop} />
      </div>
      <div className="linked-text" data-route-stop={`${ROUTE.id}:1`} style={{ position: "absolute", top: "200vh", left: 560, width: 300 }}>
        Madrid at noon
      </div>
      <div style={{ height: "50vh" }} />
    </div>
  );
}

export const FIXTURES = {
  "editor-quote": () => <EditorFixture initial={doc("quote", [QUOTE])} />,
  "editor-route": () => <EditorFixture initial={doc("route", [ROUTE])} />,
  "editor-route-text": () => <EditorFixture initial={doc("route and text", [ROUTE, { ...QUOTE, desktop: { ...QUOTE.desktop, x: 1100, y: 500, w: 300 } }])} />,
  "reader-route-text": () => <ReaderRouteText />,
  "reader-route": () => <ReaderRoute />,
  "reader-series": () => <ReaderSeries />,
};

export type FixtureName = keyof typeof FIXTURES;

export function Fixture({ name }: { name: FixtureName }) {
  const Render = FIXTURES[name];
  return <Render />;
}
