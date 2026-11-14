import type { Metadata, Viewport } from "next";
import { BASE_PATH } from "@/lib/client";

// The editor can be installed as an app: "Add to Home Screen" on a phone, or
// "Install" in a desktop browser. Only the editor links the manifest, so adding a
// public season to a home screen still opens that season.
export const metadata: Metadata = {
  title: "seeaassoonnss · editor",
  robots: { index: false, follow: false },
  manifest: `${BASE_PATH}/editor.webmanifest`,
  appleWebApp: { capable: true, title: "seasons", statusBarStyle: "default" },
  icons: { apple: `${BASE_PATH}/app-icons/apple-touch-icon.png` },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#ffffff" };

export default function EditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
