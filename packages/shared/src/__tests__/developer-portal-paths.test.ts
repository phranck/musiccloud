import { describe, expect, it } from "vitest";
import {
  isPortalDocsNamespace,
  isPortalDocsNavigationUrl,
  isPortalOwnedDocsPath,
  isReservedDeveloperPortalPath,
  normalizeEditorialPath,
  tryNormalizeEditorialPath,
} from "../developer-portal-paths.js";

describe("normalizeEditorialPath", () => {
  it("canonicalizes leading, duplicate, and trailing separators", () => {
    expect(normalizeEditorialPath("privacy/")).toBe("/privacy");
    expect(normalizeEditorialPath("//docs//crawler-architecture")).toBe("/docs/crawler-architecture");
    expect(normalizeEditorialPath("/")).toBe("/");
    expect(normalizeEditorialPath("")).toBe("/");
  });

  it("decodes percent encoding before comparing", () => {
    expect(normalizeEditorialPath("/%64ocs/api")).toBe("/docs/api");
  });

  it.each(["/docs/%2e%2e/api", "/docs/../api", "/docs/./api"])("rejects traversal path %s", (path) => {
    expect(() => normalizeEditorialPath(path)).toThrow("traversal");
  });

  it.each(["/docs\\api", "/docs/%2fapi", "/docs/%5capi"])("rejects ambiguous separator %s", (path) => {
    expect(() => normalizeEditorialPath(path)).toThrow("separator");
  });

  it.each(["/a?b", "/a#b", "/a%3Fb"])("rejects a query, fragment or encoded one in %s", (path) => {
    expect(() => normalizeEditorialPath(path)).toThrow("invalid path characters");
  });

  it("answers null instead of throwing for the forms it refuses", () => {
    expect(tryNormalizeEditorialPath("/docs/../api")).toBeNull();
    expect(tryNormalizeEditorialPath("docs/api/")).toBe("/docs/api");
  });
});

describe("isReservedDeveloperPortalPath", () => {
  it.each(["/docs", "/docs/"])("leaves the docs landing page editorial: %s", (path) => {
    // Everything under `/docs` is the API reference and the search, which the
    // portal builds. The page a developer arrives at is copy, and copy belongs
    // in the dashboard.
    expect(isReservedDeveloperPortalPath(path)).toBe(false);
  });

  it.each([
    "/docs/crawler-architecture",
    "/docs/sdks/swift",
    "/docs/api",
    "/docs/api/openapi",
    "/login",
    "/signup/profile",
    "/auth/callback",
    "/api",
    "/dashboard/keys",
  ])("recognizes reserved path %s", (path) => {
    expect(isReservedDeveloperPortalPath(path)).toBe(true);
  });

  it.each([
    "/documentation",
    "/docsmith",
    "/privacy",
    "/dashboarding",
  ])("allows unrelated editorial path %s", (path) => {
    expect(isReservedDeveloperPortalPath(path)).toBe(false);
  });
});

describe("the two docs questions", () => {
  it.each([
    ["/docs", true, false],
    ["/docs/api", true, true],
    ["/docs/sdks/swift", true, true],
    ["/docsmith", false, false],
    ["/pricing", false, false],
    ["/", false, false],
  ])("%s is in the namespace: %s, owned by the portal: %s", (path, namespace, owned) => {
    expect(isPortalDocsNamespace(path)).toBe(namespace);
    expect(isPortalOwnedDocsPath(path)).toBe(owned);
  });
});

describe("isPortalDocsNavigationUrl", () => {
  it.each([
    "/docs",
    "/docs/",
    "/docs/api?tab=search",
    "/docs#top",
    "/%64ocs",
    "/docs/%2fapi",
  ])("keeps %s for the Docs system entry", (url) => {
    expect(isPortalDocsNavigationUrl(url)).toBe(true);
  });

  it.each([
    "/docsmith",
    "/pricing",
    "https://example.com/docs",
    "//example.com/docs",
    "/\\example.com/docs",
    "mailto:docs@example.com",
  ])("lets %s point elsewhere", (url) => {
    expect(isPortalDocsNavigationUrl(url)).toBe(false);
  });
});
