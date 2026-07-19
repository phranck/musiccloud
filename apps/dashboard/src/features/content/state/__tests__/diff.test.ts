import { ContentContext } from "@musiccloud/shared";
import { describe, expect, it } from "vitest";
import { buildBulkPayload } from "../diff";
import type { MetaState } from "../slices/metaSlice";
import {
  createInitialPublicationsState,
  PublicationsActionType,
  publicationsReducer,
} from "../slices/publicationsSlice";

type MetaFields = MetaState["pages"][string]["initial"];

describe("buildBulkPayload", () => {
  it("emits empty payload for clean state", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
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
      sidebar: { initial: [], current: [] },
    });
    expect(p.pages).toEqual([{ slug: "info", meta: { title: "B" }, content: "# new" }]);
  });

  it("includes dirty contextual publications in the page meta payload", () => {
    const hydrated = publicationsReducer(createInitialPublicationsState(), {
      type: PublicationsActionType.Hydrate,
      entries: [
        {
          slug: "privacy",
          pageId: "page-privacy",
          contextMask: ContentContext.Frontend,
          publications: [
            {
              context: ContentContext.Frontend,
              path: "/privacy",
              status: "published",
              templateKey: "frontend-default",
            },
          ],
        },
      ],
    });
    const publications = publicationsReducer(hydrated, {
      type: PublicationsActionType.ToggleContext,
      slug: "privacy",
      context: ContentContext.DeveloperPortal,
      enabled: true,
    });

    const payload = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      publications,
      segments: { byOwner: {} },
      sidebar: { initial: [], current: [] },
    });

    expect(payload.pages).toEqual([
      {
        slug: "privacy",
        meta: {
          contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
          publications: [
            {
              context: ContentContext.Frontend,
              path: "/privacy",
              status: "published",
              templateKey: "frontend-default",
            },
            {
              context: ContentContext.DeveloperPortal,
              path: "/privacy",
              status: "draft",
              templateKey: "developer-default",
            },
          ],
        },
      },
    ]);
  });

  it("emits topLevelOrder only when sidebar dirty", () => {
    const clean = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      sidebar: { initial: ["a", "b"], current: ["a", "b"] },
    });
    expect(clean.topLevelOrder).toBeUndefined();
    const dirty = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
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
            initial: [{ position: 0, label: "A", targetSlug: "a" }],
            current: [
              { position: 0, label: "A", targetSlug: "a" },
              { position: 1, label: "B", targetSlug: "b" },
            ],
          },
          help: {
            initial: [{ position: 0, label: "X", targetSlug: "x" }],
            current: [{ position: 0, label: "X", targetSlug: "x" }],
          },
        },
      },
      sidebar: { initial: [], current: [] },
    });
    expect(p.segments).toHaveLength(1);
    expect(p.segments![0].ownerSlug).toBe("info");
    expect(p.segments![0].segments).toHaveLength(2);
    expect(p.segments![0].segments[1]).toEqual({
      position: 1,
      label: "B",
      targetSlug: "b",
    });
  });

  it("emits only canonical segment fields", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: {
        byOwner: {
          info: {
            initial: [{ position: 0, label: "A", targetSlug: "a" }],
            current: [{ position: 0, label: "B", targetSlug: "a" }],
          },
        },
      },
      sidebar: { initial: [], current: [] },
    });

    expect(p.segments![0].segments[0]).toEqual({ position: 0, label: "B", targetSlug: "a" });
    expect(p).not.toHaveProperty("pageTranslations");
    expect(p.segments![0].segments[0]).not.toHaveProperty("translations");
  });
});
