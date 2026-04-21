import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, isLocale, LOCALES } from "../locales.js";

describe("locales", () => {
  it("exposes exactly en and de", () => {
    expect(LOCALES).toEqual(["en", "de"]);
  });

  it("en is the default", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("isLocale narrows to Locale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
