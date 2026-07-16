import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("backendUrl", () => {
  it("defers a missing backend configuration error until a backend call is requested", async () => {
    vi.stubEnv("BACKEND_URL", "");
    vi.resetModules();

    const { backendUrl } = await import("./api");

    expect(() => backendUrl("/api/internal/developer/portal-availability")).toThrow("Missing BACKEND_URL");
  });
});
