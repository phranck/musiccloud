import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Sidebar, SidebarSectionItem } from "./Sidebar";

describe("Sidebar", () => {
  it("provides the complete documented compound structure", () => {
    const html = renderToStaticMarkup(
      <Sidebar aria-label="API reference sections">
        <Sidebar.Header>
          <h2>Reference</h2>
          <Sidebar.Header.Addon>Toggle</Sidebar.Header.Addon>
        </Sidebar.Header>
        <Sidebar.Body>
          <Sidebar.Chapter href="#integration-guide">Integration guide</Sidebar.Chapter>
          <Sidebar.Section open>
            <Sidebar.Section.Header>
              <Sidebar.Section.Header.Title>Resolve</Sidebar.Section.Header.Title>
              <Sidebar.Section.Header.Addons>3</Sidebar.Section.Header.Addons>
            </Sidebar.Section.Header>
            <Sidebar.Section.Items>
              <SidebarSectionItem href="#quick-resolve">Quick resolve</SidebarSectionItem>
            </Sidebar.Section.Items>
          </Sidebar.Section>
        </Sidebar.Body>
      </Sidebar>,
    );

    expect(html).toMatch(/<nav[^>]*aria-label="API reference sections"[^>]*class="sidebar"/);
    expect(html).toContain('<header class="sidebar__header">');
    expect(html).toContain('<div class="sidebar__header-addon">Toggle</div>');
    expect(html).toContain('<div class="sidebar__body">');
    expect(html).toMatch(/<a[^>]*href="#integration-guide"[^>]*class="sidebar__chapter">Integration guide<\/a>/);
    expect(html).toMatch(/<details[^>]*open=""[^>]*class="sidebar__section">/);
    expect(html).toContain('<summary class="sidebar__section-header">');
    expect(html).toContain('<h3 class="sidebar__section-header-title">Resolve</h3>');
    expect(html).toContain('<div class="sidebar__section-header-addons">3</div>');
    expect(html).toContain('<ul class="sidebar__section-items">');
    expect(html).toContain('<li class="sidebar__section-item"><a href="#quick-resolve">Quick resolve</a></li>');
  });

  it("keeps the complete desktop sidebar as the explicit scroll region", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");
    const navigation = readFileSync(join(import.meta.dirname, "ApiReferenceNav.astro"), "utf8");

    expect(css).toMatch(/\[data-api-nav-scroll-region\]\.api-reference-nav\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(
      /\.sidebar__header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*-1px;[^}]*background-color:\s*var\(--color-surface-solid\);[^}]*background-image:\s*linear-gradient\(var\(--mc-docs-card-chrome\), var\(--mc-docs-card-chrome\)\);/s,
    );
    expect(css).toContain("--mc-docs-nav-padding: var(--mc-docs-space-md);");
    expect(css).toMatch(
      /\.api-reference-nav__summary\s*\{[^}]*min-height:\s*var\(--mc-size-control\);[^}]*padding:\s*0 var\(--mc-docs-nav-padding\);/s,
    );
    expect(css).toContain("--mc-docs-nav-toggle-size: var(--mc-space-7);");
    expect(css).toContain("--mc-docs-nav-toggle-secondary-opacity: 0.3;");
    expect(css).toMatch(/\.api-reference-nav__toggle\s*\{[^}]*width:\s*var\(--mc-docs-nav-toggle-size\);/s);
    expect(css).toMatch(/\.api-reference-nav__toggle-all\s*\{[^}]*width:\s*var\(--mc-docs-nav-toggle-size\);/s);
    expect(css).toMatch(/\.api-reference-nav__toggle svg\s*\{[^}]*width:\s*var\(--mc-docs-nav-toggle-size\);/s);
    expect(css).toMatch(/\.api-reference-nav__toggle-all svg\s*\{[^}]*width:\s*var\(--mc-docs-nav-toggle-size\);/s);
    expect(navigation).not.toMatch(/api-reference-nav__toggle(?:-all)?-(?:up|down) size-6/);
    expect(css).toMatch(
      /\.api-reference-nav__toggle \.mc-icon path\[opacity\],[^}]*\.api-reference-nav__toggle-all \.mc-icon path\[opacity\]\s*\{[^}]*opacity:\s*var\(--mc-docs-nav-toggle-secondary-opacity\);/s,
    );
    expect(css).toContain(".api-reference-nav__toggle-all,\n    .api-reference-nav__toggle {");
  });

  it("separates the chapter cluster from the first collapsible section", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    expect(css).toMatch(
      /\.sidebar__chapter\s*\+\s*\.sidebar__section\s*\{[^}]*margin-block-start:\s*var\(--mc-space-3\);/s,
    );
  });

  it("pads section item groups equally above and below their links", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    expect(css).toMatch(/\.sidebar__section-items\s*\{[^}]*padding-block:\s*var\(--mc-docs-nav-padding\);/s);
  });

  it("uses the item group as the only trailing sidebar inset", () => {
    const css = readFileSync(join(import.meta.dirname, "../../styles/docs.css"), "utf8");

    expect(css).toMatch(/\.sidebar__body\s*\{[^}]*padding:\s*var\(--mc-space-3\) var\(--mc-docs-nav-padding\) 0;/s);
    expect(css).not.toContain(".sidebar__body:not(:has(> .sidebar__section[open]))");
    expect(css).not.toMatch(/\.sidebar__section\s*\+\s*\.sidebar__section\s*\{[^}]*margin/s);
  });
});
