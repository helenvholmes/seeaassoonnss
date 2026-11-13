import { parseMapParams, renderMapSvg } from "@/lib/mapsvg";
import { IMMUTABLE } from "@/lib/storage";

/** GET /seasons/map?lat=…&lon=…&zoom=…&borders=1 → SVG. The same parameters always give the same image. */
export async function GET(request: Request) {
  const params = parseMapParams(new URL(request.url).searchParams);
  if (!params) return new Response("Bad map parameters.", { status: 400 });
  const svg = await renderMapSvg(params);
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": IMMUTABLE,
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
