import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { type StyleSource, scanDeveloperStyles } from "./design-system-guard";

const sourceRoot = join(import.meta.dirname, "..");
const appRoot = join(sourceRoot, "..");

/** Reads a Developer Portal source file relative to `apps/developer`. */
function readDeveloperFile(path: string): string {
  return readFileSync(join(appRoot, path), "utf8");
}

/** Collects every authored stylesheet-bearing source file below `src`. */
function collectStyleSources(directory: string): StyleSource[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectStyleSources(path);
    if (!/\.(?:astro|css|tsx)$/.test(entry.name)) return [];

    return [{ path: path.slice(appRoot.length + 1), content: readFileSync(path, "utf8") }];
  });
}

/** Collects authored files below a directory for structural source-tree assertions. */
function collectFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);

    return [path.slice(appRoot.length + 1)];
  });
}

describe("developer design system", () => {
  it("loads one canonical runtime theme in the app and coming-soon fallback", () => {
    const theme = readDeveloperFile("public/developer-theme.css");
    const layout = readDeveloperFile("src/layouts/BaseLayout.astro");
    const fallback = readDeveloperFile("src/lib/coming-soon.ts");

    expect(theme).toContain("--mc-color-accent:");
    expect(theme).toContain("--mc-space-page-inline:");
    expect(theme).toMatch(/@media \(max-width: 40rem\)[\s\S]*--mc-space-page-inline:\s*0\.75rem;/);
    expect(theme).toContain("--mc-motion-duration-fast:");
    expect(layout).toContain('href="/developer-theme.css"');
    expect(fallback).toContain('href="/developer-theme.css"');
    expect(fallback).not.toContain("--sky-top:");
  });

  it("uses compact 10px padding for ContentCard bodies and headers", () => {
    const theme = readDeveloperFile("public/developer-theme.css");

    expect(theme).toContain("--mc-space-content-card: 0.625rem;");
    expect(theme).toContain("--mc-space-content-card-header: 0.625rem;");
  });

  it("derives the enlarged API card radius outside-in", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toContain("--mc-docs-content-card-radius: calc(var(--radius-card) + var(--mc-space-1));");
    expect(docs).toContain("calc(var(--mc-docs-content-card-radius) - var(--mc-docs-content-panel-inset))");
    expect(docs).toContain("calc(var(--mc-docs-content-panel-radius) - var(--mc-space-1) - var(--mc-docs-space-xs))");
    expect(docs).toContain("--mc-docs-schema-toggle-radius-trim: 1px;");
    expect(docs).toContain(
      "calc(var(--mc-docs-content-panel-radius) - var(--mc-space-1) - var(--mc-docs-schema-toggle-radius-trim))",
    );
    expect(docs).toMatch(/\.content-card\s*\{[^}]*border-radius:\s*var\(--mc-docs-content-card-radius\);/s);
  });

  it("uses the approved Accent mist treatment for inline OpenAPI code", () => {
    const theme = readDeveloperFile("public/developer-theme.css");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(theme).toContain("--mc-color-inline-code-bg:");
    expect(theme).toContain("--mc-color-inline-code-fg:");
    expect(docs).toContain("--mc-docs-inline-code-radius:");
    expect(docs).toContain("--mc-docs-inline-code-padding-block-start:");
    expect(docs).toMatch(
      /\.openapi-markdown code\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*var\(--mc-docs-inline-code-radius\);[^}]*background:\s*var\(--mc-color-inline-code-bg\);[^}]*padding:\s*var\(--mc-docs-inline-code-padding-block-start\) var\(--mc-space-1\) var\(--mc-docs-space-xs\);[^}]*color:\s*var\(--mc-color-inline-code-fg\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card__field-value-type,\s*\.schema-card__field-presence-badge\s*\{[^}]*border-radius:\s*var\(--mc-docs-inline-code-radius\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card__field-value-type\s*\{[^}]*padding:\s*var\(--mc-docs-space-xs\) var\(--mc-docs-space-sm\) calc\(var\(--mc-docs-space-xs\) \+ 1px\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card__field-presence-badge\s*\{[^}]*padding:\s*var\(--mc-docs-space-xs\) var\(--mc-docs-space-sm\) calc\(var\(--mc-docs-space-xs\) \+ 1px\);/s,
    );
    expect(docs).toMatch(/\.openapi-markdown pre code\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;/s);
  });

  it("distinguishes included and optional response keys without reusing request-required styling", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\.schema-card__field-presence-badge\[data-key-presence="included"\]\s*\{[^}]*color:\s*var\(--color-success\);[^}]*background:\s*color-mix\(in srgb, var\(--color-success\) 12%, transparent\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card__field-presence-badge\[data-key-presence="optional"\]\s*\{[^}]*color:\s*var\(--color-warning\);[^}]*background:\s*color-mix\(in srgb, var\(--color-warning\) 12%, transparent\);/s,
    );
  });

  it("provides a reusable segmented control with API-schema-specific compact geometry", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(components).toMatch(
      /\.segmented-control\s*\{[^}]*border-radius:\s*var\(--segmented-control-radius, var\(--radius-button\)\);[^}]*padding:\s*var\(--segmented-control-inset, var\(--mc-space-1\)\);/s,
    );
    expect(components).toMatch(
      /\.segmented-control__item\s*\{[^}]*min-height:\s*var\(--segmented-control-item-min-height, var\(--mc-size-control-compact\)\);[^}]*border-radius:\s*var\(--segmented-control-item-radius, var\(--radius-button\)\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card\s*\{[^}]*--segmented-control-radius:\s*var\(--mc-docs-schema-toggle-radius\);[^}]*--segmented-control-item-radius:\s*var\(--mc-docs-schema-toggle-tab-radius\);/s,
    );
    expect(docs).toContain(
      "--mc-docs-schema-toggle-radius: max(0px, calc(var(--mc-docs-content-panel-radius) - var(--mc-space-1) - var(--mc-docs-schema-toggle-radius-trim)));",
    );
  });

  it("keeps a softer token-derived separator below the key-documentation table heading only", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toContain(
      "--mc-docs-schema-field-separator: color-mix(in srgb, var(--color-border) 68%, transparent);",
    );
    expect(docs).toMatch(
      /\.schema-card__field-heading\s*\{[^}]*border-bottom:\s*1px solid var\(--mc-docs-schema-field-separator\);/s,
    );
    expect(docs).toMatch(
      /\.schema-card__field-heading\s*\{[^}]*border-top:\s*1px solid var\(--mc-docs-schema-field-separator\);/s,
    );
    expect(docs).not.toMatch(
      /\.schema-card__field-name,[\s\S]*\.schema-card__field-description\s*\{[^}]*border-bottom:/s,
    );
    expect(docs).not.toContain(".schema-card__field-body > .schema-card__field:last-child > *");
  });

  it("keeps the global stylesheet as an ordered import entry point", () => {
    const globalCss = readDeveloperFile("src/styles/global.css");

    expect(globalCss.trim()).toBe(
      [
        '@import "tailwindcss";',
        '@import "./tokens.css";',
        '@import "./base.css";',
        '@import "./components.css";',
      ].join("\n"),
    );
  });

  it("declares the canonical cascade order before every component layer", () => {
    const layerOrder = "@layer properties, theme, base, components, utilities;";
    const componentStyles = ["src/styles/components.css", "src/styles/docs.css", "src/styles/pricing-material.css"];

    for (const path of componentStyles) {
      expect(readDeveloperFile(path).startsWith(`${layerOrder}\n`), path).toBe(true);
    }
  });

  it("centers text-leading icons on the first rendered line", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const searchDialog = readDeveloperFile("src/components/docs/SearchDialog.tsx");

    expect(components).toMatch(/\.page-heading\s*\{[^}]*align-items:\s*flex-start;/s);
    expect(components).toMatch(/\.page-heading__icon\s*\{[^}]*margin-block-start:\s*calc\(/s);
    expect(components).toMatch(
      /\.icon-text-first-line__icon\s*\{[^}]*height:\s*1lh;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
    expect(searchDialog).toContain("search-dialog__result-icon icon-text-first-line__icon");
  });

  it("centers API section icons against the trimmed visible heading text", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(/\.api-content__chapter-header\s*\{[^}]*align-items:\s*center;/s);
    expect(docs).toMatch(/\.api-content__chapter-header-title\s*\{[^}]*text-box:\s*trim-both cap alphabetic;/s);
    expect(docs).toMatch(
      /\.api-content__chapter-header-icon\s*>\s*\.mc-icon\s*\{[^}]*width:\s*100%;[^}]*height:\s*100%;/s,
    );
  });

  it("separates outer ContentCard entries with a dedicated spacing token", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toContain("--mc-docs-entry-card-gap: var(--mc-space-7);");
    expect(docs).toMatch(/\.api-content__entry\s*\{[^}]*margin-bottom:\s*var\(--mc-docs-entry-card-gap\);/s);
  });

  it("uses lead typography for API card section headings", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(/\.content-card__section-title\s*\{[^}]*font-size:\s*var\(--text-lead\);/s);
    expect(docs).toMatch(/\.content-card__section-title\s*\{[^}]*font-weight:\s*400;/s);
    expect(docs).toMatch(
      /\.content-card__section-icon\s*\{[^}]*width:\s*var\(--mc-size-icon-lg\);[^}]*height:\s*var\(--mc-size-icon-lg\);/s,
    );
  });

  it("keeps required parameter badges in a dedicated trailing header column", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\.parameter-card__header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content max-content minmax\(0, 1fr\) max-content;/s,
    );
    expect(docs).toMatch(/\.parameter-card__requirement\s*\{[^}]*grid-column:\s*4;/s);
  });

  it("keeps nested documentation content shrinkable inside cards", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\.content-card__body-intro,[\s\S]*?\.content-card__section-body\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(docs).toMatch(
      /\.content-panel-list,[\s\S]*?\.sdk-metadata-list\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);/,
    );
    expect(docs).toMatch(
      /\.code-block,[\s\S]*?\.code-block__frame\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;/,
    );
    expect(docs).toMatch(/\.openapi-markdown\s*\{[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(docs).toMatch(/\.response-card__summary\s*\{[\s\S]*?display:\s*grid;[\s\S]*?block-size:\s*max-content;/);
  });

  it("reports raw style drift with path, line, and offending value", () => {
    const diagnostics = scanDeveloperStyles([
      {
        path: "src/components/Fixture.astro",
        content: '<div class="rounded-[9px] gap-[13px]" style="color: #ff0000"></div>',
      },
    ]);

    expect(diagnostics).toEqual([
      { path: "src/components/Fixture.astro", line: 1, rule: "raw-color", value: "#ff0000" },
      { path: "src/components/Fixture.astro", line: 1, rule: "structural-utility", value: "rounded-[9px]" },
      { path: "src/components/Fixture.astro", line: 1, rule: "structural-utility", value: "gap-[13px]" },
    ]);
  });

  it("keeps authored Developer Portal sources free from raw style drift", () => {
    expect(scanDeveloperStyles(collectStyleSources(sourceRoot))).toEqual([]);
  });

  it("keeps test modules outside Astro's file-based route tree", () => {
    const routeTests = collectFiles(join(sourceRoot, "pages")).filter((path) => /\.(?:test|spec)\.[^.]+$/.test(path));

    expect(routeTests).toEqual([]);
  });
});
