import {
  ArrowDown as ArrowDownIcon,
  ArrowsDownUp as ArrowsDownUpIcon,
  ArrowUp as ArrowUpIcon,
  PencilSimple as PencilSimpleIcon,
  PencilSimpleSlash as PencilSimpleSlashIcon,
  SpinnerGap as SpinnerGapIcon,
  Trash as TrashIcon,
} from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from "react";

import { useI18n } from "@/context/I18nContext";
import { useAdminSSE } from "@/features/music/hooks/useAdminSSE";
import { api } from "@/lib/api";
import { Checkbox } from "@/shared/ui/Checkbox";
import { Dialog, dialogBtnDestructive, dialogBtnSecondary } from "@/shared/ui/Dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
        return {
          tag: "ready",
          items: merged,
          total: action.total,
          nextPage: state.nextPage + 1,
          hasMore: merged.length < action.total,
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ColumnDef<T> {
  header?: string;
  className?: string;
  sortKey?: string;
  render: (item: T) => ReactNode;
}

export interface AdminTableConfig<T extends { id: string }> {
  endpoint: string;
  deleteEndpoint?: string;
  sseEventType?: string;
  sseToItem?: (data: Record<string, unknown>) => T;
  searchPlaceholder: string;
  totalLabel: string;
  emptyMessage: string;
  columns: ColumnDef<T>[];
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDataTable<T extends { id: string }>({ config }: { config: AdminTableConfig<T> }) {
  const { messages } = useI18n();
  const m = messages.music.table;

  const [reducer] = useState(() => makeReducer<T>());
  const [state, dispatch] = useReducer(reducer, { tag: "idle" } as TableState<T>);

  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  const [editMode, setEditMode] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const canLoadMore = state.tag === "ready" && state.hasMore;
  const stateRef = useRef(state);
  stateRef.current = state;

  const { sseEventType, sseToItem, endpoint } = config;

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

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
    const nextPage = s.nextPage;
    dispatch({ type: "LOAD_MORE" });

    const params = new URLSearchParams();
    params.set("page", String(nextPage));
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

  // ---------------------------------------------------------------------------
  // Trigger first-page fetch
  // ---------------------------------------------------------------------------

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery, sortBy and sortDir are intentional triggers to re-fetch when filter/sort params change, even though they are not read inside the effect body (accessed via refs).
  useEffect(() => {
    const stale =
      stateRef.current.tag === "ready" || stateRef.current.tag === "loading-more" ? stateRef.current.items : undefined;
    fetchFirstPageRef.current(stale);
  }, [searchQuery, sortBy, sortDir]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(inputValue), 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: searchQuery, sortBy and sortDir are intentional triggers to reset selection when filter/sort params change.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, sortBy, sortDir]);

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

  // ---------------------------------------------------------------------------
  // Infinite scroll
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!canLoadMore) return;
    const sentinel = sentinelRef.current;
    const wrapper = tableWrapperRef.current;
    if (!sentinel || !wrapper) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreRef.current();
        }
      },
      { root: wrapper, rootMargin: "0px 0px 400px 0px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [canLoadMore]);

  // ---------------------------------------------------------------------------
  // SSE live prepend
  // ---------------------------------------------------------------------------

  useAdminSSE(
    useCallback(
      (event) => {
        if (!sseEventType || !sseToItem || event.type !== sseEventType || searchQuery !== "" || sortBy !== null) return;
        dispatch({ type: "PREPEND", item: sseToItem(event.data) });
      },
      [searchQuery, sseEventType, sseToItem, sortBy],
    ),
  );

  // ---------------------------------------------------------------------------
  // Sort
  // ---------------------------------------------------------------------------

  function handleSortClick(key: string) {
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

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const currentItems = state.tag === "ready" || state.tag === "loading-more" ? state.items : [];
  const visibleIds = currentItems.map((item) => item.id);
  const selectedCount = selectedIds.size;
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

  function handleEditToggle() {
    setEditMode((prev) => !prev);
    if (editMode) setSelectedIds(new Set());
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleConfirmDelete() {
    if (!config.deleteEndpoint) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const toDelete = new Set(selectedIds);
      await api.delete(config.deleteEndpoint, { ids: [...toDelete] });
      setSelectedIds(new Set());
      setConfirmOpen(false);
      setDeletingIds(toDelete);
      setTimeout(() => {
        dispatch({ type: "REMOVE_MANY", ids: toDelete });
        setDeletingIds(new Set());
      }, 300);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Derived display values
  // ---------------------------------------------------------------------------

  const hasDelete = Boolean(config.deleteEndpoint);
  const colSpan = config.columns.length + (hasDelete && editMode ? 1 : 0);

  const displayItems: T[] =
    state.tag === "ready" || state.tag === "loading-more"
      ? state.items
      : state.tag === "loading-first" && state.stale
        ? state.stale
        : [];

  const total = state.tag === "ready" || state.tag === "loading-more" ? state.total : null;

  const isInitialLoading = state.tag === "idle" || (state.tag === "loading-first" && !state.stale);
  const isRefreshing = state.tag === "loading-first" && Boolean(state.stale);
  const isLoadingMore = state.tag === "loading-more";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3">
        <input
          type="text"
          placeholder={config.searchPlaceholder}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="h-9 max-w-sm w-full rounded-md border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-muted)] outline-none focus:border-[var(--ds-border-strong)] transition-colors"
        />
        {total !== null && (
          <span className="text-sm text-[var(--ds-text-muted)]">
            {total} {config.totalLabel}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {hasDelete && editMode && selectedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium bg-[var(--ds-btn-danger-bg)] text-[var(--ds-btn-danger-text)] border border-[var(--ds-btn-danger-border)] hover:bg-[var(--ds-btn-danger-hover-bg)] transition-colors"
            >
              <TrashIcon className="w-4 h-4" />
              {m.deleteButton.replace("{count}", String(selectedCount))}
            </button>
          )}

          {hasDelete && (
            <button
              type="button"
              onClick={handleEditToggle}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium border transition-colors ${
                editMode
                  ? "bg-[var(--ds-btn-primary-bg)] text-white border-[var(--ds-btn-primary-bg)]"
                  : "bg-transparent text-[var(--ds-text)] border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]"
              }`}
            >
              {editMode ? <PencilSimpleSlashIcon className="w-4 h-4" /> : <PencilSimpleIcon className="w-4 h-4" />}
              {m.editButton}
            </button>
          )}
        </div>
      </div>

      {/* Initial loading skeletons */}
      {isInitialLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
            <div key={key} className="h-12 w-full rounded-md bg-[var(--ds-surface-raised)] animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {state.tag === "error" && <p className="text-sm text-[var(--ds-btn-danger-text)]">{state.message}</p>}

      {/* Table */}
      {!isInitialLoading && state.tag !== "error" && (
        <div
          ref={tableWrapperRef}
          className={`min-h-0 flex-1 overflow-y-auto rounded-md border border-[var(--ds-border)] transition-opacity duration-200 ${
            isRefreshing ? "opacity-50" : "opacity-100"
          }`}
        >
          <table className="w-full text-sm">
            <thead className="bg-[var(--ds-surface-inset)] sticky top-0 z-10">
              <tr>
                {hasDelete && (
                  <th
                    className={`overflow-hidden transition-all duration-200 ${
                      editMode ? "w-10 px-3 py-2 opacity-100" : "w-0 max-w-0 p-0 opacity-0"
                    }`}
                  >
                    <Checkbox checked={allSelected} onChange={toggleAll} />
                  </th>
                )}
                {config.columns.map((col, i) => {
                  const key = col.sortKey ?? col.header ?? `col-${i}`;
                  return (
                    <th
                      key={key}
                      className={`px-3 py-2 text-left text-xs font-medium text-[var(--ds-text-muted)] ${col.className ?? ""}`}
                    >
                      {col.sortKey ? (
                        <button
                          type="button"
                          className="group inline-flex cursor-pointer items-center whitespace-nowrap hover:text-[var(--ds-text)]"
                          onClick={() => handleSortClick(col.sortKey!)}
                        >
                          {col.header}
                          <SortIcon colKey={col.sortKey} sortBy={sortBy} sortDir={sortDir} />
                        </button>
                      ) : (
                        col.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayItems.length === 0 && !isRefreshing ? (
                <tr>
                  <td colSpan={colSpan} className="py-10 text-center text-[var(--ds-text-muted)]">
                    {config.emptyMessage}
                  </td>
                </tr>
              ) : (
                displayItems.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-t border-[var(--ds-border)] hover:bg-[var(--ds-surface-raised)] transition-colors ${
                      selectedIds.has(item.id) ? "bg-[var(--ds-accent-subtle)]" : ""
                    }`}
                    style={{
                      opacity: deletingIds.has(item.id) ? 0 : 1,
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    {hasDelete && (
                      <td
                        className={`overflow-hidden transition-all duration-200 ${
                          editMode ? "w-10 px-3 py-2 opacity-100" : "w-0 max-w-0 p-0 opacity-0"
                        }`}
                      >
                        <Checkbox checked={selectedIds.has(item.id)} onChange={() => toggleRow(item.id)} />
                      </td>
                    )}
                    {config.columns.map((col, i) => {
                      const key = col.sortKey ?? col.header ?? `col-${i}`;
                      return (
                        <td key={key} className={`px-3 py-2 ${col.className ?? ""}`}>
                          {col.render(item)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div ref={sentinelRef} className="h-px" />
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <SpinnerGapIcon className="w-5 h-5 animate-spin text-[var(--ds-text-muted)]" />
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={confirmOpen} title={m.deleteConfirmTitle} onClose={() => setConfirmOpen(false)}>
        <div className="px-6 py-4 space-y-3">
          <p className="text-sm text-[var(--ds-text)]">
            {m.deleteConfirmDescription.replace("{count}", String(selectedCount))}
          </p>
          {deleteError && <p className="text-sm text-[var(--ds-btn-danger-text)]">{deleteError}</p>}
        </div>
        <Dialog.Footer>
          <button
            type="button"
            className={dialogBtnSecondary}
            onClick={() => setConfirmOpen(false)}
            disabled={deleting}
          >
            {m.deleteConfirmCancel}
          </button>
          <button type="button" className={dialogBtnDestructive} onClick={handleConfirmDelete} disabled={deleting}>
            {deleting ? "\u2026" : m.deleteConfirmAction}
          </button>
        </Dialog.Footer>
      </Dialog>
    </div>
  );
}

function SortIcon({
  colKey,
  sortBy,
  sortDir,
}: {
  colKey: string;
  sortBy: string | null;
  sortDir: "asc" | "desc" | null;
}) {
  if (sortBy !== colKey)
    return <ArrowsDownUpIcon className="ml-1 inline w-3.5 h-3.5 opacity-35 group-hover:opacity-60" />;
  if (sortDir === "asc") return <ArrowUpIcon className="ml-1 inline w-3.5 h-3.5" />;
  return <ArrowDownIcon className="ml-1 inline w-3.5 h-3.5" />;
}
