import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { PORTAL_GATE_CONTENT_SECURITY_POLICY, PortalGateMode, renderPortalGateHtml } from "./coming-soon";

/** One directive of the gate policy, by name. */
function directive(name: string): string | undefined {
  return PORTAL_GATE_CONTENT_SECURITY_POLICY.split("; ").find((entry) => entry.startsWith(`${name} `));
}

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

  /**
   * The page enforces its policy, so a style block the policy does not name
   * by hash would leave the page unstyled. The test hashes what the page
   * rendered, which is the check the browser makes.
   */
  it.each(Object.values(PortalGateMode))("allows exactly the inline style the %s page renders", (mode) => {
    const html = renderPortalGateHtml(mode);
    const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]);
    const inlineScripts = (html.match(/<script\b[^>]*>/g) ?? []).filter((tag) => !/\ssrc=/.test(tag));

    expect(styles).toHaveLength(1);
    expect(inlineScripts).toEqual([]);
    const hash = createHash("sha256").update(styles[0]).digest("base64");
    expect(directive("style-src")).toBe(`style-src 'self' 'sha256-${hash}'`);
    expect(directive("script-src")).toBe("script-src 'self'");
  });
});
