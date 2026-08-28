import { describe, expect, it } from "vitest";
import { applySecurityHeaders, buildSecurityHeaders, SurfaceExposure } from "../security-headers.js";

describe("buildSecurityHeaders", () => {
  it("lets a public surface be framed by its own origin only", () => {
    const headers = buildSecurityHeaders(SurfaceExposure.Public);

    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
  });

  it("refuses framing of a private surface from anywhere", () => {
    const headers = buildSecurityHeaders(SurfaceExposure.Private);

    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("withholds the referrer entirely on a private surface", () => {
    // Dashboard URLs carry entity identifiers, which have no business
    // reaching another site as a referrer.
    expect(buildSecurityHeaders(SurfaceExposure.Private)["Referrer-Policy"]).toBe("no-referrer");
    expect(buildSecurityHeaders(SurfaceExposure.Public)["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("keeps every loading directive out of the enforced policy", () => {
    const enforced = buildSecurityHeaders(SurfaceExposure.Public)["Content-Security-Policy"];

    for (const directive of ["default-src", "script-src", "style-src", "img-src", "connect-src", "font-src"]) {
      expect(enforced).not.toContain(directive);
    }
  });

  it("reports the policy it is working towards without weakening it", () => {
    const reported = buildSecurityHeaders(SurfaceExposure.Public)["Content-Security-Policy-Report-Only"];

    expect(reported).toContain("default-src 'self'");
    expect(reported).toContain("script-src 'self'");
    // 'unsafe-inline' would silence exactly the reports that say which inline
    // blocks still need a nonce or a hash.
    expect(reported).not.toContain("unsafe-inline");
  });

  it("allows artwork and audio from any HTTPS origin", () => {
    // Both come from the streaming services' own CDNs, which are numerous and
    // change without notice.
    const reported = buildSecurityHeaders(SurfaceExposure.Public)["Content-Security-Policy-Report-Only"];

    expect(reported).toContain("img-src 'self' data: https:");
    expect(reported).toContain("media-src 'self' https:");
  });
});

describe("applySecurityHeaders", () => {
  it("sets every header on a response that has none", () => {
    const headers = new Headers();

    applySecurityHeaders(headers, SurfaceExposure.Public);

    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
  });

  it("leaves a header the route already chose", () => {
    const headers = new Headers({ "Referrer-Policy": "unsafe-url" });

    applySecurityHeaders(headers, SurfaceExposure.Public);

    expect(headers.get("Referrer-Policy")).toBe("unsafe-url");
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });
});
