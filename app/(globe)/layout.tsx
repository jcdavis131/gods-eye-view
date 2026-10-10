import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import { Providers } from "../providers";
import { BASE_METADATA, BASE_DESCRIPTION } from "@/lib/seo/base";

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// One display face (tracked, uppercase, used with restraint) and one text face
// (mono, tabular figures for every reading). Both variable, both display=swap.
const display = Geist({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// A bare string, not a template: the globe is the home route and its rendered
// <title> must not move.
export const metadata: Metadata = {
  ...BASE_METADATA,
  title: "Embedding Atlas",
  description: BASE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: "#05070a",
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
