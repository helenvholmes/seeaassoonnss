"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { QUOTE_FONTS, slugProblem, type Item, type Layout, type Placement, type SeasonDoc } from "@/lib/schema";
import { quoteSize } from "../ItemContent";
import type { LayerMove } from "./ops";
import { normalizeRotation, placementOf } from "./ops";

interface Props {
  id: string;
  doc: SeasonDoc;
  item: Item | null;
  slug: string;
  onSlugChange: (slug: string) => void;
  change: (next: SeasonDoc | ((d: SeasonDoc) => SeasonDoc), key?: string | null) => void;
  updateItem: (fn: (item: Item) => Item, key?: string) => void;
  layer: (move: LayerMove) => void;
  duplicate: () => void;
  remove: () => void;
  mediaBase: string;
  layout: Layout;
  sortOrder: number | null;
  onSortOrderChange: (n: number | null) => void;
  select: (id: string | null) => void;
  setMobileVisible: (id: string, visible: boolean) => void;
  resetMobile: (kind: "scaled" | "column") => void;
}

function itemLabel(item: Item): string {
  if (item.type === "photo") return item.content.alt ? `photo: ${item.content.alt.slice(0, 30)}` : "photo";
  if (item.type === "playlist") return `playlist: ${item.content.title.slice(0, 30)}`;
  if (item.content.binding) return item.content.binding;
  return `quote: ${item.content.markdown.replace(/[*_\[\]()#>`]/g, "").slice(0, 30)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** A number input that only commits finite values. */
function NumberInput({ value, onChange, step = 1, min }: { value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  const [text, setText] = useState(String(Math.round(value * 10) / 10));
  useEffect(() => setText(String(Math.round(value * 10) / 10)), [value]);
  return (
    <input
      type="number"
      step={step}
      min={min}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value !== "" && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
      }}
    />
  );
}

