import { loadRenderers } from "astro:container";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import CodeBlock from "./CodeBlock.astro";

async function renderCode(
  code: string,
  language: "bash" | "json" | "typescript" | "python" | "swift" | "php" | "go",
  fillAvailableHeight = false,
  syntaxHighlight = true,
  deferredSourceId?: string,
) {
  const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
  return container.renderToString(CodeBlock, {
    props: { code, language, fillAvailableHeight, syntaxHighlight, deferredSourceId },
  });
}

describe("CodeBlock", () => {
  it.each([
    "json",
    "typescript",
    "python",
    "swift",
    "php",
    "go",
  ] as const)("always numbers %s source", async (language) => {
    expect(await renderCode("let value = 1", language)).toContain("data-code-line-numbers");
  });

  it("never numbers shell commands", async () => {
    expect(
      await renderCode(Array.from({ length: 21 }, (_, index) => `echo ${index}`).join("\n"), "bash"),
    ).not.toContain("data-code-line-numbers");
  });

  it("starts vertical scrolling only after twenty lines", async () => {
    const twentyLines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join("\n");
    const twentyOneLines = `${twentyLines}\nline 21`;

    expect(await renderCode(twentyLines, "bash")).not.toContain("data-code-vertical-scroll");
    expect(await renderCode(twentyOneLines, "bash")).toContain("data-code-vertical-scroll");
    expect(await renderCode(twentyOneLines, "typescript")).toContain("data-code-vertical-scroll");
  });

  it("can fill a parent dialog while keeping the code frame as its scroll surface", async () => {
    const html = await renderCode('{\n  "openapi": "3.1.0"\n}', "json", true);

    expect(html).toContain("data-code-fill-available");
  });

  it("keeps an already formatted large document as escaped source instead of expanding it into syntax-token DOM", async () => {
    const html = await renderCode('{\n  "openapi": "3.1.0"\n}', "json", true, false);

    expect(html).toContain("&quot;openapi&quot;");
    expect(html).not.toContain('class="line"');
    expect(html).not.toContain("data-code-line-numbers");
  });

  it("keeps build-time syntax highlighting inert until a dialog opens", async () => {
    const html = await renderCode('{\n  "openapi": "3.1.0"\n}', "json", true, true, "contract-code-source");
    const deferredSource = html.match(
      /<script id="contract-code-source" type="application\/json">([\s\S]*?)<\/script>/,
    )?.[1];

    expect(html).toContain('id="contract-code-source"');
    expect(html).toContain('data-code-deferred-source="contract-code-source"');
    expect(html).toContain("data-code-line-numbers");
    expect(deferredSource).toBeDefined();
    expect(JSON.parse(deferredSource!)).toContain('class="shiki');
  });

  it("keeps documentation icon controls at the mobile touch-target size", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    const mobileControlRule = ".code-block__copy,\n    .api-reference-nav__toggle-all";
    const mobileControlRuleIndex = css.indexOf(mobileControlRule);

    expect(mobileControlRuleIndex).toBeGreaterThan(css.lastIndexOf(".code-block__copy {"));
    expect(mobileControlRuleIndex).toBeGreaterThan(
      css.indexOf(".api-reference-nav__toggle-all {\n    position: relative;"),
    );
    expect(css).toContain("@media (max-width: 63.999rem) {\n    .code-block__copy,");
    expect(css).toContain("width: var(--mc-size-control);");
    expect(css).toContain("min-height: var(--mc-size-control);");
    expect(css).toContain("height: var(--mc-size-control);");
  });

  it("renders one frame-free copy control that swaps to an equally sized success icon", async () => {
    const html = await renderCode("const value = 1", "typescript");
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    expect(html).toContain("data-copy-success");
    expect(html).toContain("data-copy-icon");
    expect(html).toContain("code-block__copy-icon");
    expect(html).toContain("code-block__copy-success-icon");
    expect(html).not.toContain("code-block__copy button button--icon");
    expect(html).toMatch(/<button[^>]*data-copy-code[\s\S]*data-copy-success/);
    expect(css).toMatch(/\.code-block__copy\s*\{[^}]*cursor:\s*pointer;/s);
    expect(css).toMatch(
      /\.code-block__copy-icon,[\s\S]*\.code-block__copy-success-icon\s*\{[^}]*width:\s*var\(--mc-size-icon-lg\);/s,
    );
  });
});
