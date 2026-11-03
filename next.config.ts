import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The main site rewrites /seasons/:path* to this deployment.
  basePath: "/seasons",
  poweredByHeader: false,
  serverExternalPackages: ["sharp"],
  async redirects() {
    // A copy deployed on its own (without a main site in front) has nothing at "/".
    return [{ source: "/", destination: "/seasons", basePath: false, permanent: false }];
  },
};

export default nextConfig;
