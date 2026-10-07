import { describe, expect, it } from "vitest";
import sitemap from "./sitemap";
import { absoluteUrl } from "@/lib/seo/base";

describe("sitemap", () => {
  it("lists the globe, the three hubs and the news studio", () => {
    expect(sitemap().map((e) => e.url)).toEqual(["/", "/place", "/metro", "/state", "/news"].map((p) => absoluteUrl(p)));
  });
});
