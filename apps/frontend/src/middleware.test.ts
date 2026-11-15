import { DESIGN_TOKENS_DEFAULTS } from "@musiccloud/shared";
import { inlineBlockHash } from "@musiccloud/shared/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchDesignTokens: vi.fn() }));

vi.mock("@/api/client", () => ({ fetchDesignTokens: mocks.fetchDesignTokens }));

import { designTokensToCss } from "@/lib/designTokensCss";
import { SITE_INLINE_SCRIPT_HASHES } from "@/lib/inline-scripts";
import { onRequest } from "./middleware";

/** Runs the middleware for a path whose route answers with the given headers. */
async function request(
  pathname: string,
  routeHeaders: Record<string, string> = {},
  shareTiming?: { correlationId: string; contentFetchMs?: number; shareFetchMs?: number },
  nextError?: Error,
  policyError?: Error,
) {
  const locals: {
    designTokensCss?: string;
    shareTiming?: { correlationId: string; contentFetchMs?: number; shareFetchMs?: number };
  } = {};
  if (shareTiming) locals.shareTiming = shareTiming;
  const next = vi.fn(async () => {
    if (nextError) throw nextError;
    const response = new Response("page", { headers: routeHeaders });
    if (policyError) {
      vi.spyOn(response.headers, "set").mockImplementation(() => {
        throw policyError;
      });
    }
    return response;
  });
  const response = (await onRequest(
    { url: new URL(`https://musiccloud.test${pathname}`), clientAddress: "203.0.113.7", locals } as never,
    next,
  )) as Response;
  return { locals, response };
}

const ASTRO_POLICY = "script-src 'self' 'sha256-astro-script'; style-src 'self' 'sha256-astro-style';";

beforeEach(() => {
  mocks.fetchDesignTokens.mockReset();
  mocks.fetchDesignTokens.mockResolvedValue(DESIGN_TOKENS_DEFAULTS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("site middleware", () => {
  /**
   * The layout writes the design tokens and the site's own scripts inline. The
   * policy has to name each of them, beside what Astro emitted, or the page
   * loses its material and its first-paint scripts.
   */
  it("replaces Astro's policy with the complete one, naming the page's own inline blocks", async () => {
    const { locals, response } = await request("/", { "content-security-policy": ASTRO_POLICY });
    const directives = response.headers.get("content-security-policy")?.split("; ") ?? [];
    const tokensCss = designTokensToCss(DESIGN_TOKENS_DEFAULTS);

    expect(locals.designTokensCss).toBe(tokensCss);
    expect(directives).toContain(
      ["script-src 'self'", "'sha256-astro-script'", ...SITE_INLINE_SCRIPT_HASHES.map((hash) => `'${hash}'`)].join(" "),
    );
    expect(directives).toContain(`style-src 'self' 'sha256-astro-style' '${inlineBlockHash(tokensCss)}'`);
    expect(directives).toContain("style-src-attr 'unsafe-inline'");
    expect(response.headers.has("content-security-policy-report-only")).toBe(false);
  });

  it("builds no design tokens for an API route, and keeps the reported policy where Astro wrote none", async () => {
    const { locals, response } = await request("/api/resolve");

    expect(mocks.fetchDesignTokens).not.toHaveBeenCalled();
    expect(locals.designTokensCss).toBeUndefined();
    expect(response.headers.get("content-security-policy-report-only")).toContain("script-src 'self'");
  });

  it("logs correlated share SSR timings without public timing headers", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const { response } = await request(
      "/sXfnNvip",
      {},
      {
        correlationId: "corr-123",
        contentFetchMs: 12,
        shareFetchMs: 20,
      },
    );

    const record = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      component: "SharePage",
      operation: "share_ssr",
      correlationId: "corr-123",
      route: "/[shortId]",
      statusCode: 200,
      contentFetchMs: 12,
      shareFetchMs: 20,
      totalSsrMs: expect.any(Number),
    });
    expect(response.headers.has("server-timing")).toBe(false);
  });

  it("logs total SSR time when rendering throws", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("render failed");

    await expect(request("/sXfnNvip", {}, { correlationId: "corr-error" }, failure)).rejects.toThrow("render failed");

    const record = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      correlationId: "corr-error",
      statusCode: 500,
      totalSsrMs: expect.any(Number),
    });
  });

  it("logs a failed status when post-processing throws after a 200 response", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const failure = new Error("policy failed");

    await expect(request("/sXfnNvip", {}, { correlationId: "corr-policy" }, undefined, failure)).rejects.toThrow(
      "policy failed",
    );

    const record = JSON.parse(String(infoSpy.mock.calls[0]?.[0]));
    expect(record).toMatchObject({
      correlationId: "corr-policy",
      statusCode: 500,
      totalSsrMs: expect.any(Number),
    });
  });
});
