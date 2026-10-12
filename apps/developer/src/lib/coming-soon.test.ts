import { describe, expect, it } from "vitest";

import { PortalGateMode, renderPortalGateHtml } from "./coming-soon";

describe("renderPortalGateHtml", () => {
  it("renders maintenance copy while retaining the API reference link", () => {
    const html = renderPortalGateHtml(PortalGateMode.Maintenance);

    expect(html).toContain("musiccloud for developers · maintenance");
    expect(html).toContain("temporarily closed for maintenance");
    expect(html).toContain('href="/docs/api"');
  });

  /**
   * The content policy the middleware puts on these pages allows the portal's
   * own origin only, so a script, stylesheet, font or image from anywhere else
   * is a violation. The canonical link names the page's address and loads
   * nothing, so it stays absolute.
   */
  it.each(Object.values(PortalGateMode))("loads every resource of the %s page from the portal's own origin", (mode) => {
    const html = renderPortalGateHtml(mode);
    const tags = (html.match(/<(?:script|link|img)\b[^>]*>/g) ?? []).filter((tag) => !tag.includes('rel="canonical"'));
    const addresses = tags.flatMap((tag) => [...tag.matchAll(/\b(?:src|href)="([^"]*)"/g)].map((match) => match[1]));

    expect(addresses.length).toBeGreaterThan(0);
    for (const address of addresses) {
      expect(address.startsWith("/") && !address.startsWith("//"), address).toBe(true);
    }
  });
});
