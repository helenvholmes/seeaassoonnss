import { notFound } from "next/navigation";

// Always 404. Next.js only serves paths under the base path (/seasons), so on
// seeaassoonnss.app an address like /login never reaches the app and Vercel would
// answer with its own plain 404. vercel.json rewrites those addresses here so they
// get the app's not-found page (src/app/not-found.tsx) instead.
export default function PageNotFound() {
  notFound();
}
