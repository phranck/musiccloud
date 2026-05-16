import { describe, expect, it } from "vitest";
import { buildLocalizedPageTitle } from "../pageLocalization";

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
});
