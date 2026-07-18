import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "./endpoints.js";

describe("endpoint catalog", () => {
  it("keeps the public Umami proxy while omitting retired admin analytics endpoints", () => {
    expect(ENDPOINTS.frontend.umami).toBe("/api/mc");
    expect(ENDPOINTS.admin).not.toHaveProperty("analytics");
  });

  it("exposes the contextual publications endpoint for stable page identities", () => {
    expect(ENDPOINTS.admin.pages.publications("page-123")).toBe("/api/admin/pages/page-123/publications");
  });
});
