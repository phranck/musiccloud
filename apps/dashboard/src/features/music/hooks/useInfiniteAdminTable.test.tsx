import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { api } from "@/lib/api";

vi.mock("@/features/music/hooks/useAdminSSE", () => ({
  useAdminSSE: vi.fn(),
}));

interface Row {
  id: string;
  name: string;
}

const FIRST_PAGE = { items: [{ id: "artist-1", name: "Before" }], total: 1 };
const REFRESHED_PAGE = { items: [{ id: "artist-1", name: "After" }], total: 1 };

describe("useInfiniteAdminTable refreshSilently", () => {
  afterEach(() => vi.restoreAllMocks());

  it("replaces page one only after a successful silent refetch", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce(FIRST_PAGE);
    const { result } = renderHook(() => useInfiniteAdminTable<Row>({ endpoint: "/api/admin/artists" }));
    await waitFor(() => expect(result.current.items).toEqual(FIRST_PAGE.items));

    let resolveRefresh: (page: typeof REFRESHED_PAGE) => void = () => {};
    get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refreshSilently();
    });

    expect(result.current.items).toEqual(FIRST_PAGE.items);
    expect(result.current.isInitialLoading).toBe(false);
    expect(result.current.isRefreshing).toBe(false);

    await act(async () => {
      resolveRefresh(REFRESHED_PAGE);
      await refreshPromise;
    });

    expect(result.current.items).toEqual(REFRESHED_PAGE.items);
    expect(result.current.total).toBe(1);
  });

  it("rejects a failed silent refetch while preserving rows and ready state", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValueOnce(FIRST_PAGE);
    const { result } = renderHook(() => useInfiniteAdminTable<Row>({ endpoint: "/api/admin/artists" }));
    await waitFor(() => expect(result.current.items).toEqual(FIRST_PAGE.items));

    get.mockRejectedValueOnce(new Error("refresh failed"));

    await act(async () => {
      await expect(result.current.refreshSilently()).rejects.toThrow("refresh failed");
    });

    expect(result.current.items).toEqual(FIRST_PAGE.items);
    expect(result.current.total).toBe(1);
    expect(result.current.isError).toBe(false);
    expect(result.current.isRefreshing).toBe(false);
  });
});
