import { ContentContext } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import type { ApiRequestError } from "@/shared/utils/api-error";

import { PagesEditorProvider, usePagesEditor } from "../PagesEditorContext";
import { useGlobalPagesSave } from "../useGlobalPagesSave";
import { makeMeta } from "./factories";

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <PagesEditorProvider>{children}</PagesEditorProvider>
      </QueryClientProvider>
    );
  };
}

const SNAPSHOT = {
  pages: [
    {
      id: "page-info",
      slug: "info",
      contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
      publications: [
        {
          context: ContentContext.Frontend,
          path: "/info",
          status: "published" as const,
          templateKey: "frontend-default",
        },
        {
          context: ContentContext.DeveloperPortal,
          path: "/company/info",
          status: "draft" as const,
          templateKey: "developer-default",
        },
      ],
      title: "Information v2",
      status: "published" as const,
      showTitle: true,
      titleAlignment: "left" as const,
      pageType: "segmented" as const,
      displayMode: "fullscreen" as const,
      overlayWidth: "regular" as const,
      contentCardStyle: "default" as const,
      createdByUsername: null,
      updatedByUsername: null,
      createdAt: "2026-05-03T00:00:00Z",
      updatedAt: null,
      position: 0,
    },
  ],
};

const DOCS_PAGE = {
  ...SNAPSHOT.pages[0],
  id: "page-docs-authentication",
  slug: "docs-authentication",
  contextMask: ContentContext.DeveloperPortal,
  publications: [
    {
      context: ContentContext.DeveloperPortal,
      path: "/docs/authentication",
      status: "published" as const,
      templateKey: "developer-default",
    },
  ],
  title: "Authentication",
  pageType: "default" as const,
  position: 1,
};

