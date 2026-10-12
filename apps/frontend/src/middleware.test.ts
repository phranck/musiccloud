import { DESIGN_TOKENS_DEFAULTS } from "@musiccloud/shared";
import { inlineBlockHash } from "@musiccloud/shared/node";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchDesignTokens: vi.fn() }));

vi.mock("@/api/client", () => ({ fetchDesignTokens: mocks.fetchDesignTokens }));

import { designTokensToCss } from "@/lib/designTokensCss";
import { SITE_INLINE_SCRIPT_HASHES } from "@/lib/inline-scripts";
import { onRequest } from "./middleware";

/** Runs the middleware for a path whose route answers with the given headers. */
async function request(pathname: string, routeHeaders: Record<string, string> = {}) {
  const locals: { designTokensCss?: string } = {};
  const next = vi.fn(async () => new Response("page", { headers: routeHeaders }));
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
});
