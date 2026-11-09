import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The main site rewrites /seasons/:path* to this deployment.
  basePath: "/seasons",
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "draco3dgltf", "meshoptimizer"],
  // p5.js is served from this app (see app/vendor), so forks need no CDN.
  outputFileTracingIncludes: { "/vendor/[file]": ["./node_modules/p5/lib/p5.min.js"] },
  async redirects() {
    // A copy deployed on its own (without a main site in front) has nothing at "/".
    return [{ source: "/", destination: "/seasons", basePath: false, permanent: false }];
  },
};

export default nextConfig;
