import type { Metadata, Viewport } from "next";
import { Geist_Mono, Rajdhani } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Rajdhani({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://eye.jcamd.com";
const DESCRIPTION =
  "A spy satellite simulator in your browser, except the data is real: live aircraft, ships, satellites, earthquakes, launches, and the water that sustains communities. Rivers, reservoirs, aquifers, drought and Sentinel-2 turbidity, no API keys.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Embedding Atlas",
  description: DESCRIPTION,
  applicationName: "Embedding Atlas",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Atlas" },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon.ico" }], apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "Embedding Atlas",
    description: DESCRIPTION,
    type: "website",
    siteName: "Embedding Atlas",
    images: [{ url: "/og.jpg", width: 1600, height: 960, alt: "Community water report over San Antonio on the Embedding Atlas globe" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Embedding Atlas",
    description: DESCRIPTION,
    images: ["/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#03070a",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // Let the HUD pad itself around the notch and the home indicator.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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
