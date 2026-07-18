import { loadRenderers } from "astro:container";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getContainerRenderer } from "@astrojs/react";
import { NavigationSystemKey, NavigationTargetKind } from "@musiccloud/shared";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import PublicHeader from "./PublicHeader.astro";

describe("PublicHeader", () => {
  it("renders shared desktop and mobile navigation with the current page", async () => {
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(PublicHeader, {
      props: { account: null, active: "api" },
    });

    expect(html).toContain('data-public-navigation="desktop"');
    expect(html).toContain('data-public-navigation="mobile"');
    expect(html).toMatch(/<div[^>]*class="public-header"/);
    expect(html).toMatch(/<header[^>]*class="public-header__inner developer-shell"/);
    expect(html).toContain("<details");
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain("button--icon");
    expect(html).toContain('href="/docs/api" aria-current="page"');

    for (const label of ["Docs", "API reference", "Pricing", "Search"]) {
      expect(html.match(new RegExp(`>\\s*${label}\\s*<`, "g"))).toHaveLength(2);
    }

    expect(html).toContain("data-public-search-command");
    expect(html).toContain("⌘K");
    expect(html).toContain("public-navigation__item-icon");
    expect(html).toMatch(/Pricing[\s\S]*?Search[\s\S]*?Sign in/);
  });

  it("uses the requested Iconsax icons for the API, pricing, and sign-in entries", () => {
    const header = readFileSync(join(import.meta.dirname, "PublicHeader.astro"), "utf8");
    const items = readFileSync(join(import.meta.dirname, "PublicNavigationItems.astro"), "utf8");
    const navigation = readFileSync(join(import.meta.dirname, "../lib/publicNavigation.ts"), "utf8");
    const icons = readFileSync(join(import.meta.dirname, "../lib/icons.tsx"), "utf8");

    expect(navigation).toMatch(/\{ id: "api", href: "\/docs\/api", icon: DataIcon, label: "API reference" \}/);
    expect(navigation).toMatch(/\{ id: "pricing", href: "\/pricing", icon: DollarSquareIcon, label: "Pricing" \}/);
    expect(navigation).toMatch(/icon: SearchStatusIcon,[\s\S]*label: "Search"/);
    expect(icons).toContain("DollarSquare,");
    expect(icons).toContain("SearchStatus,");
    expect(icons).toContain("export const DollarSquareIcon = bulk(DollarSquare);");
    expect(icons).toContain("export const SearchStatusIcon = bulk(SearchStatus);");
    expect(header).toContain('import PublicNavigationItems from "@/components/PublicNavigationItems.astro";');
    expect(items).toContain('import { LoginIcon } from "@/lib/icons";');
    expect(items).toMatch(/<LoginIcon className="public-navigation__item-icon" aria-hidden="true" \/>/);
  });

  it("keeps signed-in header controls inside the narrowest viewport", () => {
    const wordmark = readFileSync(join(import.meta.dirname, "Wordmark.astro"), "utf8");
    const css = readFileSync(join(import.meta.dirname, "../styles/components.css"), "utf8");

    expect(wordmark).toContain("wordmark__context");
    expect(css).toMatch(/@media \(max-width: 24rem\)[\s\S]*\.wordmark__context\s*\{\s*display:\s*none;/);
  });

  it("keeps a full navigation target around a compact active surface", () => {
    const css = readFileSync(join(import.meta.dirname, "../styles/components.css"), "utf8");

    expect(css).toMatch(
      /\.public-navigation__link\s*\{[^}]*position:\s*relative;[^}]*isolation:\s*isolate;[^}]*min-height:\s*var\(--mc-size-control\);[^}]*padding-inline:\s*var\(--mc-space-3\);[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.public-navigation__link::before\s*\{[^}]*inset:\s*var\(--mc-space-1\) 0;[^}]*border-radius:\s*var\(--radius-button\);[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.public-navigation__link:hover::before,[^}]*\.public-navigation__link:focus-visible::before\s*\{[^}]*background:\s*var\(--color-surface-raised\);/s,
    );
    expect(css).toMatch(
      /\.public-navigation__link--active::before\s*\{[^}]*background:\s*color-mix\(in srgb, var\(--color-accent\) 10%, transparent\);/s,
    );
  });

  it("switches to the mobile navigation before the icon-bearing command row can overflow", () => {
    const css = readFileSync(join(import.meta.dirname, "../styles/components.css"), "utf8");

    expect(css).toMatch(
      /@media \(max-width: 56rem\)[\s\S]*\.public-header__desktop\s*\{\s*display:\s*none;[\s\S]*\.public-header__mobile\s*\{\s*display:\s*block;/,
    );
  });

  it("keeps the public navigation sticky above scrolling content with a frosted backdrop", () => {
    const css = readFileSync(join(import.meta.dirname, "../styles/components.css"), "utf8");
    const theme = readFileSync(join(import.meta.dirname, "../../public/developer-theme.css"), "utf8");

    expect(css).toMatch(
      /\.public-header\s*\{[^}]*--mc-public-header-surface:\s*var\(--mc-color-public-header\);[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*20;[^}]*background:\s*color-mix\(in srgb, var\(--mc-public-header-surface\) 72%, transparent\);[^}]*backdrop-filter:\s*blur\(var\(--mc-space-4\)\);/s,
    );
    expect(theme).toContain("--mc-color-public-header: #0c1925;");
    expect(css).toMatch(
      /\.public-header__inner\s*\{[^}]*padding:\s*var\(--mc-space-5\) var\(--mc-public-header-padding-inline\);/s,
    );
  });

  it("records an API-page search request until the hydrated controller can consume it", () => {
    const header = readFileSync(join(import.meta.dirname, "PublicHeader.astro"), "utf8");

    expect(header).toMatch(
      /if \(isApiReference\(\)\) \{[\s\S]*document\.documentElement\.dataset\.apiSearchRequested = "true";[\s\S]*apiSearchWindow\.musiccloudApiSearchOpen\(\);[\s\S]*window\.dispatchEvent\(new CustomEvent\("musiccloud:api-search-open"\)\);[\s\S]*return;/,
    );
    expect(header).toMatch(/\}\s*window\.location\.assign\(searchHref\);/);
  });

  it("renders managed entries and preserves the protected Search command", async () => {
    const container = await AstroContainer.create({ renderers: await loadRenderers([getContainerRenderer()]) });
    const html = await container.renderToString(PublicHeader, {
      props: {
        account: null,
        navigation: [
          {
            id: "managed-page",
            label: "Company",
            href: "/company",
            target: "_self",
            targetKind: NavigationTargetKind.Page,
            systemKey: null,
            behavior: "navigate",
          },
          {
            id: "managed-search",
            label: "Find API",
            href: "/docs/api?search=1",
            target: "_self",
            targetKind: NavigationTargetKind.System,
            systemKey: NavigationSystemKey.Search,
            behavior: "open-api-search",
          },
        ],
      },
    });

    expect(html.match(/>\s*Company\s*</g)).toHaveLength(2);
    expect(html.match(/>\s*Find API\s*</g)).toHaveLength(2);
    expect(html.match(/data-public-search-command/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain(">Pricing<");
  });
});
