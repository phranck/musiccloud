import { describe, expect, it } from "vitest";
import { buildBulkPayload } from "../diff";
import type { MetaState } from "../slices/metaSlice";

type MetaFields = MetaState["pages"][string]["initial"];

describe("buildBulkPayload", () => {
  it("emits empty payload for clean state", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p).toEqual({});
  });

  it("includes only dirty pages.meta", () => {
    const p = buildBulkPayload({
      meta: {
        pages: {
          info: {
            initial: { title: "A" } as unknown as MetaFields,
            current: { title: "B" } as unknown as MetaFields,
          },
        },
      },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pages).toEqual([{ slug: "info", meta: { title: "B" } }]);
  });

  it("merges meta + content for same slug into one entry", () => {
    const p = buildBulkPayload({
      meta: {
        pages: {
          info: {
            initial: { title: "A" } as unknown as MetaFields,
            current: { title: "B" } as unknown as MetaFields,
          },
        },
      },
      content: { pages: { info: { initial: "# old", current: "# new" } } },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pages).toEqual([{ slug: "info", meta: { title: "B" }, content: "# new" }]);
  });

  it("emits topLevelOrder only when sidebar dirty", () => {
    const clean = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: ["a", "b"], current: ["a", "b"] },
    });
    expect(clean.topLevelOrder).toBeUndefined();
    const dirty = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: ["a", "b"], current: ["b", "a"] },
    });
    expect(dirty.topLevelOrder).toEqual(["b", "a"]);
  });

  it("emits segments for each dirty owner", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: {
        byOwner: {
          info: {
            initial: [{ position: 0, label: { en: "A" }, targetSlug: "a" }],
            current: [
              { position: 0, label: { en: "A" }, targetSlug: "a" },
              { position: 1, label: { en: "B", de: "B DE" }, targetSlug: "b" },
            ],
          },
          help: {
            initial: [{ position: 0, label: { en: "X" }, targetSlug: "x" }],
            current: [{ position: 0, label: { en: "X" }, targetSlug: "x" }],
          },
        },
      },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p.segments).toHaveLength(1);
    expect(p.segments![0].ownerSlug).toBe("info");
    expect(p.segments![0].segments).toHaveLength(2);
    expect(p.segments![0].segments[1]).toEqual({
      position: 1,
      label: "B",
      targetSlug: "b",
      translations: { de: "B DE" },
    });
  });

  it("emits pageTranslations for each dirty (slug, locale)", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: {
        byPage: {
          info: {
            de: { initial: { title: "A" }, current: { title: "A2" } },
            fr: { initial: { title: "B" }, current: { title: "B" } },
          },
        },
      },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pageTranslations).toEqual([expect.objectContaining({ slug: "info", locale: "de", title: "A2" })]);
  });

  it("does not emit slug or page meta for non-default title edits", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: {
        byPage: {
          info: {
            de: { initial: { title: "Artists" }, current: { title: "Kuenstler" } },
          },
        },
      },
      sidebar: { initial: [], current: [] },
    });

    expect(p.pages).toBeUndefined();
    expect(p.pageTranslations).toEqual([{ slug: "info", locale: "de", title: "Kuenstler" }]);
  });
});
