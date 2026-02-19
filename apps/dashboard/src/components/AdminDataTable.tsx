import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pencil, PencilOff, Trash2 } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { apiDelete, apiGet } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Page<T> {
  items: T[];
  total: number;
}

/**
 * State machine for infinite-scroll table data.
 *
 *  idle → loading-first → ready ⇄ loading-more
 *                       ↘ error
 */
type TableState<T> =
  | { tag: "idle" }
  | { tag: "loading-first"; stale?: T[] }    // initial load; stale = old rows to show during sort/search reset
  | { tag: "ready"; items: T[]; total: number; nextPage: number; hasMore: boolean }
  | { tag: "loading-more"; items: T[]; total: number; nextPage: number; hasMore: boolean }
  | { tag: "error"; message: string };

type TableAction<T> =
  | { type: "RESET"; stale?: T[] }
  | { type: "FIRST_PAGE"; items: T[]; total: number }
  | { type: "LOAD_MORE" }
  | { type: "MORE_LOADED"; items: T[]; total: number }
  | { type: "REMOVE_MANY"; ids: Set<string> }
  | { type: "PREPEND"; item: T }
  | { type: "ERROR"; message: string };

function makeReducer<T>() {
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
        return { tag: "loading-more", items: state.items, total: state.total, nextPage: state.nextPage, hasMore: state.hasMore };

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

/**
 * A single column definition for AdminDataTable.
 */
export interface ColumnDef<T> {
  headerKey?: string;
  headerLabel?: string;
  className?: string;
  /** Backend column name; if set, the header becomes a sort button. */
  sortKey?: string;
  render: (item: T) => ReactNode;
}

/**
 * Configuration passed to AdminDataTable.
 * Define as a module-level constant so the reference stays stable.
 */
export interface AdminTableConfig<T extends { id: string }> {
  endpoint: string;
  deleteEndpoint?: string;
  sseEventType?: string;
  sseToItem?: (data: Record<string, unknown>) => T;
  searchPlaceholderKey: string;
  totalLabelKey: string;
  emptyKey: string;
  columns: ColumnDef<T>[];
}

const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDataTable<T extends { id: string }>({
  config,
}: {
  config: AdminTableConfig<T>;
}) {
  const t = useT();

  // Stable reducer (generic – created once per mount)
  const [reducer] = useState(() => makeReducer<T>());
  const [state, dispatch] = useReducer(reducer, { tag: "idle" } as TableState<T>);

  // Search (debounced)
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  // Edit mode (toggles checkbox column)
  const [editMode, setEditMode] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Refs for infinite scroll
  const tableWrapperRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Track whether more data can be loaded (used as IntersectionObserver dep)
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
      apiGet<Page<T>>(endpoint, {
        page: 1,
        limit: PAGE_SIZE,
        q: searchQuery || undefined,
        sortBy: sortBy || undefined,
        sortDir: sortDir || undefined,
      })
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
    apiGet<Page<T>>(endpoint, {
      page: nextPage,
      limit: PAGE_SIZE,
      q: searchQuery || undefined,
      sortBy: sortBy || undefined,
      sortDir: sortDir || undefined,
    })
      .then((data) => dispatch({ type: "MORE_LOADED", items: data.items, total: data.total }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [endpoint, searchQuery, sortBy, sortDir]);

  // Keep ref current so the IntersectionObserver always calls the latest version
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const fetchFirstPageRef = useRef(fetchFirstPage);
  fetchFirstPageRef.current = fetchFirstPage;

  // ---------------------------------------------------------------------------
  // Trigger first-page fetch on search/sort/endpoint changes
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const stale =
      stateRef.current.tag === "ready" || stateRef.current.tag === "loading-more"
        ? stateRef.current.items
        : undefined;
    fetchFirstPageRef.current(stale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy, sortDir, endpoint]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(inputValue), 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Clear selection when search/sort changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [searchQuery, sortBy, sortDir]);

  // ESC exits edit mode
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
  // Infinite scroll – IntersectionObserver
  // Runs only when canLoadMore changes (ready+hasMore → loading-more → ready).
  // rootMargin of 400px triggers the load before the sentinel is fully in view
  // so rows are preloaded before the user reaches the bottom.
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
        if (
          !sseEventType ||
          !sseToItem ||
          event.type !== sseEventType ||
          searchQuery !== "" ||
          sortBy !== null
        )
          return;
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

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortBy !== colKey)
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-35 group-hover:opacity-60" />;
    if (sortDir === "asc") return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
    return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  const currentItems =
    state.tag === "ready" || state.tag === "loading-more" ? state.items : [];
  const visibleIds = currentItems.map((item) => item.id);
  const selectedCount = selectedIds.size;
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selectedIds.has(id));

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
    setEditMode((m) => !m);
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
      await apiDelete(config.deleteEndpoint, { ids: [...toDelete] });
      setSelectedIds(new Set());
      setConfirmOpen(false);
      // Fade rows out, then remove from state (no refetch needed)
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

  // Items to display: from ready/loading-more state, or stale items during reset
  const displayItems: T[] =
    state.tag === "ready" || state.tag === "loading-more"
      ? state.items
      : state.tag === "loading-first" && state.stale
        ? state.stale
        : [];

  const total =
    state.tag === "ready" || state.tag === "loading-more" ? state.total : null;

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
        <Input
          placeholder={t(config.searchPlaceholderKey)}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="max-w-sm"
        />
        {total !== null && (
          <span className="text-sm text-muted-foreground">
            {total} {t(config.totalLabelKey)}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {/* Delete button – only in edit mode with selection */}
          {hasDelete && editMode && selectedCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setDeleteError(null);
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              {t("delete.button", { count: String(selectedCount) })}
            </Button>
          )}

          {/* Edit toggle */}
          {hasDelete && (
            <Button
              variant={editMode ? "default" : "outline"}
              size="sm"
              onClick={handleEditToggle}
            >
              {editMode ? <PencilOff className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {t("edit.button")}
            </Button>
          )}
        </div>
      </div>

      {/* Initial loading skeletons */}
      {isInitialLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {state.tag === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {/* Table – fills remaining height, internal scroll */}
      {!isInitialLoading && state.tag !== "error" && (
        <div
          ref={tableWrapperRef}
          className={cn(
            // overflow-x-visible overrides the Table component's inner div (overflow-x-auto)
          // so that position:sticky on <thead> works relative to this scroll container.
          "min-h-0 flex-1 overflow-y-auto rounded-md border transition-opacity duration-200",
          "[&_[data-slot='table-container']]:overflow-x-visible",
            isRefreshing ? "opacity-50" : "opacity-100",
          )}
        >
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {/* Checkbox column – animates in/out with edit mode */}
                {hasDelete && (
                  <TableHead
                    className={cn(
                      "overflow-hidden transition-all duration-200",
                      editMode ? "w-10 opacity-100" : "w-0 max-w-0 p-0 opacity-0",
                    )}
                  >
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                {config.columns.map((col, i) => (
                  <TableHead key={i} className={col.className}>
                    {col.sortKey ? (
                      <button
                        className="group inline-flex cursor-pointer items-center whitespace-nowrap hover:text-foreground"
                        onClick={() => handleSortClick(col.sortKey!)}
                      >
                        {col.headerLabel ?? (col.headerKey ? t(col.headerKey) : null)}
                        <SortIcon colKey={col.sortKey} />
                      </button>
                    ) : (
                      (col.headerLabel ?? (col.headerKey ? t(col.headerKey) : null))
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr]:border-0">
              {displayItems.length === 0 && !isRefreshing ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t(config.emptyKey)}
                  </TableCell>
                </TableRow>
              ) : (
                displayItems.map((item) => (
                  <TableRow
                    key={item.id}
                    data-state={selectedIds.has(item.id) ? "selected" : undefined}
                    style={{
                      opacity: deletingIds.has(item.id) ? 0 : 1,
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    {hasDelete && (
                      <TableCell
                        className={cn(
                          "overflow-hidden transition-all duration-200",
                          editMode ? "w-10 opacity-100" : "w-0 max-w-0 p-0 opacity-0",
                        )}
                      >
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleRow(item.id)}
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    {config.columns.map((col, i) => (
                      <TableCell key={i} className={col.className}>
                        {col.render(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Infinite scroll sentinel + loading indicator */}
          <div ref={sentinelRef} className="h-px" />
          {isLoadingMore && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.confirm.title")}</DialogTitle>
            <DialogDescription>
              {t("delete.confirm.description", { count: String(selectedCount) })}
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              {t("delete.confirm.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
              {deleting ? "…" : t("delete.confirm.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
