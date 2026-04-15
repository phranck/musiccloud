import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useAdminSSE } from "@/features/music/hooks/useAdminSSE";
import { api } from "@/lib/api";

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
  | { type: "PREPEND"; item: T }
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
        if (state.tag !== "ready") return state;
        const filtered = state.items.filter((item) => !action.ids.has(item.id));
        const newTotal = Math.max(0, state.total - action.ids.size);
        return {
          tag: "ready",
          items: filtered,
          total: newTotal,
          nextPage: state.nextPage,
          hasMore: filtered.length < newTotal,
        };
      }
      case "PREPEND": {
        if (state.tag !== "ready" && state.tag !== "loading-more") return state;
        return {
          tag: "ready",
          items: [action.item, ...state.items],
          total: state.total + 1,
          nextPage: state.nextPage,
          hasMore: state.hasMore,
        };
      }
      case "ERROR":
        return { tag: "error", message: action.message };
    }
  };
}

const PAGE_SIZE = 50;

interface UseInfiniteAdminTableOptions<T extends { id: string }> {
  endpoint: string;
  deleteEndpoint?: string;
  sseEventType?: string;
  sseToItem?: (data: Record<string, unknown>) => T;
}

export function useInfiniteAdminTable<T extends { id: string }>(options: UseInfiniteAdminTableOptions<T>) {
  const { endpoint, deleteEndpoint, sseEventType, sseToItem } = options;

  const [reducer] = useState(() => makeReducer<T>());
  const [state, dispatch] = useReducer(reducer, { tag: "idle" } as TableState<T>);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editMode, setEditMode] = useState(false);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery, sortBy and sortDir are intentional triggers to reset selection when filter/sort params change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, sortBy, sortDir]);

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

  // Fetch
  const fetchFirstPage = useCallback(
    (stale?: T[]) => {
      dispatch({ type: "RESET", stale });
      const params = new URLSearchParams();
      params.set("page", "1");
      params.set("limit", String(PAGE_SIZE));
      if (searchQuery) params.set("q", searchQuery);
      if (sortBy) params.set("sortBy", sortBy);
      if (sortDir) params.set("sortDir", sortDir);
      api
        .get<Page<T>>(`${endpoint}?${params}`)
        .then((data) => dispatch({ type: "FIRST_PAGE", items: data.items, total: data.total }))
        .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
    },
    [endpoint, searchQuery, sortBy, sortDir],
  );

  const loadMore = useCallback(() => {
    const s = stateRef.current;
    if (s.tag !== "ready" || !s.hasMore) return;
    dispatch({ type: "LOAD_MORE" });
    const params = new URLSearchParams();
    params.set("page", String(s.nextPage));
    params.set("limit", String(PAGE_SIZE));
    if (searchQuery) params.set("q", searchQuery);
    if (sortBy) params.set("sortBy", sortBy);
    if (sortDir) params.set("sortDir", sortDir);
    api
      .get<Page<T>>(`${endpoint}?${params}`)
      .then((data) => dispatch({ type: "MORE_LOADED", items: data.items, total: data.total }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [endpoint, searchQuery, sortBy, sortDir]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const fetchFirstPageRef = useRef(fetchFirstPage);
  fetchFirstPageRef.current = fetchFirstPage;

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery, sortBy and sortDir are intentional triggers to re-fetch when filter/sort params change, even though they are accessed via refs inside the effect body.
  useEffect(() => {
    const s = stateRef.current;
    const stale = s.tag === "ready" || s.tag === "loading-more" ? s.items : undefined;
    fetchFirstPageRef.current(stale);
  }, [searchQuery, sortBy, sortDir]);

  // Infinite scroll
  const canLoadMore = state.tag === "ready" && state.hasMore;
  useEffect(() => {
    if (!canLoadMore) return;
    const sentinel = sentinelRef.current;
    const container = scrollContainerRef.current;
    if (!sentinel || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMoreRef.current();
      },
      { root: container, rootMargin: "0px 0px 400px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore]);

  // SSE
  useAdminSSE(
    useCallback(
      (event) => {
        if (!sseEventType || !sseToItem || event.type !== sseEventType || searchQuery !== "" || sortBy !== null) return;
        const item = sseToItem(event.data);
        if (!item || typeof item !== "object" || !("id" in item)) return;
        dispatch({ type: "PREPEND", item });
      },
      [searchQuery, sseEventType, sseToItem, sortBy],
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
    await api.delete(deleteEndpoint, { ids: [...toDelete] });
    setSelectedIds(new Set());
    setDeletingIds(toDelete);
    setTimeout(() => {
      dispatch({ type: "REMOVE_MANY", ids: toDelete });
      setDeletingIds(new Set());
    }, 300);
  }

  // Server-side sort handler
  function handleSort(key: string) {
    if (sortBy !== key) {
      setSortBy(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortBy(null);
      setSortDir(null);
    }
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
    sortBy,
    sortDir,
    handleSort,

    editMode,
    toggleEditMode,
    selectedIds,
    selectedCount: selectedIds.size,
    allSelected,
    toggleAll,
    toggleRow,
    deletingIds,
    deleteSelected,

    sentinelRef,
    scrollContainerRef,
  };
}
