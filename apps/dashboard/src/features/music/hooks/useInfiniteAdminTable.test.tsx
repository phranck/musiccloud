import { SortDirection } from "@musiccloud/dashboard-ui";
import { type AdminEvent, AdminEventType } from "@musiccloud/shared";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";

import { dashboardCopy } from "@/copy/dashboard";
import { useInfiniteAdminTable } from "@/features/music/hooks/useInfiniteAdminTable";
import { TracksPage } from "@/features/music/TracksPage";
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

describe("useInfiniteAdminTable superseded requests", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps the rows of the newest sort when an older answer arrives last", async () => {
    const pending: ((page: { items: Row[]; total: number }) => void)[] = [];
    vi.spyOn(api, "get").mockImplementation(
      () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    );
    const { result } = renderHook(() => useInfiniteAdminTable<Row>({ endpoint: "/api/admin/tracks" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]?.({ items: [{ id: "track-1", name: "Newest" }], total: 1 }));

    act(() => result.current.setSort({ sortBy: "title", sortDir: SortDirection.Asc }));
    await waitFor(() => expect(pending).toHaveLength(2));
    act(() => result.current.setSort({ sortBy: "title", sortDir: SortDirection.Desc }));
    await waitFor(() => expect(pending).toHaveLength(3));

    await act(async () => pending[2]?.({ items: [{ id: "track-2", name: "Zulu" }], total: 1 }));
    await act(async () => pending[1]?.({ items: [{ id: "track-3", name: "Alpha" }], total: 1 }));

    expect(result.current.sortDir).toBe(SortDirection.Desc);
    expect(result.current.items).toEqual([{ id: "track-2", name: "Zulu" }]);
  });
});

describe("sorting the tracks list", () => {
  /** The callback of the observer watching the infinite-scroll sentinel, so a test can scroll to it. */
  const sentinel = { reach: (): void => undefined };

  /** Stands in for the browser's observer, which jsdom does not implement. */
  class SentinelObserver {
    constructor(callback: IntersectionObserverCallback) {
      sentinel.reach = () =>
        callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }

  beforeEach(() => {
    vi.stubGlobal("IntersectionObserver", SentinelObserver);
  });

  // The page unmounts first, because its observer effect still runs while the
  // global is stubbed.
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** A track row as the list endpoint returns it. */
  const track = (id: string, title: string) => ({
    id,
    title,
    artists: [],
    albumName: null,
    isrc: null,
    artworkUrl: null,
    sourceService: null,
    linkCount: 0,
    createdAt: 0,
    shortId: null,
  });

  /** The query of each list request made so far. */
  function requestedQueries(get: MockInstance<typeof api.get>) {
    return get.mock.calls.map(([url]) => {
      const params = new URL(String(url), "http://dashboard.test").searchParams;
      return { page: params.get("page"), sortBy: params.get("sortBy"), sortDir: params.get("sortDir") };
    });
  }

  /** The titles in the order the table renders them. */
  const renderedTitles = () =>
    Array.from(document.querySelectorAll("tbody tr")).map((row) => row.querySelector("td:nth-child(2)")?.textContent);

  it("asks the server for the clicked order and keeps it on the next page", async () => {
    // The server's answer for a title sort is deliberately not in the order a
    // browser would sort these titles into, so a table sorting the loaded rows
    // itself shows them differently.
    const get = vi.spyOn(api, "get").mockImplementation(async (url) => {
      const query = String(url);
      if (query.includes("page=2")) return { items: [track("track-3", "Mike")], total: -1 };
      return query.includes("sortBy=title")
        ? { items: [track("track-2", "Zulu"), track("track-1", "Alpha")], total: 3 }
        : { items: [track("track-1", "Alpha"), track("track-2", "Zulu")], total: 3 };
    });
    render(
      <MemoryRouter>
        <TracksPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(renderedTitles()).toEqual(["Alpha", "Zulu"]));
    expect(requestedQueries(get)).toEqual([{ page: "1", sortBy: "created_at", sortDir: "desc" }]);

    await userEvent.click(screen.getByRole("button", { name: dashboardCopy.music.columns.title }));

    await waitFor(() => expect(renderedTitles()).toEqual(["Zulu", "Alpha"]));
    expect(requestedQueries(get)[1]).toEqual({ page: "1", sortBy: "title", sortDir: "asc" });

    act(() => sentinel.reach());

    await waitFor(() => expect(renderedTitles()).toEqual(["Zulu", "Alpha", "Mike"]));
    expect(requestedQueries(get)[2]).toEqual({ page: "2", sortBy: "title", sortDir: "asc" });
  });

  it("offers a sort only on the columns the server sorts", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ items: [track("track-1", "Alpha")], total: 1 });
    render(
      <MemoryRouter>
        <TracksPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(renderedTitles()).toEqual(["Alpha"]));

    const columns = dashboardCopy.music.columns;
    const sortable = Array.from(document.querySelectorAll("thead button")).map((button) => button.textContent);
    expect(sortable).toEqual([columns.title, columns.added]);
  });
});
