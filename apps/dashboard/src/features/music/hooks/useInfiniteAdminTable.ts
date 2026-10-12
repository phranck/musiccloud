import { SortDirection } from "@musiccloud/dashboard-ui";
import type { AdminEventType } from "@musiccloud/shared";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useAdminSSE } from "@/features/music/hooks/useAdminSSE";
import { api } from "@/lib/api";

/**
 * Walks up the DOM from `el` (inclusive) and returns the nearest ancestor
 * that genuinely scrolls — i.e. its computed `overflow-y` is `auto`/`scroll`
 * *and* its content is taller than its box.
 *
 * The infinite-scroll {@link IntersectionObserver} must be anchored to the
 * element that actually scrolls. The dashboard shell renders every route
 * inside a height-capped, scrollable Card, while the list's own
 * `overflow-y-auto` wrapper expands to full content height and therefore
 * never scrolls itself. Anchoring the observer to that non-scrolling
 * wrapper keeps the sentinel permanently intersecting, which fires
 * `loadMore` again and again until the entire catalog is loaded. Resolving
 * the real scroll ancestor at observe-time stops that cascade and keeps the
 * `rootMargin` prefetch buffer meaningful (it is measured against the
 * scrolling viewport, not the expanded wrapper).
 *
 * @param el - Element to start from (the sentinel node). The search is
 *   inclusive, so a wrapper that does scroll is still picked up.
 * @returns The nearest scrolling ancestor, or `null` to let the observer
 *   fall back to the browser viewport as its root.
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

interface Page<T> {
  items: T[];
  total: number;
}

type TableState<T extends { id: string }> =
  | { tag: "idle" }
  | { tag: "loading-first"; stale?: T[] }
  | { tag: "ready"; items: T[]; total: number; nextPage: number; hasMore: boolean }
  | { tag: "loading-more"; items: T[]; total: number; nextPage: number; hasMore: boolean }
  | { tag: "error"; message: string };

type TableAction<T extends { id: string }> =
  | { type: "RESET"; stale?: T[] }
  | { type: "FIRST_PAGE"; items: T[]; total: number }
  | { type: "LOAD_MORE" }
  | { type: "MORE_LOADED"; items: T[]; total: number }
  | { type: "REMOVE_MANY"; ids: Set<string> }
  | { type: "ERROR"; message: string };

function makeReducer<T extends { id: string }>() {
  return function reducer(state: TableState<T>, action: TableAction<T>): TableState<T> {
    switch (action.type) {
      case "RESET":
        return { tag: "loading-first", stale: action.stale };
      case "FIRST_PAGE":
        return {
          tag: "ready",
          items: action.items,
          total: action.total,
          nextPage: 2,
          hasMore: action.items.length < action.total,
        };
      case "LOAD_MORE":
        if (state.tag !== "ready" || !state.hasMore) return state;
        return {
          tag: "loading-more",
          items: state.items,
          total: state.total,
          nextPage: state.nextPage,
          hasMore: state.hasMore,
        };
      case "MORE_LOADED": {
        if (state.tag !== "loading-more") return state;
        const merged = [...state.items, ...action.items];
        // Backend skips the COUNT query on page > 1 and returns total = -1
        // to signal "unchanged". Keep the cached value from page 1 so
        // `hasMore` stays meaningful across the rest of the infinite scroll.
        const total = action.total >= 0 ? action.total : state.total;
        return {
          tag: "ready",
          items: merged,
          total,
          nextPage: state.nextPage + 1,
          hasMore: merged.length < total,
        };
      }
      case "REMOVE_MANY": {
        if (state.tag !== "ready" && state.tag !== "loading-more") return state;
        const filtered = state.items.filter((item) => !action.ids.has(item.id));
        // The total drops by the rows that actually left the list, so the same
        // ids arriving twice, from this session's delete and from the live
        // event about it, are counted once.
        const newTotal = Math.max(0, state.total - (state.items.length - filtered.length));
        return {
          ...state,
          items: filtered,
          total: newTotal,
          hasMore: filtered.length < newTotal,
        };
      }
      case "ERROR":
        return { tag: "error", message: action.message };
    }
  };
}

const PAGE_SIZE = 50;

/** The order an admin list is requested in. */
export interface AdminListSort {
  /** The endpoint's name for the sorted column, such as `title` or `created_at`. */
  sortBy: string;
  sortDir: SortDirection;
}

/** The order the admin list endpoints return when a request names none. */
const DEFAULT_ADMIN_LIST_SORT: AdminListSort = { sortBy: "created_at", sortDir: SortDirection.Desc };

interface UseInfiniteAdminTableOptions {
  endpoint: string;
  deleteEndpoint?: string;
  /**
   * The live event that reports deletions of this list's rows. When it
   * arrives, the listed rows leave the loaded list, whichever admin session
   * deleted them.
   */
  deletedEventType?: AdminEventType;
}

/**
 * Holds a paged admin list, so the tracks, albums or artists, and everything
 * the page does with it: the search, the sort, infinite scrolling, selection
 * and deletion.
 *
 * The server sorts and pages the list, and the hook only ever asks it for the
 * next page of one ordered result. A change of search or sort therefore starts
 * again at page one, because a page in another order would not continue the
 * rows already loaded. The list starts in the order the endpoints use when
 * asked for none, newest first.
 *
 * @param options - The list endpoint, the endpoint deletions go to, and the
 *   live event that reports deletions from other sessions.
 * @returns The loaded rows and their state, the search and sort with their
 *   setters, the selection and deletion controls, and the sentinel ref that
 *   triggers the next page.
 */
