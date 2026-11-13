"use client";

import type { Measurement } from "./measure";

/**
 * Draws a measurement over the editor canvas. The SVG uses design units, so its
 * shapes line up with items at any zoom; line widths and text stay a fixed size.
 */
export function MeasureOverlay({ m, width, height, scale }: { m: Measurement; width: number; height: number; scale: number }) {
  const px = (n: number) => n / scale;
  const label = (x: number, y: number, text: string, key: string) => (
    <g key={key}>
      <rect x={x - px(text.length * 3.6 + 6)} y={y - px(9)} width={px(text.length * 7.2 + 12)} height={px(18)} rx={px(3)} className="measure-tag" />
      <text x={x} y={y + px(4)} fontSize={px(11)} textAnchor="middle" className="measure-text">
        {text}
      </text>
    </g>
  );
  const box = (b: NonNullable<Measurement["target"]>, cls: string) => <rect x={b.x0} y={b.y0} width={b.x1 - b.x0} height={b.y1 - b.y0} className={cls} />;
  return (
    <svg className="measure-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      {m.guides.map((g, i) =>
        g.axis === "x" ? (
          <line key={`g${i}`} x1={g.at} y1={g.from} x2={g.at} y2={g.to} className={g.centered ? "measure-center is-centered" : "measure-center"} />
        ) : (
          <line key={`g${i}`} x1={g.from} y1={g.at} x2={g.to} y2={g.at} className={g.centered ? "measure-center is-centered" : "measure-center"} />
        ),
      )}
      {box(m.selection, "measure-box")}
      {m.target ? box(m.target, "measure-box measure-target") : null}
      {m.lines.map((l, i) => (
        <line key={`l${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="measure-line" />
      ))}
      {m.lines.map((l, i) => label((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2, l.label, `t${i}`))}
      {m.guides
        .filter((g) => g.centered)
        .map((g, i) => label(g.axis === "x" ? g.at : (g.from + g.to) / 2, g.axis === "x" ? m.selection.y1 + px(16) : g.at - px(14), "centered", `c${i}`))}
    </svg>
  );
}
