import type { Metadata, Viewport } from "next";
import { Geist_Mono, Rajdhani } from "next/font/google";
import "../globals.css";
import { Providers } from "../providers";
import { BASE_METADATA, BASE_DESCRIPTION } from "@/lib/seo/base";

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Rajdhani({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

// A bare string, not a template: the globe is the home route and its rendered
// <title> must not move.
export const metadata: Metadata = {
  ...BASE_METADATA,
  title: "Embedding Atlas",
  description: BASE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#03070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Let the HUD pad itself around the notch and the home indicator.
  viewportFit: "cover",
};

export default function GlobeLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${mono.variable} ${display.variable} h-full antialiased`}>
      <head>
        {/* Cesium widget CSS, served from the assets copied by scripts/copy-cesium.mjs.
            Linked rather than imported so its relative image URLs resolve against
            /cesium without bundler asset rewriting. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/cesium/Widgets/widgets.css" />
      </head>
      <body className="h-full overflow-hidden bg-background font-mono text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
