import { describe, expect, it } from "vitest";
import { getLocalizedText, normalizeLocalizedText, setLocalizedText } from "../localized-text.js";

describe("localized text helpers", () => {
  it("normalizes legacy string values into the default locale", () => {
    const result = normalizeLocalizedText("Artists");

    expect(result.value).toEqual({ en: "Artists" });
    expect(result.conflicts).toEqual([]);
  });

  it("keeps localized maps as localized values", () => {
    const result = normalizeLocalizedText({ en: "Artists", de: "Kuenstler" });

    expect(result.value).toEqual({ en: "Artists", de: "Kuenstler" });
    expect(result.conflicts).toEqual([]);
  });

  it("merges legacy translation maps without overwriting existing localized values", () => {
    const result = normalizeLocalizedText(
      { en: "Genre", de: "Genre" },
      { translations: { de: "Musikrichtung" }, translationsSource: "segment.translations" },
    );

    expect(result.value).toEqual({ en: "Genre", de: "Genre" });
    expect(result.conflicts).toEqual([
      {
        locale: "de",
        kept: "Genre",
        ignored: "Musikrichtung",
        source: "segment.translations",
      },
    ]);
  });

  it("combines default-locale strings with non-default translations", () => {
    const result = normalizeLocalizedText("Link", { translations: { de: "Verknuepfung" } });

    expect(result.value).toEqual({ en: "Link", de: "Verknuepfung" });
  });

  it("returns empty direct value and separate fallback for missing locales", () => {
    const read = getLocalizedText({ en: "Search" }, "de", "en");

    expect(read).toEqual({ value: "", fallback: "Search", hasValue: false, isFallback: true });
  });

  it("sets one localized value without removing other locales", () => {
    const result = setLocalizedText({ en: "Search" }, "de", "Suche");

    expect(result).toEqual({ en: "Search", de: "Suche" });
  });

  it("normalizes empty input to an empty localized value", () => {
    const result = normalizeLocalizedText(null);

    expect(result.value).toEqual({});
    expect(result.conflicts).toEqual([]);
  });
});
