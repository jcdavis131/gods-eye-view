import type { Metadata } from "next";
import Studio from "@/components/news/Studio";
import { NETWORK_NAME, NEWS_PATH } from "@/lib/news/network";
import { DISCLOSURE } from "@/lib/news/personas";
import { SITE_NAME } from "@/lib/seo/base";

const DESCRIPTION = `A round-the-clock news desk read by three cartoon anchors: the Embedding Atlas's live signals (earthquakes, severe weather warnings, wildfires, launches, space weather, economic series) as straight news, plus a wire of outlet headlines, each credited. ${DISCLOSURE.fictional} ${DISCLOSURE.scripts}`;

export const metadata: Metadata = {
  title: `${NETWORK_NAME} - ${SITE_NAME}`,
  description: DESCRIPTION,
  alternates: { canonical: NEWS_PATH },
  openGraph: { title: `${NETWORK_NAME} - ${SITE_NAME}`, description: DESCRIPTION, url: NEWS_PATH, type: "website", siteName: SITE_NAME },
  twitter: { card: "summary", title: `${NETWORK_NAME} - ${SITE_NAME}`, description: DESCRIPTION },
};

// The page itself is static: the studio's clock and data are the browser's.
export default function NewsPage() {
  return (
    <main>
      <Studio />
    </main>
  );
}
