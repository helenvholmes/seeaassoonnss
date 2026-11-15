import type { Layout, ShapeItem, ShapeKind } from "@/lib/schema";
import { CANVAS_WIDTH } from "@/lib/schema";
import { units } from "../geometry";

function polygon(sides: number, rotate = -90): string {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((rotate + (360 / sides) * i) * Math.PI) / 180;
    return `${(50 + 50 * Math.cos(a)).toFixed(2)},${(50 + 50 * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

function star(points = 5, inner = 0.42): string {
  return Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? 50 * inner : 50;
    const a = ((-90 + (180 / points) * i) * Math.PI) / 180;
    return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

/** Each shape in a 100 × 100 box. The SVG stretches it to the item's box. */
const SHAPE_PATHS: Record<ShapeKind, React.ReactElement> = {
  square: <rect x="0" y="0" width="100" height="100" />,
  rounded: <rect x="0" y="0" width="100" height="100" rx="18" ry="18" />,
  circle: <ellipse cx="50" cy="50" rx="50" ry="50" />,
  triangle: <polygon points="50,0 100,100 0,100" />,
  diamond: <polygon points="50,0 100,50 50,100 0,50" />,
  pentagon: <polygon points={polygon(5)} />,
  hexagon: <polygon points={polygon(6, 0)} />,
  star: <polygon points={star()} />,
  heart: <path d="M50 96 C20 74 0 56 0 31 C0 13 13 2 28 2 C38 2 46 8 50 17 C54 8 62 2 72 2 C87 2 100 13 100 31 C100 56 80 74 50 96 Z" />,
  arrow: <polygon points="0,32 58,32 58,6 100,50 58,94 58,68 0,68" />,
};

export function ShapeView({ item, layout }: { item: ShapeItem; layout: Layout }) {
  const c = item.content;
  return (
    <svg className="item-shape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <g
        fill={c.fill ?? "none"}
        stroke={c.strokeWidth > 0 ? c.stroke : "none"}
        // The outline keeps its width however the box is stretched.
        style={{ strokeWidth: units(c.strokeWidth, CANVAS_WIDTH[layout]), vectorEffect: "non-scaling-stroke", strokeLinejoin: "round" }}
      >
        {SHAPE_PATHS[c.shape]}
      </g>
    </svg>
  );
}
