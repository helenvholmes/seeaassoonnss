"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

/**
 * Shows the draft in a frame at a real screen size (1 CSS pixel = 1 pixel), or
 * full screen: the draft fills this screen with no controls, as it would on this device.
 */
export function DevicePreview({ id, title, initialDevice, initialFull }: { id: string; title: string; initialDevice: string; initialFull: boolean }) {
  const [key, setKey] = useState(DEVICES.some((d) => d.key === initialDevice) ? initialDevice : "laptop");
  const [full, setFull] = useState(initialFull);
  const device = DEVICES.find((d) => d.key === key)!;
  const layout = device.width < MOBILE_BREAKPOINT ? "mobile" : "desktop";
  const src = `${BASE_PATH}/edit/${id}/preview/frame`;

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  if (full) {
    return (
      <div className="preview-full">
        <iframe title="Full screen preview" src={src} className="preview-full-frame" />
        <button className="preview-exit" onClick={() => setFull(false)} aria-label="Leave full screen" title="Leave full screen (Esc)">
          ×
        </button>
      </div>
    );
  }

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
        <div className="row preview-devices">
          <button onClick={() => setFull(true)} title="The draft on this whole screen, without controls">
            Full screen
          </button>
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
          src={src}
          width={device.width}
          height={device.height}
          className="preview-frame"
        />
      </div>
    </div>
  );
}
