import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = join(process.cwd(), "src");
const routeSource = readFileSync(join(sourceRoot, "pages/[shortId].astro"), "utf8");
const contentProxySource = readFileSync(join(sourceRoot, "pages/api/v1/content/[slug].ts"), "utf8");

describe("share route error entrypoints", () => {
  it("uses the shared result resolver and error shell in synchronous rendering", () => {
    expect(routeSource).toContain("resolveShortRouteResults");
    expect(routeSource).toContain("ShareErrorShell");
    expect(routeSource).not.toMatch(/!contentPage\s*&&\s*!data/);
  });

  it("redirects to 404 only for an explicit not-found result", () => {
    expect(routeSource).toContain('routeResult.kind === "not-found"');
  });

  it("renders the complete share document synchronously for every client", () => {
    expect(routeSource).toContain("const [contentResult, shareResult] = await Promise.all");
    expect(routeSource).not.toContain("<DeferredShareContent");
    expect(routeSource).not.toContain("if (treatAsBot)");
    expect(routeSource).toContain("canonicalUrl={contentPage ?");
  });

  it("preserves backend error payloads and status codes in the content proxy", () => {
    expect(contentProxySource).toContain('result.kind === "error"');
    expect(contentProxySource).toContain("result.error");
    expect(contentProxySource).toContain("result.statusCode");
  });
});
