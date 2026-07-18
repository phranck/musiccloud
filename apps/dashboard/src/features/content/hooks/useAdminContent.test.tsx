import { ContentContext, type ContentPage, type ContentPageSummary } from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAdminContentPage, useContentPages } from "@/features/content/hooks/useAdminContent";
import { api } from "@/lib/api";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

const EDITORIAL_PAGE = {
  id: "privacy",
  slug: "privacy",
  contextMask: ContentContext.Frontend | ContentContext.DeveloperPortal,
  publications: [
    { context: ContentContext.Frontend, path: "/privacy", status: "draft", templateKey: "frontend-default" },
    {
      context: ContentContext.DeveloperPortal,
      path: "/privacy",
      status: "draft",
      templateKey: "developer-default",
    },
  ],
} as ContentPageSummary;

const DOCS_PAGE = {
  ...EDITORIAL_PAGE,
  id: "docs",
  slug: "docs",
  publications: [
    {
      context: ContentContext.DeveloperPortal,
      path: "/docs/authentication",
      status: "draft",
      templateKey: "developer-default",
    },
  ],
} as ContentPageSummary;

describe("admin content ownership filtering", () => {
  afterEach(() => vi.restoreAllMocks());

  it("excludes system documentation from the Page list query", async () => {
    vi.spyOn(api, "get").mockResolvedValue([EDITORIAL_PAGE, DOCS_PAGE]);
    const { result } = renderHook(() => useContentPages(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([EDITORIAL_PAGE]);
  });

  it("refuses to hydrate a system documentation detail into editor state", async () => {
    vi.spyOn(api, "get").mockResolvedValue(DOCS_PAGE as ContentPage);
    const { result } = renderHook(() => useAdminContentPage("docs"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(result.current.error?.message).toContain("System-owned documentation");
  });
});
