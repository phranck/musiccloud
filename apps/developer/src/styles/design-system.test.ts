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

  it("uses three blue and two yellow blobs for the static portal aurora", () => {
    const background = readDeveloperFile("src/components/DeveloperBackground.astro");
    const theme = readDeveloperFile("public/developer-theme.css");

    expect(background).toContain('const blobColors = ["blue", "yellow"] as const;');
    expect((background.match(/grad: "blue"/g) ?? []).length).toBe(3);
    expect((background.match(/grad: "yellow"/g) ?? []).length).toBe(2);
    expect(background).toContain('{ cx: 520, cy: 760, rx: 410, ry: 300, grad: "yellow", op: 0.38 }');
    expect(background).toContain('{ cx: 1190, cy: 710, rx: 390, ry: 290, grad: "blue", op: 0.34 }');
    expect(background).toContain('<stop offset="42%" stop-color={blobColor[name]} stop-opacity="0.38" />');
    expect(background).toContain('<stop offset="72%" stop-color={blobColor[name]} stop-opacity="0.1" />');
    expect(theme).toContain("--mc-color-aurora-blue: #005383;");
    expect(theme).toContain("--mc-color-aurora-yellow: #f4d20096;");
    expect(theme).toContain("--mc-color-sky-top: #04111b;");
    expect(theme).toContain("--mc-color-sky-mid: #04111b;");
    expect(theme).toContain("--mc-color-sky-bottom: #04111b;");
    expect(theme).toContain("--mc-background-aurora-blur: 44px;");
    expect(theme).toContain("--mc-background-aurora-opacity: 0.46;");
  });

  it("keeps ContentCard surfaces concentric while limiting the inner-radius inset to copy slots", () => {
    const theme = readDeveloperFile("public/developer-theme.css");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(theme).toContain("--mc-space-content-card: 0.625rem;");
    expect(theme).toContain("--mc-space-content-card-header: 0.625rem;");
    expect(docs).toContain("--mc-docs-content-card-copy-inset: calc(var(--mc-docs-content-card-radius) / 2);");
    expect(docs).toMatch(
      /\.content-card__header,[\s\S]*?\.content-card__footer\s*\{[^}]*padding:\s*var\(--space-content-card-header\);/,
    );
    expect(docs).toMatch(/\.content-card__body\s*\{[^}]*padding:\s*var\(--space-content-card\);/s);
    expect(docs).toMatch(
      /\.content-card__body-intro,[\s\S]*?\.content-card__copy\s*\{[^}]*padding-inline:\s*var\(--mc-docs-content-card-copy-inset\);/s,
    );
  });

  it("keeps every Card surface at 10px while insetting only SDK copy", () => {
    const docs = readDeveloperFile("src/styles/docs.css");
    const sdkCard = readDeveloperFile("src/components/docs/SdkSegmentedCard.astro");

    expect(docs).not.toMatch(
      /\.content-card__body-stack\s*\{[^}]*padding-inline:/s,
    );
    expect(docs).toMatch(
      /\.content-card__copy\s*\{[^}]*gap:\s*var\(--mc-space-6\);[^}]*padding-inline:\s*var\(--mc-docs-content-card-copy-inset\);/s,
    );
    expect(sdkCard).toContain("<SegmentedCard.Body.Panel.Copy>");
  });

  it("insets and brightens CodeBlock labels without moving their code surfaces", () => {
    const codeBlock = readDeveloperFile("src/components/docs/CodeBlock.astro");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(codeBlock).toContain('class="code-block__label text-code');
    expect(docs).toMatch(
      /\.code-block__label\s*\{[^}]*padding-inline:\s*var\(--mc-docs-content-card-copy-inset\);[^}]*color:\s*var\(--color-fg-muted\);/s,
    );
  });

  it("uses the readable muted tone for SDK metadata labels", () => {
    const sdkCard = readDeveloperFile("src/components/docs/SdkSegmentedCard.astro");

    expect(sdkCard).toContain('<dt class="text-fg-muted">Archive</dt>');
    expect(sdkCard).toContain('<dt class="text-fg-muted">SHA-256</dt>');
  });

  it("uses the shared square key-cap compound for every portal keyboard hint", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const header = readDeveloperFile("src/components/PublicHeader.astro");
    const search = readDeveloperFile("src/components/docs/ApiDocumentSearch.tsx");
    const theme = readDeveloperFile("public/developer-theme.css");
    const tokens = readDeveloperFile("src/styles/tokens.css");

    expect(theme).toContain("--mc-radius-keycap: 0.3125rem;");
    expect(tokens).toContain("--radius-keycap: var(--mc-radius-keycap);");
    expect(components).toMatch(
      /\.keycap\s*\{[^}]*--mc-keycap-size:\s*calc\(1em \+ var\(--mc-space-1\)\);[^}]*--mc-keycap-radius:\s*var\(--radius-keycap\);[^}]*--mc-keycap-surface:\s*color-mix\(in srgb, var\(--color-surface-raised\) 92%, var\(--color-fg\) 8%\);[^}]*color:\s*var\(--color-fg-muted\);/s,
    );
    expect(components).toMatch(
      /\.keycap__key\s*\{[^}]*aspect-ratio:\s*1;[^}]*border:\s*0;[^}]*border-radius:\s*var\(--mc-keycap-radius\);[^}]*background:\s*var\(--mc-keycap-surface\);/s,
    );
    expect(header).toContain('<KeyCap shortcut={PUBLIC_SEARCH_COMMAND.shortcut} />');
    expect(search).toContain('<KeyCap shortcut="Esc" />');
  });

  it("keeps KeyCap as a Fast Refresh-safe, single-pass component export", () => {
    const keyCap = readDeveloperFile("src/components/KeyCap.tsx");

    expect(keyCap).toContain("export function KeyCap");
    expect(keyCap).not.toContain("Object.assign");
    expect(keyCap).not.toContain(".filter(");
  });

  it("uses the 16px portal card radius and keeps API cards cascade-safe", () => {
    const theme = readDeveloperFile("public/developer-theme.css");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(theme).toContain("--mc-radius-card: 1rem;");
    expect(docs).toContain("--mc-docs-content-card-radius: var(--radius-card);");
    expect(docs).toContain("calc(var(--mc-docs-content-card-radius) - var(--mc-docs-content-panel-inset))");
    expect(docs).toContain("calc(var(--mc-docs-content-panel-radius) - var(--mc-space-1) - var(--mc-docs-space-xs))");
    expect(docs).toContain("--mc-docs-schema-toggle-radius-trim: 1px;");
    expect(docs).toContain(
      "calc(var(--mc-docs-content-panel-radius) - var(--mc-space-1) - var(--mc-docs-schema-toggle-radius-trim))",
    );
    expect(docs).toMatch(
      /\.surface-card\.content-card\s*\{[^}]*border-radius:\s*var\(--mc-docs-content-card-radius\);/s,
    );
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
    const theme = readDeveloperFile("public/developer-theme.css");
    const components = readDeveloperFile("src/styles/components.css");
    const docs = readDeveloperFile("src/styles/docs.css");
    const home = readDeveloperFile("src/pages/index.astro");
    const docsLanding = readDeveloperFile("src/pages/docs/index.astro");
    const pricing = readDeveloperFile("src/pages/pricing.astro");
    const usage = readDeveloperFile("src/pages/dashboard/usage.astro");
    const apiKeys = readDeveloperFile("src/components/dashboard/ApiKeysPanel.tsx");
    const apiSearch = readDeveloperFile("src/components/docs/ApiDocumentSearch.tsx");
    const searchDialog = readDeveloperFile("src/components/docs/SearchDialog.tsx");

    expect(theme).toContain("--mc-size-text-icon: 1.2cap;");
    expect(docs).toContain("--mc-docs-section-icon-size: calc(var(--mc-size-text-icon) + 2px);");
    expect(components).toMatch(
      /\.page-heading\s*\{[^}]*align-items:\s*flex-start;[^}]*font-size:\s*var\(--text-hero\);[^}]*line-height:\s*1;/s,
    );
    expect(components).toMatch(
      /\.page-heading__icon\s*\{[^}]*width:\s*var\(--mc-size-text-icon\);[^}]*height:\s*var\(--mc-size-text-icon\);[^}]*margin-block-start:\s*calc\(\(1cap - var\(--mc-size-text-icon\)\) \/ 2\);/s,
    );
    expect(components).toMatch(/\.page-heading__title\s*\{[^}]*text-box:\s*trim-both cap alphabetic;/s);
    expect(components).toMatch(
      /\.icon-text-first-line__icon\s*\{[^}]*width:\s*var\(--mc-size-text-icon\);[^}]*height:\s*1lh;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s,
    );
    expect(components).toMatch(
      /\.icon-text-first-line__icon > \.mc-icon,[\s\S]*?\.icon-text-first-line__icon > svg\s*\{[^}]*width:\s*var\(--mc-size-text-icon\);[^}]*height:\s*var\(--mc-size-text-icon\);/s,
    );
    expect(docs).toMatch(
      /\.content-card__section-header\s*\{[^}]*font-size:\s*var\(--text-lead\);[^}]*line-height:\s*1\.25;/s,
    );
    expect(docs).toMatch(
      /\.content-card__section-icon\s*\{[^}]*width:\s*var\(--mc-docs-section-icon-size\);[^}]*height:\s*1lh;[^}]*align-items:\s*center;/s,
    );
    expect(docs).toMatch(
      /\.search-dialog__result\s*\{[^}]*grid-template-columns:\s*var\(--mc-size-text-icon\) minmax\(0, 1fr\) max-content;[^}]*font-size:\s*var\(--text-body\);/s,
    );
    expect(home).not.toMatch(/<Icon className="size-7 text-accent"/);
    expect(docsLanding).not.toMatch(/<(?:LinkIcon|BookIcon|KeyIcon|Icon) className="size-[56] text-accent"/);
    expect(pricing).not.toMatch(/<TickCircleIcon className="(?:pricing-commitment-icon )?size-4/);
    expect(usage).not.toMatch(/<DiagramIcon className="size-5"/);
    expect(apiKeys).not.toMatch(/<KeyIcon className="size-4"/);
    expect(apiSearch).not.toMatch(/<ResultIcon className="size-5"/);
    expect(searchDialog).toContain("search-dialog__result-icon icon-text-first-line__icon");
  });

  it("inherits the adjacent text color for icons that lead text or headings", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const docs = readDeveloperFile("src/styles/docs.css");
    const home = readDeveloperFile("src/pages/index.astro");
    const docsLanding = readDeveloperFile("src/pages/docs/index.astro");
    const pricing = readDeveloperFile("src/pages/pricing.astro");
    const tokenReveal = readDeveloperFile("src/components/dashboard/TokenRevealBox.tsx");

    expect(components).toMatch(/\.page-heading\s*\{[^}]*color:\s*var\(--color-fg\);/s);
    expect(components).toMatch(/\.page-heading__icon\s*\{[^}]*color:\s*inherit;/s);
    expect(components).toMatch(/\.icon-text-first-line__icon\s*\{[^}]*color:\s*currentColor;/s);
    expect(docs).toMatch(/\.content-card__section-header\s*\{[^}]*color:\s*var\(--color-fg\);/s);
    expect(docs).toMatch(/\.content-card__section-icon\s*\{[^}]*color:\s*inherit;/s);
    expect(docs).toMatch(/\.search-dialog__result-icon\s*\{[^}]*color:\s*var\(--color-fg\);/s);
    expect(home).not.toMatch(/<Icon className="text-accent"/);
    expect(docsLanding).not.toMatch(/<(?:LinkIcon|BookIcon|KeyIcon|Icon) className="text-accent"/);
    expect(pricing).not.toMatch(/<TickCircleIcon className="text-accent"/);
    expect(pricing).not.toMatch(/<TickCircleIcon style=\{\{ color: tierColor \}\}/);
    expect(tokenReveal).not.toMatch(/<TickCircleIcon className="size-4 text-accent"/);
  });

  it("insets portal-level headings and text by half the non-tier card radius", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const docs = readDeveloperFile("src/styles/docs.css");
    const home = readDeveloperFile("src/pages/index.astro");
    const pricing = readDeveloperFile("src/pages/pricing.astro");
    const dashboard = readDeveloperFile("src/pages/dashboard/index.astro");

    expect(components).toMatch(
      /\.developer-page,[\s\S]*\.dashboard-content\s*\{[^}]*--mc-card-content-inset:\s*calc\(var\(--radius-card\) \/ 2\);/s,
    );
    expect(components).toMatch(
      /\.card-content-inset,[\s\S]*\.page-heading\s*\{[^}]*padding-inline:\s*var\(--mc-card-content-inset\);/s,
    );
    expect(components).toMatch(
      /\.public-header\s*\{[^}]*--mc-public-header-card-content-inset:\s*calc\(var\(--radius-card\) \/ 2\);[^}]*--mc-public-header-padding-inline:\s*calc\(\s*var\(--mc-space-page-inline\) \+ var\(--mc-public-header-card-content-inset\)\s*\);[^}]*padding:\s*var\(--mc-space-5\) var\(--mc-public-header-padding-inline\);/s,
    );
    expect(docs).toContain("--mc-card-content-inset: calc(var(--mc-docs-content-card-radius) / 2);");
    expect(docs).toMatch(/\.api-content__chapter-header\s*\{[^}]*padding-inline:\s*var\(--mc-card-content-inset\);/s);
    expect(home).toMatch(/<h1 class="[^"]*card-content-inset[^"]*"/);
    expect(home).toMatch(/<p class="[^"]*card-content-inset[^"]*"/);
    expect(pricing).toMatch(/<p class="[^"]*card-content-inset[^"]*text-lead[^"]*"/);
    expect(pricing).toMatch(/<h2 class="[^"]*card-content-inset[^"]*">Our commitment<\/h2>/);
    expect(pricing).not.toMatch(/tier-card[^>]*card-content-inset|card-content-inset[^>]*tier-card/);
    expect(dashboard).toMatch(/<h1 class="[^"]*card-content-inset[^"]*"/);
    expect(dashboard).toMatch(/<p class="[^"]*card-content-inset[^"]*">Here is your developer account/);
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

    expect(docs).toMatch(/\.content-card__section-header\s*\{[^}]*align-items:\s*center;/s);
    expect(docs).toMatch(/\.content-card__section-title\s*\{[^}]*font-size:\s*inherit;/s);
    expect(docs).toMatch(/\.content-card__section-title\s*\{[^}]*font-weight:\s*400;/s);
    expect(docs).toMatch(
      /\.content-card__section-icon\s*\{[^}]*width:\s*var\(--mc-docs-section-icon-size\);[^}]*height:\s*1lh;/s,
    );
  });

  it("uses compact shared button geometry inside ContentCard footers", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(components).toMatch(
      /\.button\s*\{[^}]*min-height:\s*var\(--button-min-height, var\(--mc-size-control\)\);/s,
    );
    expect(docs).toMatch(/\.content-card__footer\s*\{[^}]*--button-min-height:\s*var\(--mc-size-control-compact\);/s);
  });

  it("keeps the SDK download label slightly smaller and optically centered", () => {
    const docs = readDeveloperFile("src/styles/docs.css");
    const sdkCard = readDeveloperFile("src/components/docs/SdkSegmentedCard.astro");

    expect(sdkCard).toContain('class="button button--content sdk-segmented-card__download"');
    expect(docs).toMatch(
      /\.sdk-segmented-card__download\s*\{[^}]*font-size:\s*var\(--mc-docs-sdk-download-font-size\);[^}]*line-height:\s*1;/s,
    );
  });

  it("keeps every Developer Portal button label at regular weight", () => {
    const components = readDeveloperFile("src/styles/components.css");
    const pricing = readDeveloperFile("src/pages/pricing.astro");

    expect(components).toMatch(/\.button\s*\{[^}]*font-family:\s*var\(--font-sans\);/s);
    expect(components).toMatch(/\.button\s*\{[^}]*font-weight:\s*400;/s);
    expect(pricing).not.toMatch(/<button[^>]*class="[^"]*font-(?:medium|semibold|bold)[^"]*"/);
    expect(pricing).not.toMatch(/class="tier-cta[^"]*font-(?:medium|semibold|bold)[^"]*"/);
  });

  it("keeps the selected API sidebar item at regular weight", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\[data-api-nav-link\]\[aria-current="true"\],[\s\S]*?\[data-api-nav-link\]\[aria-current="true"\]:hover\s*\{[^}]*font-weight:\s*400;/s,
    );
  });

  it("keeps required parameter badges in a dedicated trailing header column", () => {
    const docs = readDeveloperFile("src/styles/docs.css");

    expect(docs).toMatch(
      /\.parameter-card__header\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*max-content max-content minmax\(0, 1fr\) max-content;[^}]*align-items:\s*start;/s,
    );
    expect(docs).toMatch(
      /\.api-reference-shell\s*\{[^}]*--mc-docs-parameter-chip-padding-block-start:\s*max\(0px, calc\(var\(--mc-docs-space-xs\) - 1px\)\);[^}]*--mc-docs-parameter-chip-padding-block-end:\s*var\(--mc-docs-space-xs\);/s,
    );
    expect(docs).toMatch(
      /\.parameter-card__location,\s*\.parameter-card__requirement\s*\{[^}]*align-self:\s*start;[^}]*padding:\s*var\(--mc-docs-parameter-chip-padding-block-start\)\s+var\(--mc-docs-space-sm\)\s+var\(--mc-docs-parameter-chip-padding-block-end\);[^}]*transform:\s*translateY\(\s*calc\(\s*\(var\(--mc-docs-parameter-chip-padding-block-start\) \+ var\(--mc-docs-parameter-chip-padding-block-end\)\) \* -0\.5\s*\)\s*\);/s,
    );
    expect(docs).toMatch(
      /\.parameter-card__location\s*\{[^}]*box-shadow:\s*inset 0 0 0 1px var\(--color-border\);[^}]*background:\s*var\(--color-surface-raised\);/s,
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
