import { describe, expect, it } from "vitest";
import { dirtyEntries, translationsReducer } from "../../slices/translationsSlice";

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
        entries: [{ slug: "info", locale: "de", title: "Information", content: "# Info de", translationReady: true }],
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
});
