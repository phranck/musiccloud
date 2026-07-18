import {
  ContentContext,
  ENDPOINTS,
  NavigationArea,
  type NavigationConfiguration,
  type NavigationConfigurationInput,
  NavigationTargetKind,
} from "@musiccloud/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useAdminNavigationConfiguration, useSaveNavigationConfiguration } from "@/features/content/hooks/useAdminNav";
import { api } from "@/lib/api";

const input: NavigationConfigurationInput = {
  entries: [
    {
      targetKind: NavigationTargetKind.System,
      pageId: null,
      url: null,
      systemKey: "docs",
      target: "_self",
      label: "Documentation",
      contextMask: ContentContext.DeveloperPortal,
      areaMask: NavigationArea.Main,
      placements: [{ context: ContentContext.DeveloperPortal, area: NavigationArea.Main, position: 0 }],
    },
  ],
};

const configuration: NavigationConfiguration = {
  entries: [
    {
      ...input.entries[0]!,
      id: 1,
      pageSlug: null,
      pageTitle: null,
      canonicalRoute: "/docs",
      behavior: "navigate",
    },
  ],
};

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe("contextual admin navigation hooks", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads the complete contextual configuration endpoint", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue(configuration);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAdminNavigationConfiguration(), {
      wrapper: createWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(get).toHaveBeenCalledWith(ENDPOINTS.admin.navigations.configuration);
    expect(result.current.data).toEqual(configuration);
  });

  it("saves the complete configuration through one atomic mutation", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue(configuration);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const { result } = renderHook(() => useSaveNavigationConfiguration(), {
      wrapper: createWrapper(queryClient),
    });

    await act(() => result.current.mutateAsync(input));

    expect(put).toHaveBeenCalledWith(ENDPOINTS.admin.navigations.configuration, input);
    expect(queryClient.getQueryData(["admin-navigation-configuration"])).toEqual(configuration);
  });
});
