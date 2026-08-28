import { readFileSync } from "node:fs";
import { buildSecurityHeaders, SurfaceExposure } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";

/**
 * The dashboard is served by nginx, which cannot import the shared policy the
 * two Astro apps apply directly. Its header values are therefore written out in
 * `site_config.tmpl` by hand, and this is what stops the copy drifting from the
 * original. Without it, changing the policy in one place would quietly leave
 * the admin surface on the old one, which is the exact shape of the problem
 * that made these headers missing in the first place.
 */
describe("dashboard nginx security headers", () => {
  const siteConfig = readFileSync("site_config.tmpl", "utf8");
  const expected = buildSecurityHeaders(SurfaceExposure.Private);

  it.each(Object.entries(expected))("declares %s with the shared value", (name, value) => {
    expect(siteConfig).toContain(`add_header ${name} "${value}" always;`);
  });

  it("refuses framing outright, because this surface is behind a login", () => {
    expect(expected["X-Frame-Options"]).toBe("DENY");
    expect(expected["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("keeps the loading directives out of the enforced policy", () => {
    // Enforcing script-src while the SPA shell and its inline blocks are
    // unhashed would serve a blank page. Those directives are Report-Only
    // until each violation has been answered.
    expect(expected["Content-Security-Policy"]).not.toContain("script-src");
    expect(expected["Content-Security-Policy-Report-Only"]).toContain("script-src 'self'");
  });

  it("does not weaken the reported policy with unsafe-inline", () => {
    expect(expected["Content-Security-Policy-Report-Only"]).not.toContain("unsafe-inline");
  });
});
