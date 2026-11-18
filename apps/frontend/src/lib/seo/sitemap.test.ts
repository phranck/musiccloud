import { SITE_ORIGIN } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { renderSitemapIndex, renderUrlSet, SITEMAP_PATH, sitemapAddresses } from "./sitemap";

describe("sitemap", () => {
  it("lists the home page and every published page at its canonical address", () => {
    const addresses = sitemapAddresses([
      { slug: "support-me", title: "Support musiccloud" },
      { slug: "privacy", title: "Privacy" },
    ]);

    expect(addresses).toEqual([
      `${SITE_ORIGIN.site}/`,
      `${SITE_ORIGIN.site}/support-me`,
      `${SITE_ORIGIN.site}/privacy`,
    ]);
  });

  it("writes each address as a url of the sitemap protocol, escaped", () => {
    const xml = renderUrlSet(["https://musiccloud.io/a?b=1&c=2"]);

    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain("<url><loc>https://musiccloud.io/a?b=1&amp;c=2</loc></url>");
  });

  it("points the index at the one list", () => {
    expect(renderSitemapIndex()).toContain(`<sitemap><loc>${SITE_ORIGIN.site}${SITEMAP_PATH}</loc></sitemap>`);
  });
});
