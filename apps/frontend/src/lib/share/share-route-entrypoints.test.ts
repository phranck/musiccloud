import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const routeSource = readFileSync(join(sourceRoot, "pages/[shortId].astro"), "utf8");
const deferredSource = readFileSync(join(sourceRoot, "components/share/DeferredShareContent.astro"), "utf8");
const contentProxySource = readFileSync(join(sourceRoot, "pages/api/v1/content/[slug].ts"), "utf8");

describe("share route error entrypoints", () => {
  it("uses the shared result resolver in synchronous and deferred rendering", () => {
    for (const source of [routeSource, deferredSource]) {
      expect(source).toContain("resolveShortRouteResults");
      expect(source).toContain("ShareErrorShell");
      expect(source).not.toMatch(/!contentPage\s*&&\s*!data/);
    }
  });

  it("redirects to 404 only for an explicit not-found result", () => {
    expect(routeSource).toContain('routeResult.kind === "not-found"');
    expect(deferredSource).toContain('routeResult.kind === "not-found"');
  });

  it("preserves backend error payloads and status codes in the content proxy", () => {
    expect(contentProxySource).toContain('result.kind === "error"');
    expect(contentProxySource).toContain("result.error");
    expect(contentProxySource).toContain("result.statusCode");
  });
});