export function useInfiniteAdminTable<T extends { id: string }>(options: UseInfiniteAdminTableOptions) {
  const { endpoint, deleteEndpoint, deletedEventType } = options;

  const [reducer] = useState(() => makeReducer<T>());
  const [state, dispatch] = useReducer(reducer, { tag: "idle" } as TableState<T>);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<AdminListSort>(DEFAULT_ADMIN_LIST_SORT);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  /**
   * Rows this session is deleting. The live event about that deletion can
   * arrive before the request returns, so it must not remove them early and
   * cut the fade-out short.
   */
  const ownDeletionIdsRef = useRef<Set<string>>(new Set());

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery and sort are intentional triggers to reset selection when filter/sort params change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, sort]);

  // Escape to exit edit mode
  useEffect(() => {
    if (!editMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEditMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode]);

  /**
   * The request for one page. Every page of a list is asked for with the same
   * search and sort, because the server pages through one ordered result and a
   * page asked for in another order would not continue the rows already shown.
   */
  const pageUrl = useCallback(
    (page: number) => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sortBy: sort.sortBy,
        sortDir: sort.sortDir,
      });
      if (searchQuery) params.set("q", searchQuery);
      return `${endpoint}?${params}`;
    },
    [endpoint, searchQuery, sort],
  );

  // Fetch
  const fetchFirstPage = useCallback(
    (stale?: T[]) => {
      dispatch({ type: "RESET", stale });
      api
        .get<Page<T>>(pageUrl(1))
        .then((data) => dispatch({ type: "FIRST_PAGE", items: data.items, total: data.total }))
        .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
    },
    [pageUrl],
  );

  const refreshSilently = useCallback(async () => {
    const data = await api.get<Page<T>>(pageUrl(1));
    dispatch({ type: "FIRST_PAGE", items: data.items, total: data.total });
  }, [pageUrl]);

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.tag !== "ready" || !s.hasMore) return;
    dispatch({ type: "LOAD_MORE" });
    api
      .get<Page<T>>(pageUrl(s.nextPage))
      .then((data) => dispatch({ type: "MORE_LOADED", items: data.items, total: data.total }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [pageUrl]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const fetchFirstPageRef = useRef(fetchFirstPage);
  fetchFirstPageRef.current = fetchFirstPage;

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery and sort are intentional triggers to re-fetch when filter/sort params change, even though they are accessed via refs inside the effect body.
  useEffect(() => {
    const s = stateRef.current;
    const stale = s.tag === "ready" || s.tag === "loading-more" ? s.items : undefined;
    fetchFirstPageRef.current(stale);
  }, [searchQuery, sort]);

  // Infinite scroll. The observer root is resolved to the element that
  // actually scrolls (see findScrollParent); anchoring it to the list's
  // own wrapper — which the shell lets expand to full height — would keep
  // the sentinel permanently visible and load the whole catalog at once.
  const canLoadMore = state.tag === "ready" && state.hasMore;
  useEffect(() => {
    if (!canLoadMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const root = findScrollParent(sentinel);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { root, rootMargin: "0px 0px 400px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore]);

  // Deletions from any admin session.
  useAdminSSE(
    useCallback(
      (event) => {
        if (!deletedEventType || event.type !== deletedEventType) return;
        const ids = new Set(event.data.ids.filter((id) => !ownDeletionIdsRef.current.has(id)));
        if (ids.size > 0) dispatch({ type: "REMOVE_MANY", ids });
      },
      [deletedEventType],
    ),
  );

  // Selection helpers
  const items =
    state.tag === "ready" || state.tag === "loading-more"
      ? state.items
      : state.tag === "loading-first" && state.stale
        ? state.stale
        : [];
  const total = state.tag === "ready" || state.tag === "loading-more" ? state.total : null;
  const visibleIds = items.map((item) => item.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleEditMode() {
    setEditMode((prev) => !prev);
    if (editMode) setSelectedIds(new Set());
  }

  // Delete
  async function deleteSelected() {
    if (!deleteEndpoint || selectedIds.size === 0) return;
    const toDelete = new Set(selectedIds);
    ownDeletionIdsRef.current = toDelete;
    try {
      await api.delete(deleteEndpoint, { ids: [...toDelete] });
    } catch (error) {
      ownDeletionIdsRef.current = new Set();
      throw error;
    }
    setSelectedIds(new Set());
    setDeletingIds(toDelete);
    setTimeout(() => {
      dispatch({ type: "REMOVE_MANY", ids: toDelete });
      setDeletingIds(new Set());
      ownDeletionIdsRef.current = new Set();
    }, 300);
  }

  return {
    items,
    total,
    isInitialLoading: state.tag === "idle" || (state.tag === "loading-first" && !state.stale),
    isRefreshing: state.tag === "loading-first" && Boolean(state.stale),
    isLoadingMore: state.tag === "loading-more",
    isError: state.tag === "error",
    errorMessage: state.tag === "error" ? state.message : null,

    searchInput,
    setSearchInput,
    /** The endpoint's name for the sorted column. */
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
    /** Requests the list again from page one in the given order. */
    setSort,

    editMode,
    toggleEditMode,
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    toggleAll,
    toggleRow,
    deletingIds,
    deleteSelected,
    refreshSilently,

    sentinelRef,
  };
}

/** What {@link useInfiniteAdminTable} hands back to the page that renders the list. */
export type InfiniteAdminTable<T extends { id: string }> = ReturnType<typeof useInfiniteAdminTable<T>>;
