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
      slug: "info",
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
      translationStatus: {} as Record<string, never>,
      position: 0,
    },
  ],
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
    expect(result.current.save.status).toBe("error");
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
