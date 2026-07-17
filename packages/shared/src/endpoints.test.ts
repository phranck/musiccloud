import { describe, expect, it } from "vitest";
import { ENDPOINTS } from "./endpoints.js";

describe("endpoint catalog", () => {
  it("keeps the public Umami proxy while omitting retired admin analytics endpoints", () => {
    expect(ENDPOINTS.frontend.umami).toBe("/api/mc");
    expect(ENDPOINTS.admin).not.toHaveProperty("analytics");
  });
});
