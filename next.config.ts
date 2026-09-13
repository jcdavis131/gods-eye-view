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
  async headers() {
    // Security headers. The Atlas pulls live data from many third-party feeds
    // (aircraft, ships, quakes, tiles), so connect/img allow any HTTPS host —
    // this still blocks the dangerous vectors: http downgrade, data: exfil,
    // plugins, framing, and cross-origin form/base hijack. script-src keeps
    // 'unsafe-inline' because the Next.js App Router emits inline bootstrap
    // scripts.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "connect-src 'self' https: wss:",
      "media-src 'self' blob: https:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; ");
    const securityHeaders = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
      },
    ];
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
