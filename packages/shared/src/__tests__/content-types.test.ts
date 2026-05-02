import { describe, expect, it } from "vitest";
import type { ContentPage, NavItem, PageSegment, PageTranslation, TranslationStatus } from "../content.js";

describe("content translation types", () => {
  it("PageTranslation shape compiles with required fields", () => {
    const t: PageTranslation = {
      locale: "de",
      title: "Titel",
      content: "# Inhalt",
      translationReady: true,
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
    const statuses: Record<string, TranslationStatus> = { en: "ready", de: "draft" };
    const p: ContentPage = {
      slug: "about",
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
    };
    expect(p.translations).toEqual([]);
  });
});
