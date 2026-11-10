"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A sample season for the landing page: stickers and cards placed by hand, with a
 * desktop and a separate phone layout, as in the editor. With a mouse or pen, every
 * piece can be dragged; on touch screens the page scrolls as usual.
 */

/** Left, top, width (all % of the collage) and rotation (degrees). */
type Spot = [x: number, y: number, w: number, r: number];
export type CollagePiece = { id: string; desktop: Spot; mobile: Spot; z: number; children: ReactNode; className?: string };

export function Collage({ pieces, label }: { pieces: CollagePiece[]; label: string }) {
  const [moved, setMoved] = useState<Record<string, { dx: number; dy: number }>>({});
  const [order, setOrder] = useState<string[]>([]);
  const drag = useRef<{ id: string; x: number; y: number; dx: number; dy: number } | null>(null);

  const onPointerDown = (id: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = moved[id] ?? { dx: 0, dy: 0 };
    drag.current = { id, x: e.clientX, y: e.clientY, dx: m.dx, dy: m.dy };
    setOrder((o) => [...o.filter((x) => x !== id), id]);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setMoved((m) => ({ ...m, [d.id]: { dx: d.dx + e.clientX - d.x, dy: d.dy + e.clientY - d.y } }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div className="collage" role="img" aria-label={label}>
      {pieces.map((p) => {
        const m = moved[p.id];
        const raised = order.indexOf(p.id);
        const style = {
          "--x": `${p.desktop[0]}%`,
          "--y": `${p.desktop[1]}%`,
          "--w": `${p.desktop[2]}%`,
          "--r": `${p.desktop[3]}deg`,
          "--mx": `${p.mobile[0]}%`,
          "--my": `${p.mobile[1]}%`,
          "--mw": `${p.mobile[2]}%`,
          "--mr": `${p.mobile[3]}deg`,
          "--dx": `${m?.dx ?? 0}px`,
          "--dy": `${m?.dy ?? 0}px`,
          zIndex: raised >= 0 ? 100 + raised : p.z,
        } as CSSProperties;
        return (
          <div
            key={p.id}
            className={`collage-piece ${p.className ?? ""}`}
            style={style}
            onPointerDown={onPointerDown(p.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
          >
            {p.children}
          </div>
        );
      })}
    </div>
  );
}
