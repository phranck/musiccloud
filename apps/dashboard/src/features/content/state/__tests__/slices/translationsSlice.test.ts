import { describe, expect, it } from "vitest";
import { dirtyEntries, isTranslationDirty, translationsReducer } from "../../slices/translationsSlice";

describe("translationsSlice", () => {
  const seed = {
    byPage: {
      info: {
        de: {
          initial: { title: "Information", content: "# Info de" },
          current: { title: "Information", content: "# Info de" },
        },
      },
    },
  };

  it("hydrate seeds initial=current", () => {
    const s = translationsReducer(
      { byPage: {} },
      {
        type: "hydrate",
        entries: [{ slug: "info", locale: "de", title: "Information", content: "# Info de" }],
      },
    );
    expect(s.byPage.info.de.initial.title).toBe("Information");
    expect(dirtyEntries(s)).toEqual([]);
  });

  it("set-field marks (slug, locale) dirty", () => {
    const s1 = translationsReducer(seed, {
      type: "set-field",
      slug: "info",
      locale: "de",
      field: "title",
      value: "Information v2",
    });
    expect(dirtyEntries(s1)).toEqual([{ slug: "info", locale: "de" }]);
  });

  it("reverting field clears dirty", () => {
    const s1 = translationsReducer(seed, {
      type: "set-field",
      slug: "info",
      locale: "de",
      field: "title",
      value: "X",
    });
    const s2 = translationsReducer(s1, {
      type: "set-field",
      slug: "info",
      locale: "de",
      field: "title",
      value: "Information",
    });
    expect(dirtyEntries(s2)).toEqual([]);
  });

  it("multiple dirty pages × locales reported separately", () => {
    const seed2 = {
      byPage: {
        info: { de: { initial: { title: "A" }, current: { title: "A" } } },
        help: { de: { initial: { title: "B" }, current: { title: "B" } } },
      },
    };
    const s1 = translationsReducer(seed2, {
      type: "set-field",
      slug: "info",
      locale: "de",
      field: "title",
      value: "A2",
    });
    const s2 = translationsReducer(s1, { type: "set-field", slug: "help", locale: "de", field: "title", value: "B2" });
    expect(dirtyEntries(s2)).toEqual(
      expect.arrayContaining([
        { slug: "info", locale: "de" },
        { slug: "help", locale: "de" },
      ]),
    );
  });

  it("reset reverts all entries", () => {
    const s1 = translationsReducer(seed, { type: "set-field", slug: "info", locale: "de", field: "title", value: "X" });
    const s2 = translationsReducer(s1, { type: "reset" });
    expect(dirtyEntries(s2)).toEqual([]);
  });

  it("add-locale on a new page creates entry with empty initial and given current → dirty", () => {
    const s = translationsReducer(
      { byPage: {} },
      {
        type: "add-locale",
        slug: "info",
        locale: "es",
        fields: { title: "Información", content: "# es" },
      },
    );
    expect(s.byPage.info.es.initial).toEqual({ title: "", content: "" });
    expect(s.byPage.info.es.current).toEqual({ title: "Información", content: "# es" });
    expect(dirtyEntries(s)).toEqual([{ slug: "info", locale: "es" }]);
  });

  it("add-locale leaves other locales of the same page untouched", () => {
    const s2 = translationsReducer(seed, {
      type: "add-locale",
      slug: "info",
      locale: "es",
      fields: { title: "Información", content: "# es" },
    });
    expect(s2.byPage.info.de.initial.title).toBe("Information");
    expect(s2.byPage.info.de.current.title).toBe("Information");
    expect(dirtyEntries(s2)).toEqual([{ slug: "info", locale: "es" }]);
  });

  it("reset clears the added locale's dirty state (current reverts to empty initial)", () => {
    const s1 = translationsReducer(
      { byPage: {} },
      {
        type: "add-locale",
        slug: "info",
        locale: "es",
        fields: { title: "X", content: "Y" },
      },
    );
    const s2 = translationsReducer(s1, { type: "reset" });
    expect(dirtyEntries(s2)).toEqual([]);
    expect(s2.byPage.info.es.current).toEqual({ title: "", content: "" });
  });

  it("isTranslationDirty: unknown slug/locale → false, hydrated clean → false, edited → true", () => {
    const s0 = translationsReducer(
      { byPage: {} },
      {
        type: "hydrate",
        entries: [{ slug: "info", locale: "de", title: "Information", content: "# x" }],
      },
    );
    expect(isTranslationDirty(s0, "missing", "de")).toBe(false);
    expect(isTranslationDirty(s0, "info", "missing")).toBe(false);
    expect(isTranslationDirty(s0, "info", "de")).toBe(false);
    const s1 = translationsReducer(s0, {
      type: "set-field",
      slug: "info",
      locale: "de",
      field: "title",
      value: "Information v2",
    });
    expect(isTranslationDirty(s1, "info", "de")).toBe(true);
  });
});
