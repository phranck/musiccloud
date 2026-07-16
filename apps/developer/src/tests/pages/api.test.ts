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
      version: "2.1.4",
      sha256: "9ea887aa29d6f312f5789c745f66563222cab3ea89b13cdc656dc9b23676bcce",
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
    expect(html).toContain('<span class="response-card__meta-label">Content-Type:</span>');
    expect(html).toContain('<code class="response-card__media-type">application/json</code>');
    expect(html).toContain('<span class="response-card__meta-label">Response Object:</span>');
    expect(html).toContain('href="#schema-error-response"');
    expect(html).toContain('<code class="response-card__schema-name">ErrorResponse</code>');
    expect(html).toContain("authentication-card");
    expect(html).toContain("authentication-card__status");
    expect(html).toContain("authentication-card__content");
    expect(html).not.toContain("content-card__section--authentication");
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
    expect(html).toContain('href="#schema-resolve-success"');
    expect(html).not.toContain('href="#schema-ResolveSuccess"');
    expect(html).toContain("Key documentation");
    expect(html).toContain('role="tablist"');
    expect(html).toContain("JSON schema");
    expect(html).toContain("Resolve a music URL, free-text query, genre-discovery query, or structured search query");
    expect(html).not.toContain('<span class="font-mono text-code text-accent">POST</span> /api/v1/resolve');
    expect(html).not.toContain("Scalar.createApiReference");
  }, 15_000);

  it("renders every composed successful response object as a schema link", async () => {
    const fixture = readFixture("public-openapi.json") as {
      paths: {
        "/api/v1/resolve": {
          post: { responses: { "200": { content: { "application/json": { schema: unknown } } } } };
        };
      };
    };
    fixture.paths["/api/v1/resolve"].post.responses["200"].content["application/json"].schema = {
      oneOf: [{ $ref: "#/components/schemas/ResolveSuccess" }, { $ref: "#/components/schemas/CcResolveSuccess" }],
    };
    const reference = buildApiReference(fixture);
    const catalog = parseSdkCatalog(readFixture("sdk-catalog.json"), {
      version: "2.1.4",
      sha256: "9ea887aa29d6f312f5789c745f66563222cab3ea89b13cdc656dc9b23676bcce",
    });
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });

    const html = await container.renderToString(ApiReferenceContent, {
      props: { reference, catalog },
    });

    expect(html).toContain('<span class="response-card__meta-label">Response Object:</span>');
    expect(html).toContain('<code class="response-card__schema-name">ResolveSuccess</code>');
    expect(html).toContain('<code class="response-card__schema-name">CcResolveSuccess</code>');
    expect(html).toContain('href="#schema-resolve-success"');
    expect(html).toContain('href="#schema-cc-resolve-success"');
  }, 15_000);

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

  it("renders a bulk schema-card control in the Schemas chapter header", () => {
    const compound = readFileSync(join(rootDir, "components/docs/ApiContent.tsx"), "utf8");
    const content = readFileSync(join(rootDir, "components/docs/ApiReferenceContent.astro"), "utf8");

    expect(compound).toContain("Addon: ApiContentChapterHeaderAddon");
    expect(content).toContain("data-schema-card-toggle-all");
    expect(content).toContain('aria-label="Expand all schema cards"');
    expect(content).toContain('data-schema-cards-all-expanded="false"');
    expect(content).toContain(
      '<ArrowCircleDownIcon className="api-content__chapter-toggle-down" aria-hidden="true" />',
    );
    expect(content).toContain('<ArrowCircleUpIcon className="api-content__chapter-toggle-up" aria-hidden="true" />');
  });

  it("centralizes individual and bulk schema-card expansion state", () => {
    const controllerPath = join(rootDir, "components/docs/SchemaCardsController.astro");

    expect(existsSync(controllerPath)).toBe(true);
    if (!existsSync(controllerPath)) return;

    const controller = readFileSync(controllerPath, "utf8");
    const schemaSection = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");

    expect(controller).toContain(
      "function setSchemaCardExpanded(card: HTMLElement, expanded: boolean, persist = false)",
    );
    expect(controller).toContain('localStorage.setItem(storageKey, expanded ? "expanded" : "collapsed")');
    expect(controller).toContain(
      'const shouldExpand = cards.some((card) => card.dataset.schemaCardExpanded !== "true")',
    );
    expect(controller).toContain("setSchemaCardExpanded(card, shouldExpand, true)");
    expect(controller).toContain(
      'button.setAttribute("aria-label", allExpanded ? "Collapse all schema cards" : "Expand all schema cards")',
    );
    expect(schemaSection).not.toContain("function bindSchemaCard");
  });

  it("renders schema cards collapsed until an expanded state was explicitly persisted", () => {
    const content = readFileSync(join(rootDir, "components/docs/ApiReferenceContent.astro"), "utf8");
    const schemaSection = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const controller = readFileSync(join(rootDir, "components/docs/SchemaCardsController.astro"), "utf8");

    expect(content).toContain('aria-label="Expand all schema cards"');
    expect(content).toContain('data-schema-cards-all-expanded="false"');
    expect(schemaSection).toContain('data-schema-card-expanded="false"');
    expect(schemaSection).toContain('aria-expanded="false"');
    expect(schemaSection).toContain('data-schema-card-content aria-hidden="true"');
    expect(controller).toContain("let expanded = false;");
    expect(controller).toContain('expanded = localStorage.getItem(storageKey) === "expanded";');
  });

  it("uses the shared sidebar chevron recipe for the bulk schema-card control", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");

    expect(css).toMatch(
      /\.api-content__chapter-toggle\s*\{[^}]*width:\s*var\(--mc-docs-nav-toggle-size\);[^}]*height:\s*var\(--mc-docs-nav-toggle-size\);[^}]*color:\s*var\(--color-fg-muted\);/s,
    );
    expect(css).toMatch(
      /\.api-content__chapter-toggle \.mc-icon path\[opacity\][^}]*opacity:\s*var\(--mc-docs-nav-toggle-secondary-opacity\);/s,
    );
    expect(css).toMatch(
      /\[data-schema-cards-all-expanded="true"\]\s+\.api-content__chapter-toggle-down\s*\{[^}]*opacity:\s*0;/s,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.api-content__chapter-toggle > \.mc-icon,[\s\S]*\.schema-card__header-chevron > \.mc-icon\s*\{[^}]*transition:\s*none;/s,
    );
  });

  it("keeps pure content headings out of the focus order", () => {
    const headingComponents = ["EndpointOperation.astro", "SdkDownloadCard.astro"];

    for (const component of headingComponents) {
      const source = readFileSync(join(rootDir, "components/docs", component), "utf8");

      expect(source).not.toContain('tabindex="-1"');
    }
  });

  it("uses roving tab focus for each schema-card view switch", () => {
    const source = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const controller = readFileSync(join(rootDir, "components/docs/SchemaCardsController.astro"), "utf8");

    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain("tabIndex={-1}");
    expect(controller).toContain('tab.addEventListener("keydown"');
  });

  it("renders schema field descriptions through the shared OpenAPI Markdown renderer", () => {
    const source = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");

    expect(source).toContain('<OpenApiMarkdown content={field.description} className="text-body text-fg-muted" />');
  });

  it("uses the schema name as the card H3 instead of repeating it above the card", () => {
    const source = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");

    expect(source).not.toContain("<ApiContent.Entry.Title");
    expect(source).toContain("<SchemaCard.Header.Title id={schemaHeadingId}>{schema.name}</SchemaCard.Header.Title>");
    expect(css).toMatch(/\.schema-card__title\s*\{[^}]*font-size:\s*var\(--text-card-title\);/s);
  });

  it("does not repeat the response object name in a schema-card footer", () => {
    const section = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const card = readFileSync(join(rootDir, "components/docs/SchemaCard.tsx"), "utf8");

    expect(section).not.toContain("<SchemaCard.Footer");
    expect(card).not.toContain("SchemaCardFooter");
  });

  it("keeps the schema view switch compact", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const components = readFileSync(join(rootDir, "styles/components.css"), "utf8");

    expect(css).toContain("--mc-docs-schema-toggle-inset: var(--mc-docs-space-xs);");
    expect(css).toContain(
      "--mc-docs-schema-toggle-tab-height: calc(var(--mc-size-control-compact) - var(--mc-space-1));",
    );
    expect(components).toMatch(
      /\.segmented-control__item\s*\{[^}]*min-height:\s*var\(--segmented-control-item-min-height, var\(--mc-size-control-compact\)\);/s,
    );
  });

  it("uses the shared segmented-control compound for schema documentation views", () => {
    const section = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const card = readFileSync(join(rootDir, "components/docs/SchemaCard.tsx"), "utf8");
    const segmentedControlPath = join(rootDir, "components/SegmentedControl.tsx");

    expect(existsSync(segmentedControlPath)).toBe(true);
    if (!existsSync(segmentedControlPath)) return;

    const segmentedControl = readFileSync(segmentedControlPath, "utf8");
    expect(segmentedControl).toContain('createCompoundElement("div", "segmented-control")');
    expect(segmentedControl).toContain('createCompoundElement("button", "segmented-control__item")');
    expect(section).toContain('import { SegmentedControl } from "@/components/SegmentedControl";');
    expect(section).toContain('<SegmentedControl role="tablist"');
    expect(section).toContain("<SegmentedControl.Item");
    expect(card).not.toContain("SchemaCardViewToggle");
  });

  it("labels response schema field presence independently from nullable value types", () => {
    const source = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");

    expect(source).toContain(
      '<SchemaCard.Body.Fields.Header.Cell scope="col">Key</SchemaCard.Body.Fields.Header.Cell>',
    );
    expect(source).toContain(
      '<SchemaCard.Body.Fields.Header.Cell scope="col">Value Type</SchemaCard.Body.Fields.Header.Cell>',
    );
    expect(source).toContain(
      '<SchemaCard.Body.Fields.Header.Cell scope="col">Key Presence</SchemaCard.Body.Fields.Header.Cell>',
    );
    expect(source).toContain(
      '<SchemaCard.Body.Fields.Field.Presence.Badge data-key-presence={field.required ? "included" : "optional"}>',
    );
    expect(source).toContain('{field.required ? "included" : "optional"}');
  });

  it("provides persistent animated schema-card expansion from the complete header", () => {
    const source = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const controllerPath = join(rootDir, "components/docs/SchemaCardsController.astro");
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");

    expect(existsSync(controllerPath)).toBe(true);
    if (!existsSync(controllerPath)) return;
    const controller = readFileSync(controllerPath, "utf8");

    expect(source).toContain("data-schema-card-collapse-toggle");
    expect(source).toContain("data-schema-card-storage-key");
    expect(controller).toContain("localStorage.getItem(storageKey)");
    expect(controller).toContain("localStorage.setItem(storageKey");
    expect(controller).toContain("card.dataset.schemaCardExpanded");
    expect(css).toMatch(
      /\.schema-card__collapsible\s*\{[\s\S]*grid-template-rows:\s*1fr;[\s\S]*transition:\s*grid-template-rows/s,
    );
    expect(css).toMatch(
      /\.schema-card\[data-schema-card-expanded="false"\]\s+\.schema-card__collapsible\s*\{[^}]*grid-template-rows:\s*0fr;/s,
    );
    expect(source).toContain('ArrowCircleDownIcon className="schema-card__header-chevron-down"');
    expect(source).toContain('ArrowCircleUpIcon className="schema-card__header-chevron-up"');
    expect(css).toMatch(/\.schema-card__header-chevron\s*>\s*\.mc-icon\s*\{[\s\S]*transition:[\s\S]*transform/s);
    const schemaChevronRule = css.match(/\.schema-card__header-chevron\s*\{(?<body>[\s\S]*?)\n {2}\}/)?.groups?.body;

    expect(schemaChevronRule).toContain("width: var(--mc-docs-nav-toggle-size);");
    expect(schemaChevronRule).toContain("height: var(--mc-docs-nav-toggle-size);");
    expect(schemaChevronRule).toContain("color: var(--color-fg-muted);");
    expect(css).toMatch(
      /\.api-reference-nav__toggle \.mc-icon path\[opacity\],[\s\S]*\.api-reference-nav__toggle-all \.mc-icon path\[opacity\],[\s\S]*\.schema-card__header-chevron \.mc-icon path\[opacity\]\s*\{[^}]*opacity:\s*var\(--mc-docs-nav-toggle-secondary-opacity\);/s,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.schema-card__collapsible,[\s\S]*\.schema-card__collapsible-content,[\s\S]*\.schema-card__header-chevron > \.mc-icon\s*\{[^}]*transition:\s*none;/s,
    );
  });

  it("uses a semantic table to align schema field metadata and descriptions", () => {
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");
    const fieldNameRule = css.match(/\.schema-card__field-name\s*\{(?<body>[\s\S]*?)\n {2}\}/)?.groups?.body;

    expect(css).toMatch(
      /\.schema-card__field-table\s*\{[\s\S]*border-collapse:\s*collapse;[\s\S]*table-layout:\s*auto;/,
    );
    expect(css).toMatch(
      /\.schema-card__field-heading,[\s\S]*\.schema-card__field-name,[\s\S]*\.schema-card__field-value,[\s\S]*\.schema-card__field-presence,[\s\S]*\.schema-card__field-description\s*\{[\s\S]*vertical-align:\s*top;/,
    );
    expect(fieldNameRule).toContain("white-space: nowrap;");
    expect(fieldNameRule).not.toContain("overflow-wrap");
    expect(fieldNameRule).toContain("color: var(--color-fg);");
    expect(css).not.toMatch(/\.schema-card__field\[data-depth="1"\][\s\S]*background-image:/);
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
    expect(operation).toContain(
      'import { apiReferenceOperationAnchor, apiReferenceSchemaAnchor } from "@/lib/api-reference-anchor";',
    );
    expect(navigation).toContain("apiReferenceOperationAnchor(operation.method, operation.path)");
    expect(operation).toContain("apiReferenceOperationAnchor(operation.method, operation.path)");
    expect(operation).toContain("apiReferenceSchemaAnchor(schemaRef)");
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
    const endpoint = readFileSync(join(rootDir, "components/docs/EndpointOperation.astro"), "utf8");
    const schema = readFileSync(join(rootDir, "components/docs/SchemaSection.astro"), "utf8");
    const css = readFileSync(join(rootDir, "styles/docs.css"), "utf8");

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
    expect(endpoint).toContain("<EndpointCard id={anchor} aria-labelledby={titleId} data-api-nav-anchor>");
    expect(schema).toMatch(
      /<SchemaCard[\s\S]*id=\{schema\.anchor\}[\s\S]*aria-labelledby=\{schemaHeadingId\}[\s\S]*data-api-nav-anchor/s,
    );
    expect(css).toMatch(
      /@media \(min-width: 64rem\)[\s\S]*\[data-api-nav-anchor\]\s*\{[^}]*scroll-margin-top:\s*var\(--mc-docs-nav-sticky-offset\);/s,
    );
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
