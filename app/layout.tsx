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

export const metadata: Metadata = {
  title: "God's Eye View",
  description: "A spy satellite simulator in your browser, except the data is real.",
  applicationName: "God's Eye View",
};

export const viewport: Viewport = {
  themeColor: "#03070a",
  colorScheme: "dark",
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
