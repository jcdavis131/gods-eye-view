import type { NextConfig } from "next";
import path from "node:path";

// Cesium pulls @spz-loader/core (Gaussian-splat decoder with ~250 KB of
// WebAssembly inlined as a JS string) into the client bundle. Turbopack's
// production minifier rewrites that string as a template literal whose
// legacy octal escapes are illegal, so the Cesium chunk fails to parse in
// production. Splats are never used here; alias the package to a stub.
// See lib/vendor/spz-loader-stub.ts.
const SPZ_STUB = "./lib/vendor/spz-loader-stub.ts";

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      "@spz-loader/core": SPZ_STUB,
    },
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@spz-loader/core": path.resolve(process.cwd(), SPZ_STUB),
    };
    return config;
  },
};

export default nextConfig;
