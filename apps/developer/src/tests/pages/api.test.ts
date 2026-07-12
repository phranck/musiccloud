import { loadRenderers } from "astro:container";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getContainerRenderer } from "@astrojs/react";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import ApiReferenceContent from "../../components/docs/ApiReferenceContent.astro";
import { buildApiReference } from "../../lib/openapi-reference";
import { parseSdkCatalog } from "../../lib/sdk-catalog";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const fixturesDir = join(rootDir, "lib/__fixtures__");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));
}

describe("/docs/api content", () => {
  it("renders generated endpoint, schema, manifest, auth, and SDK facts", async () => {
    const reference = buildApiReference(readFixture("public-openapi.json"));
    const catalog = parseSdkCatalog(readFixture("sdk-catalog.json"), {
      version: "2.1.0",
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

    const html = await container.renderToString(ApiReferenceContent, {
      props: { reference, catalog },
    });

    expect(html).toContain("API reference");
    expect(html).toContain("POST");
    expect(html).toContain("/api/v1/resolve");
    expect(html).toContain("Authentication");
    expect(html).toContain("X-API-Key");
    expect(html).toContain("data-copy-code");
    expect(html).toContain("code-block__copy");
    expect(html).toContain("data-code-line-numbers");
    expect(html).toContain('aria-label="Copy code"');
    expect(html).toContain("data-api-reference-smooth-scroll");
    expect(html).toContain("data-api-nav-animated");
    expect(html).toContain("data-api-nav-scroll-region");
    expect(html).toContain("data-api-nav-toggle-all");
    expect(html).toContain('aria-label="Expand all sections"');
    expect(html).toContain('class="api-reference-nav__toggle-all"');
    expect(html).not.toContain("button button--icon api-reference-nav__toggle-all");
    expect(html).not.toContain("api-reference-content__raw-link");
    expect(html).not.toContain("api-reference-nav__toggle-all--accent");
    expect(html).not.toContain("data-api-reference-search");
    expect(html).not.toContain("data-api-reference-search-field");
    expect(html).not.toContain("data-api-search-trigger");
    expect(html).toContain("data-api-search-dialog");
    expect(html).toContain("data-api-search-root");
    expect(html).toContain("data-api-reference-intro");
    expect(html).toContain("data-api-scroll-top");
    expect(html).toContain('aria-label="Back to top"');
    expect(html).toContain("button button--icon button--content api-scroll-top");
    expect(html).toContain("api-scroll-top__icon size-6");
    expect(html).toContain("data-api-search-entry");
    expect(html).toContain('data-api-search-addon="POST /api/v1/resolve"');
    expect(html).toMatch(/data-api-search-ignore="true"[^>]*endpoint-card__header/);
    expect(html).toContain("data-api-nav-link");
    expect(html).toContain("data-api-nav-count");
    expect(html).toContain("data-api-nav-summary");
    expect(html).toMatch(/<h3[^>]*api-reference-nav__summary-title m-0 text-body font-semibold text-fg/);
    expect(html).toMatch(/<h2[^>]*text-card-title font-semibold text-fg[^>]*>Reference/);
    expect(html).toContain("data-api-nav-toggle");
    expect(html).not.toContain("border-t border-border");
    expect(html).toContain("api-reference-nav__toggle-down");
    expect(html).not.toContain("api-reference-nav__toggle-down size-6");
    expect(html).toContain("data-api-reference-scroll-spy");
    expect(html).toContain("data-api-content-heading");
    expect(html).toContain("api-content__chapter-header");
    expect(html).toContain("data-openapi-markdown");
    expect(html).toContain("response-card");
    expect(html).toContain("content-card__title");
    expect(html).toContain("content-card__header-addon");
    expect(html).toContain("API key required");
    expect(html).not.toContain("documented response");
    expect(html).toContain("response-card__icon");
    expect(html).toContain("response-card__status");
    expect(html).toContain("api-content__chapter");
    expect(html).toContain("api-content__entry");
    expect(html).toContain("content-panel");
    expect(html).toContain("parameter-card");
    expect(html).toContain("request-body-card");
    expect(html).toContain("response-card__summary");
    expect(html).toContain("response-card__meta");
    expect(html).not.toContain("endpoint-detail");
    expect(html).not.toContain("endpoint-parameter");
    expect(html).not.toContain("endpoint-request-body");
    expect(html).toContain("api-reference-nav__content");
    expect(html).not.toContain("api-reference-nav__section py-3");
    expect(html).toContain("Search API reference");
    expect(html).toContain("Quick resolve");
    expect(html).toContain("Resolve link");
    expect(html).toMatch(/<h3[^>]*data-api-operation-title[^>]*>[\s\S]*?Quick resolve[\s\S]*?<\/h3>/);
    expect(html).toContain("shiki");
    expect(html).toContain("Download TypeScript SDK");
    expect(html).toContain("Download Python SDK");
    expect(html).toContain("Download Swift SDK");
    expect(html).toContain("data-sdk-download");
    expect(html).toContain("Installation");
    expect(html).toContain("Usage");
    expect(html).toContain("MUSICCLOUD_API_KEY");
    expect(html).toContain("apiV1ResolvePost");
    expect(html).toContain("api_v1_resolve_post");
    expect(html).toContain("ResolveAPI");
    expect(html).toContain("SHA-256");
    expect(html).not.toContain("Raw OpenAPI JSON");
    expect(html).toContain("schema-resolve-success");
    expect(html).toContain("Resolve a streaming URL");
    expect(html).not.toContain('<span class="font-mono text-code text-accent">POST</span> /api/v1/resolve');
    expect(html).not.toContain("Scalar.createApiReference");
  });

  it("uses the same ease-in-out curve for every sidebar chevron transition", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const toggleAllRule = css.match(/\.api-reference-nav__toggle-all svg\s*\{(?<body>[\s\S]*?)\n {2}\}/)?.groups?.body;

    expect(toggleAllRule).toContain("var(--mc-docs-nav-transition-easing)");
    expect(toggleAllRule).not.toContain("var(--mc-motion-easing-enter)");
  });

  it("keeps content H2 icons at the full heading scale", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const content = readFileSync(join(rootDir, "components/docs/ApiReferenceContent.astro"), "utf8");

    expect(css).toContain("--mc-docs-heading-icon-scale: 1em;");
    expect(content).not.toMatch(/<(?:IntegrationIcon|SdkIcon|SectionIcon|SchemasIcon)\s+className="size-6"/);
  });

  it("keeps pure content headings out of the focus order", () => {
    const headingComponents = ["EndpointOperation.astro", "SdkDownloadCard.astro", "SchemaSection.astro"];

    for (const component of headingComponents) {
      const source = readFileSync(join(rootDir, "components/docs", component), "utf8");

      expect(source).not.toContain('tabindex="-1"');
    }
  });

  it("uses the dedicated lighter token for active sidebar entries", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const theme = readFileSync(join(rootDir, "../public/developer-theme.css"), "utf8");

    expect(theme).toContain("--mc-color-sidebar-active: #2abef6;");
    expect(css).toContain("--mc-docs-nav-active-color: var(--mc-color-sidebar-active);");
    expect(css).toMatch(
      /\[data-api-nav-link\]\[aria-current="true"\][\s\S]*color:\s*var\(--mc-docs-nav-active-color\);/,
    );
    expect(css).toMatch(
      /\[data-api-nav-link\]\[aria-current="true"\],[\s\S]*?\[data-api-nav-link\]\[aria-current="true"\]:hover\s*\{[^}]*font-weight:\s*600;/,
    );
  });

  it("uses the monospace family for every structured request identifier", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");

    expect(css).toMatch(
      /\.endpoint-card__method,[\s\S]*\.endpoint-card__path,[\s\S]*\.search-dialog__result-addon\s*\{[^}]*font-family:\s*var\(--font-mono\);/s,
    );
  });

  it("derives navigation and content operation anchors from one shared helper", () => {
    const navigation = readFileSync(join(rootDir, "components/docs/ApiReferenceNav.astro"), "utf8");
    const operation = readFileSync(join(rootDir, "components/docs/EndpointOperation.astro"), "utf8");

    expect(navigation).toContain('import { apiReferenceOperationAnchor } from "@/lib/api-reference-anchor";');
    expect(operation).toContain('import { apiReferenceOperationAnchor } from "@/lib/api-reference-anchor";');
    expect(navigation).toContain("apiReferenceOperationAnchor(operation.method, operation.path)");
    expect(operation).toContain("apiReferenceOperationAnchor(operation.method, operation.path)");
  });

  it("defines a responsive, reduced-motion-aware scroll-to-top controller", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const controllerPath = join(rootDir, "components/docs/ScrollToTopButton.astro");

    expect(existsSync(controllerPath)).toBe(true);
    if (!existsSync(controllerPath)) return;

    const controller = readFileSync(controllerPath, "utf8");

    expect(css).toMatch(
      /\.api-scroll-top\s*\{[^}]*position:\s*fixed;[^}]*right:\s*calc\(var\(--mc-space-page-inline\) \+ env\(safe-area-inset-right\)\);[^}]*bottom:\s*calc\(var\(--mc-space-5\) \+ env\(safe-area-inset-bottom\)\);/s,
    );
    expect(css).toMatch(/\.api-scroll-top\[data-visible="true"\]\s*\{[^}]*opacity:\s*1;[^}]*pointer-events:\s*auto;/s);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.api-scroll-top\s*\{[^}]*transition:\s*none;/s,
    );
    expect(controller).toContain("IntersectionObserver");
    expect(controller).toContain("requestAnimationFrame");
    expect(controller).toContain("--mc-motion-duration-slow");
    expect(controller).toContain('matchMedia("(prefers-reduced-motion: reduce)")');
  });

  it("consumes the public search handoff after the API document search controller hydrates", () => {
    const controller = readFileSync(join(rootDir, "components/docs/ApiDocumentSearch.tsx"), "utf8");

    expect(controller).toContain('new URLSearchParams(window.location.search).has("search")');
    expect(controller).toContain('addEventListener("musiccloud:api-search-open"');
    expect(controller).toContain("apiSearchWindow.musiccloudApiSearchOpen = consumeSearchRequest;");
    expect(controller).toContain("apiSearchWindow.musiccloudApiSearchOpen === consumeSearchRequest");
    expect(controller).not.toContain("[data-api-search-trigger]");
    expect(controller).toContain('document.documentElement.dataset.apiSearchRequested === "true"');
    expect(controller).toContain("delete document.documentElement.dataset.apiSearchRequested;");
    expect(controller).toContain("useEffectEvent");
  });

  it("synchronizes a selected document-search result with the sidebar navigation", () => {
    const controller = readFileSync(join(rootDir, "components/docs/ApiDocumentSearch.tsx"), "utf8");
    const navigation = readFileSync(join(rootDir, "components/docs/ApiReferenceNav.astro"), "utf8");

    expect(controller).toContain('new CustomEvent<ApiSearchNavigationDetail>("musiccloud:api-search-navigate"');
    expect(controller).toContain("detail: { group: result.group, targetId: result.targetId }");
    expect(controller).toContain("highlightDocumentSearchMatches(searchEntry, selection.query)");
    expect(controller).not.toContain("target.focus({ preventScroll: true });");
    expect(controller).toContain("function SearchHighlightNotice");
    expect(controller).toContain('event.key !== "Escape"');
    expect(controller).not.toContain("SEARCH_HIGHLIGHT_DURATION_MS");
    expect(navigation).toContain('addEventListener("musiccloud:api-search-navigate"');
    expect(navigation).toContain(`link.hash === \`#\${targetId}\``);
    expect(navigation).toContain("link.dataset.apiNavGroup === group");
    expect(navigation).toContain("setActive(nextActiveLink, true);");
  });

  it("keeps a clicked sidebar item active while its content block is visible", () => {
    const navigation = readFileSync(join(rootDir, "components/docs/ApiReferenceNav.astro"), "utf8");

    expect(navigation).toContain(
      'import { isManualScrollIntent, resolveScrollSpySelection } from "@/lib/api-scroll-spy";',
    );
    expect(navigation).toContain("setActive(link, true);");
    expect(navigation).toContain("navigationTarget.target.scrollIntoView");
    expect(navigation).toContain("resolveScrollSpySelection(");
    expect(navigation).toContain("programmaticNavigationLink");
    expect(navigation).toContain('addEventListener("scrollend"');
    expect(navigation).toContain("isManualScrollIntent(event.type");
    expect(navigation).toContain('addEventListener("scroll", scheduleScrollSpyUpdate');
    expect(navigation).toContain("requestAnimationFrame(updateActiveFromScroll)");
    expect(navigation).not.toContain("new IntersectionObserver(");
  });

  it("pins the search dialog below a tokenized top offset without widening it to the viewport", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const content = readFileSync(join(rootDir, "components/docs/ApiReferenceContent.astro"), "utf8");

    expect(content).toContain('class="api-reference-shell"');
    expect(css).toMatch(
      /\.api-reference-shell\s*\{[^}]*--mc-docs-search-dialog-top:\s*calc\(var\(--mc-space-8\) \+ var\(--mc-space-6\)\);/s,
    );
    expect(css).toMatch(
      /\.search-dialog\.surface-card\s*\{[^}]*position:\s*fixed;[^}]*top:\s*var\(--mc-docs-search-dialog-top\);[^}]*inset-inline:\s*0;[^}]*width:\s*min\([^;]+var\(--mc-docs-search-dialog-max-width\)\);[^}]*max-height:\s*calc\(100dvh - var\(--mc-docs-search-dialog-top\) - var\(--mc-docs-search-dialog-viewport-gap\)\);[^}]*margin:\s*0 auto;/s,
    );
    expect(css).toMatch(
      /@media \(max-width: 40rem\)[\s\S]*--mc-docs-search-dialog-top:\s*max\(var\(--mc-space-5\), calc\(env\(safe-area-inset-top\) \+ var\(--mc-space-3\)\)\);/,
    );
  });

  it("uses a persistent, tokenized orange search-highlight treatment", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const theme = readFileSync(join(rootDir, "../public/developer-theme.css"), "utf8");

    expect(theme).toContain("--mc-color-search-highlight:");
    expect(css).toContain("--mc-docs-search-highlight-color: var(--mc-color-search-highlight);");
    expect(css).toContain(".api-search-highlight-notice");
    expect(css).toContain("mark[data-api-search-highlight]");
    expect(css).toContain("padding-block: var(--mc-docs-search-highlight-padding-block);");
  });
});
