import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("BACKEND_URL", "https://backend.test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("POST /api/cc/resolve", () => {
  it("answers with the error envelope when the backend cannot be reached", async () => {
    const refused = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(refused));
    vi.stubGlobal("console", { ...console, error: vi.fn() });
    const { POST } = await import("./resolve");

    const response = await POST({
      request: new Request("https://musiccloud.test/api/cc/resolve", {
        method: "POST",
        body: JSON.stringify({ selectedCandidate: "jamendo:1995543" }),
      }),
      clientAddress: "203.0.113.10",
    } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "MC-SYS-0002", errorId: expect.any(String) });
  });
});
