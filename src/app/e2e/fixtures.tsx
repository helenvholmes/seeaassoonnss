"use client";
// Fixed seasons for the browser tests. See [fixture]/page.tsx.
import { Editor } from "@/components/editor/Editor";
import { RouteView } from "@/components/items/RouteView";
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

function EditorFixture({ initial }: { initial: SeasonDoc }) {
  return <Editor id="00000000-0000-4000-8000-0000000000aa" initialSlug="e2e" initialDoc={initial} initialVersion={1} initialStatus="draft" initialPublished={null} initialSortOrder={null} mediaBase="/seasons/local-media" />;
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

export const FIXTURES = {
  "editor-quote": () => <EditorFixture initial={doc("quote", [QUOTE])} />,
  "editor-route": () => <EditorFixture initial={doc("route", [ROUTE])} />,
  "reader-route": () => <ReaderRoute />,
};

export type FixtureName = keyof typeof FIXTURES;

export function Fixture({ name }: { name: FixtureName }) {
  const Render = FIXTURES[name];
  return <Render />;
}
