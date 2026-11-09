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
  async redirects() {
    // A copy deployed on its own (without a main site in front) has nothing at "/".
    return [{ source: "/", destination: "/seasons", basePath: false, permanent: false }];
  },
};

export default nextConfig;
