import { type AdminEvent, AdminEventType } from "@musiccloud/shared";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { api } from "@/lib/api";

/** The callback the hook last handed to the live event stream. */
const stream = vi.hoisted(() => ({ deliver: (_event: AdminEvent): void => undefined }));

vi.mock("@/features/music/hooks/useAdminSSE", () => ({
  useAdminSSE: (onEvent: (event: AdminEvent) => void) => {
    stream.deliver = onEvent;
  },
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

describe("useInfiniteAdminTable deletions from other sessions", () => {
  afterEach(() => vi.restoreAllMocks());

  const TRACKS = {
    items: [
      { id: "track-1", name: "One" },
      { id: "track-2", name: "Two" },
    ],
    total: 5,
  };

  /** Renders a tracks list that listens for track deletions and waits for its first page. */
  async function renderTracks() {
    vi.spyOn(api, "get").mockResolvedValueOnce(TRACKS);
    const rendered = renderHook(() =>
      useInfiniteAdminTable<Row>({
        endpoint: "/api/admin/tracks",
        deleteEndpoint: "/api/admin/tracks",
        deletedEventType: AdminEventType.TracksDeleted,
      }),
    );
    await waitFor(() => expect(rendered.result.current.items).toEqual(TRACKS.items));
    return rendered;
  }

  const deletion = (ids: string[], type: AdminEvent["type"] = AdminEventType.TracksDeleted): AdminEvent => ({
    type,
    data: { count: ids.length, ids },
  });

  it("drops a deleted row once, however often the event arrives", async () => {
    const { result } = await renderTracks();

    act(() => stream.deliver(deletion(["track-1"])));
    expect(result.current.items.map((row) => row.id)).toEqual(["track-2"]);
    expect(result.current.total).toBe(4);

    act(() => stream.deliver(deletion(["track-1"])));
    expect(result.current.items.map((row) => row.id)).toEqual(["track-2"]);
    expect(result.current.total).toBe(4);
  });

  it("ignores deletions of another list's rows", async () => {
    const { result } = await renderTracks();

    act(() => stream.deliver(deletion(["track-1"], AdminEventType.AlbumsDeleted)));

    expect(result.current.items).toEqual(TRACKS.items);
    expect(result.current.total).toBe(5);
  });

  it("leaves the rows this session is deleting to its own fade-out", async () => {
    const { result } = await renderTracks();
    vi.spyOn(api, "delete").mockReturnValueOnce(new Promise(() => undefined));
    act(() => result.current.toggleRow("track-1"));

    act(() => {
      void result.current.deleteSelected();
    });
    act(() => stream.deliver(deletion(["track-1"])));

    expect(result.current.items).toEqual(TRACKS.items);
    expect(result.current.total).toBe(5);
  });
});