describe("useGlobalPagesSave", () => {
  it("save() posts the diff and clears dirty on 200", async () => {
    const putSpy = vi.spyOn(api, "put").mockResolvedValue(SNAPSHOT);
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.meta({
        type: "hydrate",
        entries: [{ slug: "info", meta: makeMeta({ title: "Information" }) }],
      });
    });
    act(() => {
      result.current.editor.dispatch.meta({
        type: "set-field",
        slug: "info",
        field: "title",
        value: "Information v2",
      });
    });
    await act(async () => {
      await result.current.save.save();
    });
    expect(putSpy).toHaveBeenCalledWith("/api/admin/pages/bulk", expect.any(Object));
    expect(result.current.editor.dirty.size()).toBe(0);
    expect(result.current.save.status).toBe("idle");
    putSpy.mockRestore();
  });

  it("save() keeps dirty state on 4xx and surfaces details", async () => {
    const apiErr = Object.assign(new Error("INVALID_INPUT"), {
      status: 400,
      responseMessage: "INVALID_INPUT",
      errorId: "error-reserved-docs",
      details: [{ section: "pages", index: 0, message: "bad slug" }],
    }) as ApiRequestError;
    const putSpy = vi.spyOn(api, "put").mockRejectedValue(apiErr);
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.meta({
        type: "hydrate",
        entries: [{ slug: "info", meta: makeMeta({ title: "A" }) }],
      });
    });
    act(() => {
      result.current.editor.dispatch.meta({
        type: "set-field",
        slug: "info",
        field: "title",
        value: "B",
      });
    });
    await act(async () => {
      await result.current.save.save();
    });
    expect(result.current.editor.dirty.size()).toBeGreaterThan(0);
    expect(result.current.save.errorDetails).toEqual([{ section: "pages", index: 0, message: "bad slug" }]);
    expect(result.current.save.errorMessage).toBe("INVALID_INPUT");
    expect(result.current.save.errorId).toBe("error-reserved-docs");
    expect(result.current.save.status).toBe("error");
    putSpy.mockRestore();
  });

  it("saves publication changes and rehydrates them from the server response", async () => {
    const putSpy = vi.spyOn(api, "put").mockResolvedValue(SNAPSHOT);
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.publications({
        type: "hydrate",
        entries: [
          {
            slug: "info",
            pageId: "page-info",
            contextMask: ContentContext.Frontend,
            publications: [
              {
                context: ContentContext.Frontend,
                path: "/info",
                status: "published",
                templateKey: "frontend-default",
              },
            ],
          },
        ],
      });
    });
    act(() => {
      result.current.editor.dispatch.publications({
        type: "toggle-context",
        slug: "info",
        context: ContentContext.DeveloperPortal,
        enabled: true,
      });
    });

    await act(async () => {
      await result.current.save.save();
    });

    expect(putSpy).toHaveBeenCalledWith(
      "/api/admin/pages/bulk",
      expect.objectContaining({
        pages: [
          expect.objectContaining({
            slug: "info",
            meta: expect.objectContaining({
              contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
            }),
          }),
        ],
      }),
    );
    expect(result.current.editor.publications.pages.info.current.publications[1]?.path).toBe("/company/info");
    expect(result.current.editor.dirty.size()).toBe(0);
    putSpy.mockRestore();
  });

  it("never rehydrates system-owned Docs from a successful bulk snapshot", async () => {
    const putSpy = vi.spyOn(api, "put").mockResolvedValue({ pages: [...SNAPSHOT.pages, DOCS_PAGE] });
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.meta({
        type: "hydrate",
        entries: [{ slug: "info", meta: makeMeta({ title: "Information" }) }],
      });
      result.current.editor.dispatch.meta({
        type: "set-field",
        slug: "info",
        field: "title",
        value: "Information v2",
      });
    });

    await act(async () => {
      await result.current.save.save();
    });

    expect(result.current.editor.meta.pages["docs-authentication"]).toBeUndefined();
    expect(result.current.editor.publications.pages["docs-authentication"]).toBeUndefined();
    putSpy.mockRestore();
  });

  it("preserves a reserved Docs publication draft and surfaces its backend errorId", async () => {
    const apiError = Object.assign(
      new Error("Developer Portal path '/docs/authentication' is reserved (MC-REQ-0001)"),
      {
        status: 400,
        responseMessage: "Developer Portal path '/docs/authentication' is reserved (MC-REQ-0001)",
        errorId: "reserved-docs-error-id",
        details: [
          {
            section: "pages",
            index: 0,
            message: "Developer Portal path '/docs/authentication' is reserved",
          },
        ],
      },
    ) as ApiRequestError;
    const putSpy = vi.spyOn(api, "put").mockRejectedValue(apiError);
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.publications({
        type: "hydrate",
        entries: [
          {
            slug: "privacy",
            pageId: "page-privacy",
            contextMask: ContentContext.DeveloperPortal,
            publications: [
              {
                context: ContentContext.DeveloperPortal,
                path: "/privacy",
                status: "draft",
                templateKey: "developer-default",
              },
            ],
          },
        ],
      });
    });
    act(() => {
      result.current.editor.dispatch.publications({
        type: "set-field",
        slug: "privacy",
        context: ContentContext.DeveloperPortal,
        field: "path",
        value: "/docs/authentication",
      });
    });

    await act(async () => {
      await result.current.save.save();
    });

    expect(result.current.editor.publications.pages.privacy.current.publications[0]?.path).toBe("/docs/authentication");
    expect(result.current.editor.dirty.size()).toBeGreaterThan(0);
    expect(result.current.save.errorId).toBe("reserved-docs-error-id");
    expect(result.current.save.errorMessage).toContain("reserved");
    putSpy.mockRestore();
  });

  it("discard() reverts current to initial across all slices", () => {
    const { result } = renderHook(
      () => {
        const editor = usePagesEditor();
        const save = useGlobalPagesSave();
        return { editor, save };
      },
      { wrapper: makeWrapper() },
    );
    act(() => {
      result.current.editor.dispatch.meta({
        type: "hydrate",
        entries: [{ slug: "info", meta: makeMeta({ title: "A" }) }],
      });
      result.current.editor.dispatch.content({
        type: "hydrate",
        entries: [{ slug: "info", content: "# A" }],
      });
    });
    act(() => {
      result.current.editor.dispatch.meta({
        type: "set-field",
        slug: "info",
        field: "title",
        value: "B",
      });
      result.current.editor.dispatch.content({ type: "set", slug: "info", value: "# B" });
    });
    expect(result.current.editor.dirty.size()).toBeGreaterThan(0);
    act(() => {
      result.current.save.discard();
    });
    expect(result.current.editor.dirty.size()).toBe(0);
  });
});
