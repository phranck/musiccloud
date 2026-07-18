import { describe, expect, it } from "vitest";
import { isReservedDeveloperPortalPath, normalizeEditorialPath } from "./editorial-path.js";

describe("normalizeEditorialPath", () => {
  it("canonicalizes leading, duplicate, and trailing separators", () => {
    expect(normalizeEditorialPath("privacy/")).toBe("/privacy");
    expect(normalizeEditorialPath("//docs//crawler-architecture")).toBe("/docs/crawler-architecture");
    expect(normalizeEditorialPath("/")).toBe("/");
  });

  it.each(["/docs/%2e%2e/api", "/docs/../api", "/docs/./api"])("rejects traversal path %s", (path) => {
    expect(() => normalizeEditorialPath(path)).toThrow("traversal");
  });

  it.each(["/docs\\api", "/docs/%2fapi", "/docs/%5capi"])("rejects ambiguous separator %s", (path) => {
    expect(() => normalizeEditorialPath(path)).toThrow("separator");
  });
});

describe("isReservedDeveloperPortalPath", () => {
  it.each([
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

  it.each(["/docs", "/docs/crawler-architecture", "/privacy", "/dashboarding"])("allows editorial path %s", (path) => {
    expect(isReservedDeveloperPortalPath(path)).toBe(false);
  });
});
