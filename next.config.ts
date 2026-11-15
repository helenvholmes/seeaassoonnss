import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The main site rewrites /seasons/:path* to this deployment.
  basePath: "/seasons",
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "draco3dgltf", "meshoptimizer"],
  // Files loaded at run time that the bundler cannot see: p5.js (served from this
  // app, see app/vendor, so forks need no CDN) and the Draco decoder's WebAssembly,
  // used by every route that can compress a 3D model.
  outputFileTracingIncludes: {
    "/vendor/[file]": ["./node_modules/p5/lib/p5.min.js"],
    "/api/**/*": ["./node_modules/draco3dgltf/*.wasm"],
  },
  // npm installs sharp's binaries for both glibc and musl Linux. Vercel runs glibc,
  // so the musl copy (about 19 MB) only fills Function Storage.
  outputFileTracingExcludes: {
    "*": ["./node_modules/@img/sharp-libvips-linuxmusl-*/**", "./node_modules/@img/sharp-linuxmusl-*/**", "./node_modules/@img/sharp-wasm32/**"],
  },
  async redirects() {
    // A copy deployed on its own (without a main site in front) has nothing at "/".
    // It sends visitors to the index of seasons, or with LANDING_PAGE=on to the
    // landing page. (Next.js cannot rewrite outside the base path, so it redirects.)
    // seeaassoonnss.app is left out: there vercel.json serves the landing page at "/"
    // itself, and this redirect would otherwise run first.
    const home = process.env.LANDING_PAGE === "on" ? "/seasons/about" : "/seasons";
    return [
      {
        source: "/",
        missing: [{ type: "host", value: "seeaassoonnss.app" }],
        destination: home,
        basePath: false,
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
