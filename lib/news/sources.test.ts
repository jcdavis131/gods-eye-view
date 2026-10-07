// The server readers' contracts that can be checked without a network.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FRED_SERIES } from "@/lib/economy/sources";
import { LL2_UPCOMING_KEY, LL2_UPCOMING_URL, NEWS_FRED_SERIES, publishedRundown } from "./sources";

const root = path.resolve(__dirname, "../..");

describe("shared caches", () => {
  it("asks Launch Library with exactly the URL and cache key /api/launches uses (15 requests an hour between them)", () => {
    const route = readFileSync(path.join(root, "app/api/launches/route.ts"), "utf8");
    expect(route).toContain(`"${LL2_UPCOMING_URL}"`);
    expect(route).toContain("`ll2:${which}`");
    expect(LL2_UPCOMING_KEY).toBe("ll2:upcoming");
  });
  it("reads only FRED series the economy reader knows", () => {
    for (const id of NEWS_FRED_SERIES) expect(FRED_SERIES.map((s) => s.id)).toContain(id);
  });
});

describe("publishedRundown", () => {
  it("is unset without NEWS_RUNDOWN_URL, so the desk runs on templates", async () => {
    expect(await publishedRundown({})).toEqual({ status: "unset" });
    expect(await publishedRundown({ NEWS_RUNDOWN_URL: "  " })).toEqual({ status: "unset" });
  });
  it("refuses anything but an https URL, before any fetch", async () => {
    expect(await publishedRundown({ NEWS_RUNDOWN_URL: "http://gist.githubusercontent.com/x/raw/rundown.json" })).toEqual({ status: "invalid-url", error: "NEWS_RUNDOWN_URL must be https" });
    expect(await publishedRundown({ NEWS_RUNDOWN_URL: "not a url" })).toEqual({ status: "invalid-url", error: "NEWS_RUNDOWN_URL is not a URL" });
  });
});
