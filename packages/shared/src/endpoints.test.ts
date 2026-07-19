import { describe, expect, it } from "vitest";
import { ENDPOINTS, ROUTE_TEMPLATES } from "./endpoints.js";

describe("endpoint catalog", () => {
  it("keeps the public Umami proxy while omitting retired admin analytics endpoints", () => {
    expect(ENDPOINTS.frontend.umami).toBe("/api/mc");
    expect(ENDPOINTS.admin).not.toHaveProperty("analytics");
  });

  it("exposes the contextual publications endpoint for stable page identities", () => {
    expect(ENDPOINTS.admin.pages.publications("page-123")).toBe("/api/admin/pages/page-123/publications");
  });

  it("exposes the atomic navigation configuration endpoint", () => {
    expect(ENDPOINTS.admin.navigations.configuration).toBe("/api/admin/nav");
    expect(ENDPOINTS.admin.navigations.detail("header")).toBe("/api/admin/nav/header");
  });

  it("does not expose editorial translation routes", () => {
    expect(ENDPOINTS.admin.pages).not.toHaveProperty("translations");
    expect(ROUTE_TEMPLATES.admin.pages).not.toHaveProperty("translationsList");
    expect(ROUTE_TEMPLATES.admin.pages).not.toHaveProperty("translationsDetail");
  });

  it("exposes narrow internal Developer Portal editorial reads", () => {
    expect(ENDPOINTS.internal.developer.editorial.page("/company/about")).toBe(
      "/api/internal/developer/editorial/page?path=%2Fcompany%2Fabout",
    );
    expect(ENDPOINTS.internal.developer.editorial.navigation("main")).toBe(
      "/api/internal/developer/editorial/navigation/main",
    );
    expect(ENDPOINTS.internal.developer.editorial.navigation("footer")).toBe(
      "/api/internal/developer/editorial/navigation/footer",
    );
  });
});
