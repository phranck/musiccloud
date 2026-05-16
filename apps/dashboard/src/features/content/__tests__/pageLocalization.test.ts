import { describe, expect, it } from "vitest";
import { buildLocalizedPageTitle, createPageTitleTranslationDraft } from "../pageLocalization";

describe("page localization helpers", () => {
  it("builds localized page titles from base title and translation rows", () => {
    const title = buildLocalizedPageTitle("Artists", [{ locale: "de", title: "Kuenstler" }]);

    expect(title).toEqual({ en: "Artists", de: "Kuenstler" });
  });

  it("uses current draft titles over server translation rows", () => {
    const title = buildLocalizedPageTitle("Artists", [{ locale: "de", title: "Kuenstler" }], {
      de: { current: { title: "Acts" } },
    });

    expect(title).toEqual({ en: "Artists", de: "Acts" });
  });

  it("ignores draft entries without title changes", () => {
    const title = buildLocalizedPageTitle("Artists", [{ locale: "de", title: "Kuenstler" }], {
      de: { current: {} },
    });

    expect(title).toEqual({ en: "Artists", de: "Kuenstler" });
  });

  it("creates default-page title translation drafts without dropping content", () => {
    expect(
      createPageTitleTranslationDraft({
        title: "Kuenstler",
        content: "# Artists",
        pageType: "default",
      }),
    ).toEqual({ title: "Kuenstler", content: "# Artists", translationReady: false });
  });

  it("creates segmented-page title translation drafts without body content", () => {
    expect(
      createPageTitleTranslationDraft({
        title: "Suche",
        content: "# Should not be copied",
        pageType: "segmented",
      }),
    ).toEqual({ title: "Suche", content: "", translationReady: false });
  });
});
