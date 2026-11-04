import { parseFrameParams, renderFrameSvg } from "@/lib/mapsvg";
import { IMMUTABLE } from "@/lib/storage";

/** GET /seasons/map/frame?lon&scale&tx&ty&w&h&k&borders → land for a route map. Same parameters, same image. */
export async function GET(request: Request) {
  const params = parseFrameParams(new URL(request.url).searchParams);
  if (!params) return new Response("Bad frame parameters.", { status: 400 });
  return new Response(await renderFrameSvg(params), {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": IMMUTABLE,
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
