import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useReducer, useRef, useState } from "react";
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

type FetchState<T> =
  | { status: "loading" }
  | { status: "success"; data: PaginatedResponse<T> }
  | { status: "error"; message: string };

type Action<T> =
  | { type: "LOADING" }
  | { type: "SUCCESS"; data: PaginatedResponse<T> }
  | { type: "ERROR"; message: string }
  | { type: "PREPEND"; item: T };

/**
 * A single column definition for AdminDataTable.
 *
 * - `headerKey`   – i18n translation key for the column header.
 * - `headerLabel` – static label (takes precedence over headerKey).
 * - `className`   – Tailwind classes applied to both <TableHead> and <TableCell>.
 * - `sortKey`     – backend column name; if set, the header becomes a sort button.
 * - `render`      – renders the cell content for a given row item.
 */
export interface ColumnDef<T> {
  headerKey?: string;
  headerLabel?: string;
  className?: string;
  sortKey?: string;
  render: (item: T) => ReactNode;
}

/**
 * Configuration passed to AdminDataTable.
 * Define this as a module-level constant (or useMemo) so the reference stays
 * stable and avoids unnecessary re-fetches.
 */
export interface AdminTableConfig<T extends { id: string }> {
  /** API endpoint for listing, e.g. "/api/admin/tracks". */
  endpoint: string;
  /** If set, a delete column + bulk-delete button are added. */
  deleteEndpoint?: string;
  /** SSE event type that triggers a live prepend, e.g. "track-added". */
  sseEventType?: string;
  /** Maps the raw SSE event data to a list item. Required when sseEventType is set. */
  sseToItem?: (data: Record<string, unknown>) => T;
  /** i18n key for the search input placeholder. */
  searchPlaceholderKey: string;
  /** i18n key displayed next to the total count. */
  totalLabelKey: string;
  /** i18n key shown when the list is empty. */
  emptyKey: string;
  columns: ColumnDef<T>[];
}

const LIMIT = 100;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminDataTable<T extends { id: string }>({
  config,
}: {
  config: AdminTableConfig<T>;
}) {
  const t = useT();

  const [state, dispatch] = useReducer(
    (state: FetchState<T>, action: Action<T>): FetchState<T> => {
      switch (action.type) {
        case "LOADING":
          return { status: "loading" };
        case "SUCCESS":
          return { status: "success", data: action.data };
        case "ERROR":
          return { status: "error", message: action.message };
        case "PREPEND":
          if (state.status !== "success") return state;
          return {
            status: "success",
            data: {
              ...state.data,
              items: [action.item, ...state.data.items],
              total: state.data.total + 1,
            },
          };
      }
    },
    { status: "loading" },
  );

  const [page, setPage] = useState(1);
  const [inputValue, setInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Sorting
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc" | null>(null);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { sseEventType, sseToItem, endpoint } = config;

  // Live prepend: only on page 1, no search, no custom sort active
  useAdminSSE(
    useCallback(
      (event) => {
        if (
          !sseEventType ||
          !sseToItem ||
          event.type !== sseEventType ||
          page !== 1 ||
          searchQuery !== "" ||
          sortBy !== null
        )
          return;
        dispatch({ type: "PREPEND", item: sseToItem(event.data) });
      },
      [page, searchQuery, sseEventType, sseToItem, sortBy],
    ),
  );

  // Debounce search: apply after 400 ms, reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  // Clear selection on page/search/sort change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, searchQuery, sortBy, sortDir]);

  // Stable fetch function
  const fetchPage = useCallback(() => {
    dispatch({ type: "LOADING" });
    apiGet<PaginatedResponse<T>>(endpoint, {
      page,
      limit: LIMIT,
      q: searchQuery || undefined,
      sortBy: sortBy || undefined,
      sortDir: sortDir || undefined,
    })
      .then((data) => dispatch({ type: "SUCCESS", data }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [page, searchQuery, endpoint, sortBy, sortDir]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  const totalPages =
    state.status === "success" ? Math.ceil(state.data.total / LIMIT) : 0;

  // ---------------------------------------------------------------------------
  // Sort helpers
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
    setPage(1);
  }

  function SortIcon({ colKey }: { colKey: string }) {
    if (sortBy !== colKey)
      return <ArrowUpDown className="ml-1 inline h-3.5 w-3.5 opacity-35 group-hover:opacity-60" />;
    if (sortDir === "asc")
      return <ArrowUp className="ml-1 inline h-3.5 w-3.5" />;
    return <ArrowDown className="ml-1 inline h-3.5 w-3.5" />;
  }

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------

  const visibleItems = state.status === "success" ? state.data.items : [];
  const visibleIds = visibleItems.map((item) => item.id);
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

  // ---------------------------------------------------------------------------
  // Delete handler
  // ---------------------------------------------------------------------------

  async function handleConfirmDelete() {
    if (!config.deleteEndpoint) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete(config.deleteEndpoint, { ids: [...selectedIds] });
      setSelectedIds(new Set());
      setConfirmOpen(false);
      fetchPageRef.current();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const hasDelete = Boolean(config.deleteEndpoint);
  const colSpan = config.columns.length + (hasDelete ? 1 : 0);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3">
        <Input
          placeholder={t(config.searchPlaceholderKey)}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          className="max-w-sm"
        />
        {state.status === "success" && (
          <span className="text-sm text-muted-foreground">
            {state.data.total} {t(config.totalLabelKey)}
          </span>
        )}

        {/* Delete + Pagination – right side */}
        <div className="ml-auto flex items-center gap-2">
          {hasDelete && selectedCount > 0 && (
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

          {totalPages > 1 && (
            <>
              <span className="text-sm text-muted-foreground">
                {t("pagination.pageOf", {
                  page: String(page),
                  total: String(totalPages),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                {t("pagination.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t("pagination.next")}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Loading */}
      {state.status === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Error */}
      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {/* Table – fills remaining height, scrolls internally */}
      {state.status === "success" && (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                {hasDelete && (
                  <TableHead className="w-10">
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
              {state.data.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={colSpan}
                    className="py-10 text-center text-muted-foreground"
                  >
                    {t(config.emptyKey)}
                  </TableCell>
                </TableRow>
              ) : (
                state.data.items.map((item) => (
                  <TableRow
                    key={item.id}
                    data-state={selectedIds.has(item.id) ? "selected" : undefined}
                  >
                    {hasDelete && (
                      <TableCell className="w-10">
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
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("delete.confirm.title")}</DialogTitle>
            <DialogDescription>
              {t("delete.confirm.description", { count: String(selectedCount) })}
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              {t("delete.confirm.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? "…" : t("delete.confirm.action")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
