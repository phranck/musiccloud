import { describe, expect, it } from "vitest";
import {
  applySecurityHeaders,
  buildEnforcedContentSecurityPolicy,
  buildSecurityHeaders,
  hashesFromAstroPolicy,
  SurfaceExposure,
} from "../security-headers.js";

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

  it("enforces a private surface's complete policy, with inline styles and no inline scripts", () => {
    const headers = buildSecurityHeaders(SurfaceExposure.Private);
    const directives = headers["Content-Security-Policy"].split("; ");

    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("script-src 'self'");
    expect(directives).toContain("style-src 'self' 'unsafe-inline'");
    expect(headers).not.toHaveProperty("Content-Security-Policy-Report-Only");
  });

  it("keeps every loading directive out of a public surface's enforced policy", () => {
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

describe("buildEnforcedContentSecurityPolicy", () => {
  const directives = (policy: string) => policy.split("; ");

  it("enforces every loading directive, with the given hashes added to their own source list", () => {
    const policy = directives(
      buildEnforcedContentSecurityPolicy(SurfaceExposure.Public, {
        styleHashes: ["sha256-style"],
        scriptHashes: ["sha256-script"],
      }),
    );

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("script-src 'self' 'sha256-script'");
    expect(policy).toContain("style-src 'self' 'sha256-style'");
    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("frame-ancestors 'self'");
  });

  it("allows no inline script or style on a public surface that it was not given a hash for", () => {
    const policy = directives(buildEnforcedContentSecurityPolicy(SurfaceExposure.Public));

    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("style-src 'self'");
    expect(policy.join("; ")).not.toContain("unsafe-inline");
  });

  it("admits style attributes in their own directive, while style elements stay on hashes", () => {
    const policy = directives(
      buildEnforcedContentSecurityPolicy(SurfaceExposure.Public, {
        styleHashes: ["sha256-style"],
        styleAttributes: true,
      }),
    );

    expect(policy).toContain("style-src 'self' 'sha256-style'");
    expect(policy).toContain("style-src-attr 'unsafe-inline'");
    expect(policy.filter((directive) => directive.includes("unsafe-inline"))).toHaveLength(1);
  });
});

describe("hashesFromAstroPolicy", () => {
  it("reads the script and style hashes Astro wrote, and nothing else", () => {
    const astroPolicy =
      "base-uri 'self';object-src 'none'; script-src 'self' 'sha256-one' 'sha384-two'; style-src 'self' 'sha256-three';";

    expect(hashesFromAstroPolicy(astroPolicy)).toEqual({
      scriptHashes: ["sha256-one", "sha384-two"],
      styleHashes: ["sha256-three"],
    });
  });

  it("reads nothing from a policy without hashes", () => {
    expect(hashesFromAstroPolicy("script-src 'self'; style-src 'self';")).toEqual({
      scriptHashes: [],
      styleHashes: [],
    });
  });
});

describe("applySecurityHeaders", () => {
  /**
   * A Report-Only header beside a route's complete policy would report the
   * very inline blocks that policy allows by hash.
   */
  it("keeps a route's own content policy whole and adds no Report-Only header beside it", () => {
    const headers = new Headers({ "Content-Security-Policy": "default-src 'self'; style-src 'self' 'sha256-x'" });

    applySecurityHeaders(headers, SurfaceExposure.Public);

    expect(headers.get("Content-Security-Policy")).toBe("default-src 'self'; style-src 'self' 'sha256-x'");
    expect(headers.has("Content-Security-Policy-Report-Only")).toBe(false);
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

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
