import { describe, expect, it } from "vitest";

import { isManagedEditorialPath } from "./editorial";

describe("managed Developer Portal route selection", () => {
  it.each(["/privacy", "/company/about", "/documentation", "/dashboarding"])("allows the editorial path %s", (path) => {
    expect(isManagedEditorialPath(path)).toBe(true);
  });

  it.each(["/docs", "/pricing"])("serves the editorial copy at the reserved path %s", (path) => {
    // The portal owns both routes, because each knows which header tab is
    // current and `/pricing` has a signup notice to show. What a reader reads
    // on either is copy, so the lookup has to reach it.
    expect(isManagedEditorialPath(path)).toBe(true);
  });

  it.each([
    "/",
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
