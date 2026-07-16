import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({
  backendUrl: (path: string) => `http://backend:4000${path}`,
  internalHeaders: () => ({ "X-API-Key": "test-key" }),
}));

import { getPortalAvailability } from "./portal-availability";

describe("getPortalAvailability", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns only a complete Boolean availability payload", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ public: true, maintenance: false })));

    await expect(getPortalAvailability()).resolves.toEqual({ public: true, maintenance: false });
  });

  it("fails closed and logs a redacted structured deviation for malformed data", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ public: "true", maintenance: false })));

    await expect(getPortalAvailability()).resolves.toBeNull();
    expect(warning).toHaveBeenCalledOnce();
    expect(warning.mock.calls[0]?.[0]).toContain('"errorCode":"MC-DEV-0001"');
    expect(warning.mock.calls[0]?.[0]).toContain('"outcome":"fail_closed"');

    warning.mockRestore();
  });
});
