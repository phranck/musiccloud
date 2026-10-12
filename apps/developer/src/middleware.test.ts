import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPortalAvailability: vi.fn(),
  renderPortalGateHtml: vi.fn((mode: string) => `<main>${mode}</main>`),
}));

vi.mock("./lib/portal-availability", () => ({
  getPortalAvailability: mocks.getPortalAvailability,
}));

vi.mock("./lib/coming-soon", () => ({
  PORTAL_GATE_CONTENT_SECURITY_POLICY: "default-src 'self'; style-src 'self' 'sha256-gate'",
  PortalGateMode: { ComingSoon: "comingSoon", Maintenance: "maintenance" },
  renderPortalGateHtml: mocks.renderPortalGateHtml,
}));

import { PORTAL_FONT_FACE_HASH } from "./lib/fonts";
import { onRequest } from "./middleware";

async function request(pathname: string, routeHeaders: Record<string, string> = {}) {
  const next = vi.fn(async () => new Response("portal", { status: 200, headers: routeHeaders }));
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

  /**
   * The gate pages enforce their complete policy. A Report-Only header beside
   * it would report the style block that policy allows by hash.
   */
  it("sends the gate page's own enforced policy in both gate states, and no Report-Only header", async () => {
    for (const availability of [null, { public: true, maintenance: true }]) {
      mocks.getPortalAvailability.mockResolvedValue(availability);

      const { response } = await request("/dashboard");

      expect(response.headers.get("content-security-policy")).toBe(
        "default-src 'self'; style-src 'self' 'sha256-gate'",
      );
      expect(response.headers.has("content-security-policy-report-only")).toBe(false);
    }
  });

  /**
   * Astro lists the hashes of what it emits. The portal's policy has to carry
   * them, the layout's font block, and room for the `style` attributes of
   * highlighted code, or the pages lose their scripts and their colors.
   */
  it("replaces Astro's policy with the portal's complete one, carrying Astro's hashes", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: true, maintenance: false });

    const { response } = await request("/pricing", {
      "content-security-policy": "script-src 'self' 'sha256-astro-script'; style-src 'self' 'sha256-astro-style';",
    });
    const directives = response.headers.get("content-security-policy")?.split("; ") ?? [];

    expect(directives).toContain("script-src 'self' 'sha256-astro-script'");
    expect(directives).toContain(`style-src 'self' 'sha256-astro-style' '${PORTAL_FONT_FACE_HASH}'`);
    expect(directives).toContain("style-src-attr 'unsafe-inline'");
    expect(directives).toContain("default-src 'self'");
    expect(directives).toContain("frame-ancestors 'self'");
    expect(response.headers.has("content-security-policy-report-only")).toBe(false);
  });

  it("completes the policy of the documentation, which stays reachable while the portal is closed", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: false, maintenance: false });

    const { response } = await request("/docs/guides/quickstart", {
      "content-security-policy": "script-src 'self' 'sha256-docs'; style-src 'self';",
    });

    expect(response.headers.get("content-security-policy")).toContain("script-src 'self' 'sha256-docs'");
  });

  /**
   * The API reference takes a third of a second to render and is the same for
   * every visitor, so one render serves the requests of the next minutes, with
   * the headers it was given.
   */
  it("renders the API reference once and serves it again with its complete policy", async () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(60 * 60 * 1000);
    mocks.getPortalAvailability.mockResolvedValue({ public: false, maintenance: false });
    const astroPolicy = { "content-security-policy": "script-src 'self' 'sha256-reference'; style-src 'self';" };

    const first = await request("/docs/api", astroPolicy);
    const second = await request("/docs/api/", astroPolicy);
    vi.useRealTimers();

    expect(first.next).toHaveBeenCalledOnce();
    expect(second.next).not.toHaveBeenCalled();
    expect(await second.response.text()).toBe("portal");
    expect(second.response.headers.get("content-security-policy")).toContain("script-src 'self' 'sha256-reference'");
    expect(second.response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });

  it("keeps the shared reported policy on a response Astro wrote no policy for, such as an endpoint", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: true, maintenance: false });

    const { response } = await request("/api/dev/projects");

    expect(response.headers.get("content-security-policy-report-only")).toContain("script-src 'self'");
  });

  it("keeps the complete system documentation namespace and its required assets reachable in every portal state", async () => {
    mocks.getPortalAvailability.mockResolvedValue({ public: false, maintenance: true });

    for (const pathname of [
      "/docs",
      "/docs/",
      "/docs/api",
      "/docs/api/",
      "/docs/arbitrary/future-guide",
      "/_astro/docs.js",
      "/developer-theme.css",
      "/favicon.svg",
      "/api/mc/script.js",
      "/api/mc/api/send",
    ]) {
      const { next, response } = await request(pathname);
      // The API reference may come from the render an earlier request left.
      const renders = pathname.startsWith("/docs/api") ? [0, 1] : [1];
      expect(renders).toContain(next.mock.calls.length);
      expect(mocks.getPortalAvailability).not.toHaveBeenCalled();
      expect(response.status).toBe(200);
    }
  });
});
