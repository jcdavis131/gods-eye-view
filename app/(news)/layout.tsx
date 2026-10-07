import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "../globals.css";
import "./news.css";
import { BASE_METADATA } from "@/lib/seo/base";

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const display = Geist({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

// A third root layout, beside the globe's and the documents'. The news studio
// is dark like the globe but scrolls like a document (its schedule and source
// cards run below the stage on a phone), and it ships no Cesium and no
// QueryClientProvider. The inline height on <html> and <body> overrides
// globals.css's `html, body { height: 100% }` so the page scrolls.

export const metadata: Metadata = {
  ...BASE_METADATA,
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${mono.variable} ${display.variable} antialiased`} style={{ height: "auto" }}>
      <body className="min-h-dvh bg-background font-mono text-foreground" style={{ height: "auto" }}>
        {children}
      </body>
    </html>
  );
}
