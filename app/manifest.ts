import type { MetadataRoute } from "next";

// Installable on a phone home screen: standalone display, dark theme, the
// reticle icon. Served at /manifest.webmanifest and linked from the layout.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Embedding Atlas",
    short_name: "Atlas",
    description: "A spy satellite simulator in your browser, except the data is real.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#05070a",
    theme_color: "#05070a",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
