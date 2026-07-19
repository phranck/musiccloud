import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type {
  ContentPage,
  ContentPublication,
  NavItem,
  NavigationConfigurationInput,
  PageSegment,
} from "../content.js";
import {
  isNavigationSystemKey,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationSystemKey,
  NavigationTargetKind,
} from "../content.js";
import { ContentContext, NavigationArea } from "../content-context.js";
import * as sharedExports from "../index.js";

describe("canonical editorial content types", () => {
  it("ContentPublication identifies a context-specific page publication", () => {
    const publication: ContentPublication = {
      context: ContentContext.Frontend,
      path: "/privacy",
      status: "published",
      templateKey: "frontend-default",
    };

    expect(publication.context).toBe(ContentContext.Frontend);
  });

  it("PageSegment carries one canonical label", () => {
    const s: PageSegment = {
      id: 1,
      position: 0,
      label: "Overview",
      targetSlug: "about",
    };
    expect(s.label).toBe("Overview");
    expect(s).not.toHaveProperty("translations");
  });

  it("NavItem carries one optional canonical label", () => {
    const n: NavItem = {
      id: 1,
      navId: "header",
      pageSlug: null,
      pageTitle: null,
      url: "/x",
      target: "_self",
      label: "Home",
      position: 0,
      pageType: null,
      pageDisplayMode: null,
      pageOverlayWidth: null,
    };
    expect(n.label).toBe("Home");
    expect(n).not.toHaveProperty("translations");
  });

  it("ContentPage exposes only canonical title and content", () => {
    const p: ContentPage = {
      id: "page-about",
      slug: "about",
      contextMask: ContentContext.Frontend,
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/about",
          status: "published",
          templateKey: "frontend-default",
        },
      ],
      title: "About",
      status: "published",
      showTitle: true,
      titleAlignment: "left",
      pageType: "default",
      displayMode: "fullscreen",
      overlayWidth: "regular",
      contentCardStyle: "default",
      createdByUsername: null,
      updatedByUsername: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      content: "",
      segments: [],
      markdownValidation: { ok: true, errors: [] },
    };
    expect(p.title).toBe("About");
    expect(p.content).toBe("");
    expect(p).not.toHaveProperty("translationStatus");
    expect(p).not.toHaveProperty("translations");
  });

  it("does not expose editorial locale or translation contracts", () => {
    for (const name of [
      "Locale",
      "LOCALES",
      "DEFAULT_LOCALE",
      "PageTranslation",
      "TranslationStatus",
      "LocalizedText",
      "normalizeLocalizedText",
      "getLocalizedText",
      "setLocalizedText",
    ]) {
      expect(sharedExports).not.toHaveProperty(name);
    }

    const contentSource = readFileSync(new URL("../content.ts", import.meta.url), "utf8");
    for (const forbidden of [
      "PageTranslation",
      "TranslationStatus",
      "PagesBulkPageTranslationEntry",
      "pageTranslations",
      "translations?:",
    ]) {
      expect(contentSource).not.toContain(forbidden);
    }
  });

  it("exposes immutable canonical semantics for protected navigation targets", () => {
    expect(NAVIGATION_SYSTEM_TARGETS).toEqual({
      docs: {
        key: "docs",
        canonicalRoute: "/docs",
        behavior: "navigate",
        target: "_self",
      },
      "api-reference": {
        key: "api-reference",
        canonicalRoute: "/docs/api",
        behavior: "navigate",
        target: "_self",
      },
      search: {
        key: "search",
        canonicalRoute: "/docs/api?search=1",
        behavior: "open-api-search",
        target: "_self",
      },
    });
    expect(isNavigationSystemKey("docs")).toBe(true);
    expect(isNavigationSystemKey("__proto__")).toBe(false);
  });

  it("types a complete contextual navigation configuration", () => {
    const configuration: NavigationConfigurationInput = {
      entries: [
        {
          targetKind: NavigationTargetKind.System,
          pageId: null,
          url: null,
          systemKey: NavigationSystemKey.Docs,
          target: "_self",
          label: "Docs",
          contextMask: ContentContext.DeveloperPortal,
          areaMask: NavigationArea.Main | NavigationArea.Footer,
          placements: [
            { context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 },
            { context: ContentContext.DeveloperPortal, area: NavigationArea.Footer, position: 2 },
          ],
        },
      ],
    };

    expect(configuration.entries[0]?.systemKey).toBe("docs");
  });
});
