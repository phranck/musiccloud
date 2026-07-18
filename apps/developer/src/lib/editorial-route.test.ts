import { describe, expect, it } from "vitest";

import { isManagedEditorialPath } from "./editorial";

describe("managed Developer Portal route selection", () => {
  it.each(["/privacy", "/company/about", "/documentation", "/dashboarding"])("allows the editorial path %s", (path) => {
    expect(isManagedEditorialPath(path)).toBe(true);
  });

  it.each([
    "/",
    "/docs",
    "/docs/api",
    "/docs/arbitrary/future-guide",
    "/dashboard",
    "/dashboard/api-keys",
    "/api/dev/auth/me",
    "/auth/github",
    "/login",
    "/signup",
    "/forgot",
    "/reset",
    "/verify",
    "/pricing",
  ])("keeps the system or authenticated path %s outside editorial rendering", (path) => {
    expect(isManagedEditorialPath(path)).toBe(false);
  });

  it.each([
    "/docs/%2e%2e/privacy",
    "/docs/%2fprivacy",
    "/docs\\privacy",
    "/bad%ZZpath",
  ])("fails closed for malformed path %s", (path) => {
    expect(isManagedEditorialPath(path)).toBe(false);
  });
});
