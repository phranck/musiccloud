import { describe, expect, it } from "vitest";
import type {
  ContentPage,
  ContentPublication,
  NavItem,
  NavigationConfigurationInput,
  PageSegment,
  PageTranslation,
  TranslationStatus,
} from "../content.js";
import {
  isNavigationSystemKey,
  NAVIGATION_SYSTEM_TARGETS,
  NavigationSystemKey,
  NavigationTargetKind,
} from "../content.js";
import { ContentContext, NavigationArea } from "../content-context.js";

describe("content translation types", () => {
  it("ContentPublication identifies a context-specific page publication", () => {
    const publication: ContentPublication = {
      context: ContentContext.Frontend,
      path: "/privacy",
      status: "published",
      templateKey: "frontend-default",
    };

    expect(publication.context).toBe(ContentContext.Frontend);
  });

  it("PageTranslation shape compiles with required fields", () => {
    const t: PageTranslation = {
      locale: "de",
      title: "Titel",
      content: "# Inhalt",
      isStale: false,
      sourceUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(t.locale).toBe("de");
  });

  it("PageSegment carries translations map", () => {
    const s: PageSegment = {
      id: 1,
      position: 0,
      label: "Overview",
      targetSlug: "about",
      translations: { de: "Übersicht" },
    };
    expect(s.translations?.de).toBe("Übersicht");
  });

  it("NavItem carries translations map", () => {
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
      translations: { de: "Start" },
    };
    expect(n.translations?.de).toBe("Start");
  });

  it("ContentPage exposes translations + status", () => {
    const statuses: Record<string, TranslationStatus> = { en: "ready", de: "stale" };
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
      translationStatus: statuses as ContentPage["translationStatus"],
      content: "",
      segments: [],
      translations: [],
      markdownValidation: { ok: true, errors: [] },
    };
    expect(p.translations).toEqual([]);
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
          translations: {},
        },
      ],
    };

    expect(configuration.entries[0]?.systemKey).toBe("docs");
  });
});
