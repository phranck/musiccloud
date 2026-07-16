import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPortalAvailability: vi.fn(),
  renderPortalGateHtml: vi.fn((mode: string) => `<main>${mode}</main>`),
}));

vi.mock("./lib/portal-availability", () => ({
  getPortalAvailability: mocks.getPortalAvailability,
}));

vi.mock("./lib/coming-soon", () => ({
  PortalGateMode: { ComingSoon: "comingSoon", Maintenance: "maintenance" },
  renderPortalGateHtml: mocks.renderPortalGateHtml,
}));

import { onRequest } from "./middleware";

async function request(pathname: string) {
  const next = vi.fn(async () => new Response("portal", { status: 200 }));
  const response = (await onRequest(
    { url: new URL(`https://developer.musiccloud.test${pathname}`) } as never,
    next,
  )) as Response;
  return { next, response };
}

describe("Developer Portal availability middleware", () => {
  beforeEach(() => {
    mocks.getPortalAvailability.mockReset();
    mocks.renderPortalGateHtml.mockClear();
  });

  it("fails closed to coming soon when the availability read fails", async () => {
    mocks.getPortalAvailability.mockResolvedValue(null);

    const { next, response } = await request("/dashboard");

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("comingSoon");
  });

  it("continues to the live portal when it is public and not in maintenance", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: true, maintenance: false });

    const { next, response } = await request("/pricing");

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it("serves maintenance at the original URL with a retryable 503", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: true, maintenance: true });

    const { next, response } = await request("/dashboard/api-keys");

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("300");
    expect(await response.text()).toContain("maintenance");
  });

  it("keeps the API reference and its required assets reachable in every portal state", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: false, maintenance: true });

    for (const pathname of ["/docs/api", "/_astro/docs.js", "/developer-theme.css", "/favicon.svg"]) {
      const { next, response } = await request(pathname);
      expect(next).toHaveBeenCalledOnce();
      expect(response.status).toBe(200);
    }
  });
});