function SortOrderField({ id, sortOrder, onSortOrderChange }: Pick<Props, "id" | "sortOrder" | "onSortOrderChange">) {
  const [text, setText] = useState(sortOrder === null ? "" : String(sortOrder));
  const [message, setMessage] = useState<string | null>(null);
  const parsed = text.trim() === "" ? null : Number(text);
  const valid = parsed === null || (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999);
  return (
    <Field label="Pin on the index page at position">
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="number" min={1} step={1} placeholder="by date" value={text} onChange={(e) => setText(e.target.value)} />
        <button
          disabled={!valid || parsed === sortOrder}
          onClick={async () => {
            try {
              await api(`/seasons/${id}`, { method: "PATCH", body: { sortOrder: parsed } });
              onSortOrderChange(parsed);
              setMessage(parsed === null ? "Listed by date." : `Pinned at position ${parsed}.`);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          Save
        </button>
      </div>
      <span className="small muted">{message ?? "Pinned seasons come first; the rest are newest first."}</span>
    </Field>
  );
}

function MobileSettings({ doc, resetMobile, setMobileVisible, select }: Props) {
  const hidden = doc.items.filter((i) => !i.mobile);
  return (
    <div className="stack">
      <p className="tools-heading">mobile layout</p>
      <p className="small muted">Content is shared with desktop. Positions, sizes, layers and text sizes here are for screens narrower than 960 px.</p>
      <div className="row">
        <button onClick={() => resetMobile("scaled")}>Reset: scaled desktop</button>
        <button onClick={() => resetMobile("column")}>Reset: single column</button>
      </div>
      {hidden.length ? (
        <div className="stack" style={{ gap: 4 }}>
          <span className="small muted">Hidden on mobile</span>
          {hidden.map((i) => (
            <div key={i.id} className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
              <span className="small">{itemLabel(i)}</span>
              <button
                onClick={() => {
                  setMobileVisible(i.id, true);
                  select(i.id);
                }}
              >
                Show
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <hr />
    </div>
  );
}

function SeasonSettings(props: Props) {
  const { id, doc, slug, onSlugChange, change, layout } = props;
  const router = useRouter();
  const [slugDraft, setSlugDraft] = useState(slug);
  const [slugMessage, setSlugMessage] = useState<string | null>(null);
  const set = <K extends keyof SeasonDoc>(key: K, value: SeasonDoc[K]) => change((d) => ({ ...d, [key]: value }), `season:${key}`);
  const problem = slugDraft === slug ? null : slugProblem(slugDraft);

  return (
    <div className="stack">
      {layout === "mobile" ? <MobileSettings {...props} /> : null}
      <p className="tools-heading">season</p>
      <Field label="Title">
        <input type="text" value={doc.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field label="Subtitle (Markdown)">
        <textarea rows={3} value={doc.subtitle} onChange={(e) => set("subtitle", e.target.value)} />
      </Field>
      <Field label="Period">
        <input type="text" placeholder="fall 2026" value={doc.period} onChange={(e) => set("period", e.target.value)} />
      </Field>
      <Field label="Slug">
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input type="text" value={slugDraft} onChange={(e) => setSlugDraft(e.target.value.toLowerCase())} />
          <button
            disabled={slugDraft === slug || !!problem}
            onClick={async () => {
              try {
                await api(`/seasons/${id}`, { method: "PATCH", body: { slug: slugDraft } });
                onSlugChange(slugDraft);
                setSlugMessage("Slug changed. The old address no longer works.");
              } catch (e) {
                setSlugMessage((e as Error).message);
              }
            }}
          >
            Save
          </button>
        </div>
        {problem ? <span className="small error">{problem}</span> : slugMessage ? <span className="small muted">{slugMessage}</span> : null}
      </Field>
      <SortOrderField id={id} sortOrder={props.sortOrder} onSortOrderChange={props.onSortOrderChange} />
      {layout === "desktop" ? (
        <Field label="Canvas height (desktop, 1440 wide)">
          <NumberInput value={doc.desktopHeight} min={200} step={50} onChange={(n) => set("desktopHeight", Math.min(40000, n))} />
        </Field>
      ) : (
        <Field label="Canvas height (mobile, 390 wide)">
          <NumberInput value={doc.mobileHeight} min={200} step={20} onChange={(n) => set("mobileHeight", Math.min(40000, n))} />
        </Field>
      )}
      <Field label="Background">
        <div className="row">
          <input type="color" value={doc.background.value} onChange={(e) => set("background", { type: "color", value: e.target.value })} />
          <code className="small">{doc.background.value}</code>
        </div>
      </Field>
      <hr />
      <button
        className="quiet error"
        style={{ alignSelf: "flex-start" }}
        onClick={async () => {
          if (!confirm(`Delete "${doc.title || "untitled"}"? This cannot be undone.`)) return;
          await api(`/seasons/${id}`, { method: "DELETE" });
          router.push("/edit");
        }}
      >
        Delete season
      </button>
    </div>
  );
}

/** Changes the item's placement in one layout. */
function patchPlacement(item: Item, layout: Layout, patch: Partial<Placement>): Item {
  if (layout === "desktop") return { ...item, desktop: { ...item.desktop, ...patch } };
  return item.mobile ? { ...item, mobile: { ...item.mobile, ...patch } } : item;
}

function PlacementFields({ item, p, layout, updateItem }: { item: Item; p: Placement; layout: Layout; updateItem: Props["updateItem"] }) {
  const set = (patch: Partial<Placement>) => updateItem((i) => patchPlacement(i, layout, patch), `place:${layout}:${item.id}:${Object.keys(patch)[0]}`);
  return (
    <div className="grid2">
      <Field label="x">
        <NumberInput value={p.x} onChange={(x) => set({ x })} />
      </Field>
      <Field label="y">
        <NumberInput value={p.y} onChange={(y) => set({ y })} />
      </Field>
      <Field label="width">
        <NumberInput value={p.w} min={1} onChange={(w) => set({ w })} />
      </Field>
      <Field label="height">
        <NumberInput value={p.h} min={1} onChange={(h) => set({ h })} />
      </Field>
      <Field label="rotation °">
        <NumberInput value={p.rotation} onChange={(r) => set({ rotation: normalizeRotation(r) })} />
      </Field>
    </div>
  );
}

function ItemSettings(props: Props & { item: Item }) {
  const { item, doc, updateItem, change, layer, duplicate, remove, layout, setMobileVisible } = props;
  const p = placementOf(item, layout);
  const locked = !!p?.locked;
  const content = <C extends Item>(patch: Partial<C["content"]>, field: string) =>
    updateItem((i) => ({ ...i, content: { ...i.content, ...patch } }) as Item, `content:${item.id}:${field}`);

  return (
    <div className="stack">
      <p className="tools-heading">{item.type === "quote" && item.content.binding ? item.content.binding : item.type}</p>

      {item.type === "photo" ? (
        <>
          <Field label="Alt text (for screen readers)">
            <textarea rows={3} value={item.content.alt} placeholder="Describe the photo" onChange={(e) => content({ alt: e.target.value }, "alt")} />
          </Field>
          <Field label="Fit">
            <select value={item.content.fit} onChange={(e) => content({ fit: e.target.value as "cover" | "contain" }, "fit")}>
              <option value="cover">Crop to fill the box</option>
              <option value="contain">Show the whole photo</option>
            </select>
          </Field>
          <div className="row">
            <button
              onClick={() => {
                const { width, height } = item.content;
                updateItem((i) => {
                  const cur = placementOf(i, layout);
                  return cur ? patchPlacement(i, layout, { h: Math.round(((cur.w * height) / width) * 10) / 10 }) : i;
                });
              }}
            >
              Original aspect ratio
            </button>
            <label className="row small">
              <input
                type="checkbox"
                checked={doc.coverItemId === item.id}
                onChange={(e) => change((d) => ({ ...d, coverItemId: e.target.checked ? item.id : null }))}
              />
              Cover image
            </label>
          </div>
        </>
      ) : null}

      {item.type === "quote" ? (
        <>
          <Field label="Shows">
            <select
              value={item.content.binding ?? "text"}
              onChange={(e) => content({ binding: e.target.value === "text" ? null : (e.target.value as "title" | "subtitle") }, "binding")}
            >
              <option value="text">Its own text</option>
              <option value="title">The season title</option>
              <option value="subtitle">The season subtitle</option>
            </select>
          </Field>
          {item.content.binding ? (
            <p className="small muted">Edit the {item.content.binding} in the season settings (click the empty canvas).</p>
          ) : (
            <>
              <Field label="Text (Markdown: **bold**, *italic*, [link](https://…))">
                <textarea rows={6} value={item.content.markdown} onChange={(e) => content({ markdown: e.target.value }, "markdown")} />
              </Field>
              <Field label="Source">
                <input type="text" value={item.content.source} onChange={(e) => content({ source: e.target.value }, "source")} />
              </Field>
            </>
          )}
          <div className="grid2">
            <Field label="Font">
              <select value={item.content.font} onChange={(e) => content({ font: e.target.value as (typeof QUOTE_FONTS)[number] }, "font")}>
                <option value="serif">EB Garamond</option>
                <option value="mono">IBM Plex Mono</option>
                <option value="sans">Sans-serif</option>
              </select>
            </Field>
            {layout === "desktop" || !p ? (
              <Field label="Size">
                <NumberInput value={item.content.size} min={4} onChange={(size) => content({ size: Math.min(400, size) }, "size")} />
              </Field>
            ) : (
              <Field label="Size on mobile">
                <NumberInput
                  value={quoteSize(item, layout, p)}
                  min={2}
                  onChange={(n) => updateItem((i) => patchPlacement(i, "mobile", { textSize: Math.min(400, n) }), `place:mobile:${item.id}:textSize`)}
                />
              </Field>
            )}
            <Field label="Align">
              <select value={item.content.align} onChange={(e) => content({ align: e.target.value as "left" | "center" | "right" }, "align")}>
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Color">
              <input type="color" value={item.content.color} onChange={(e) => content({ color: e.target.value }, "color")} />
            </Field>
          </div>
        </>
      ) : null}

      {item.type === "playlist" ? (
        <>
          <Field label="Title">
            <input type="text" value={item.content.title} onChange={(e) => content({ title: e.target.value }, "title")} />
          </Field>
          <Field label="Caption">
            <input type="text" placeholder="for walking home" value={item.content.caption} onChange={(e) => content({ caption: e.target.value }, "caption")} />
          </Field>
          <a className="small" href={item.content.url} target="_blank" rel="noreferrer">
            Open on Spotify
          </a>
        </>
      ) : null}

      <hr />
      <p className="tools-heading">position on {layout}</p>
      {!p ? (
        <>
          <p className="small muted">Hidden on mobile.</p>
          <div className="row">
            <button onClick={() => setMobileVisible(item.id, true)}>Show on mobile</button>
          </div>
        </>
      ) : locked ? (
        <p className="small muted">Locked. Unlock to move, resize or rotate.</p>
      ) : (
        <PlacementFields item={item} p={p} layout={layout} updateItem={updateItem} />
      )}
      {p ? (
        <label className="row small">
          <input type="checkbox" checked={!!item.mobile} onChange={(e) => setMobileVisible(item.id, e.target.checked)} />
          Show on mobile
        </label>
      ) : null}
      <p className="small muted">Shift while resizing keeps the aspect ratio; Shift while rotating snaps to 15°. Arrow keys nudge.</p>
{p ? (
      <div className="row">
        <button onClick={() => layer("front")} title="Bring to front">
          To front
        </button>
        <button onClick={() => layer("forward")} title="Bring forward">
          Forward
        </button>
        <button onClick={() => layer("backward")} title="Send backward">
          Backward
        </button>
        <button onClick={() => layer("back")} title="Send to back">
          To back
        </button>
      </div>
      ) : null}
      <div className="row">
        {p ? <button onClick={() => updateItem((i) => patchPlacement(i, layout, { locked: !locked }))}>{locked ? "Unlock" : "Lock"}</button> : null}
        <button onClick={duplicate} title="⌘D">
          Duplicate
        </button>
        <button className="error" onClick={remove}>
          Delete
        </button>
      </div>
    </div>
  );
}

export function Inspector(props: Props) {
  return props.item ? <ItemSettings {...props} item={props.item} /> : <SeasonSettings {...props} />;
}
