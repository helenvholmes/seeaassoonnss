"use client";

import Link from "next/link";
import { useState } from "react";
import { BASE_PATH } from "@/lib/client";
import { MOBILE_BREAKPOINT } from "@/lib/schema";

const DEVICES = [
  { key: "phone", label: "Phone", width: 390, height: 844 },
  { key: "large-phone", label: "Large phone", width: 430, height: 932 },
  { key: "tablet", label: "Tablet", width: 820, height: 1180 },
  { key: "laptop", label: "Laptop", width: 1280, height: 800 },
  { key: "desktop", label: "Desktop", width: 1440, height: 900 },
  { key: "wide", label: "Wide", width: 1920, height: 1080 },
] as const;

/** Shows the draft in a frame at a real screen size (1 CSS pixel = 1 pixel). */
export function DevicePreview({ id, title, initialDevice }: { id: string; title: string; initialDevice: string }) {
  const [key, setKey] = useState(DEVICES.some((d) => d.key === initialDevice) ? initialDevice : "laptop");
  const device = DEVICES.find((d) => d.key === key)!;
  const layout = device.width < MOBILE_BREAKPOINT ? "mobile" : "desktop";
  return (
    <div className="preview">
      <header className="editor-bar">
        <div className="row">
          <Link href={`/edit/${id}`} className="quiet-link">
            ← editor
          </Link>
          <strong>{title || "untitled"}</strong>
          <span className="muted">draft preview</span>
        </div>
        <div className="row">
          {DEVICES.map((d) => (
            <button key={d.key} className={d.key === key ? "primary" : "quiet"} aria-pressed={d.key === key} onClick={() => setKey(d.key)}>
              {d.label}
            </button>
          ))}
        </div>
      </header>
      <p className="preview-caption muted small">
        {device.width} × {device.height} px · shows the {layout} layout
      </p>
      <div className="preview-stage">
        <iframe
          key={key}
          title={`Preview at ${device.width} × ${device.height}`}
          src={`${BASE_PATH}/edit/${id}/preview/frame`}
          width={device.width}
          height={device.height}
          className="preview-frame"
        />
      </div>
    </div>
  );
}
