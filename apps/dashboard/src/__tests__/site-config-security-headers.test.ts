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

  it("enforces the complete policy, with scripts from its own origin only", () => {
    const directives = expected["Content-Security-Policy"].split("; ");

    expect(directives).toContain("script-src 'self'");
    expect(directives).toContain("default-src 'self'");
    expect(siteConfig).not.toContain("Content-Security-Policy-Report-Only");
  });

  /**
   * The editors, the overlays and the email preview write styles at runtime,
   * so styles may be inline. Scripts never may, which is what stops an
   * injected script.
   */
  it("allows inline styles and never inline scripts", () => {
    const directives = expected["Content-Security-Policy"].split("; ");

    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
    expect(directives.filter((directive) => directive.includes("unsafe-inline"))).toHaveLength(1);
    expect(expected["Content-Security-Policy"]).not.toContain("unsafe-eval");
  });
});
