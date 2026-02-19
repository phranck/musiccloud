import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useReducer, useState } from "react";
import { useAdminSSE } from "@/hooks/useAdminSSE";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useT } from "@/i18n/context";
import { apiGet } from "@/lib/api";

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
 * - `render`      – renders the cell content for a given row item.
 */
export interface ColumnDef<T> {
  headerKey?: string;
  headerLabel?: string;
  className?: string;
  render: (item: T) => ReactNode;
}

/**
 * Configuration passed to AdminDataTable.
 * Define this as a module-level constant (or useMemo) so the reference stays
 * stable and avoids unnecessary re-fetches.
 */
export interface AdminTableConfig<T extends { id: string }> {
  /** API endpoint, e.g. "/api/admin/tracks". */
  endpoint: string;
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

const LIMIT = 20;

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

  const { sseEventType, sseToItem } = config;

  // Live prepend: only on page 1 and when no search is active
  useAdminSSE(
    useCallback(
      (event) => {
        if (
          !sseEventType ||
          !sseToItem ||
          event.type !== sseEventType ||
          page !== 1 ||
          searchQuery !== ""
        )
          return;
        dispatch({ type: "PREPEND", item: sseToItem(event.data) });
      },
      [page, searchQuery, sseEventType, sseToItem],
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

  const { endpoint } = config;

  useEffect(() => {
    dispatch({ type: "LOADING" });
    apiGet<PaginatedResponse<T>>(endpoint, {
      page,
      limit: LIMIT,
      q: searchQuery || undefined,
    })
      .then((data) => dispatch({ type: "SUCCESS", data }))
      .catch((err: Error) => dispatch({ type: "ERROR", message: err.message }));
  }, [page, searchQuery, endpoint]);

  const totalPages =
    state.status === "success" ? Math.ceil(state.data.total / LIMIT) : 0;

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
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
      </div>

      {state.status === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <p className="text-sm text-destructive">{state.message}</p>
      )}

      {state.status === "success" && (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  {config.columns.map((col, i) => (
                    <TableHead key={i} className={col.className}>
                      {col.headerLabel ?? (col.headerKey ? t(col.headerKey) : null)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={config.columns.length}
                      className="py-10 text-center text-muted-foreground"
                    >
                      {t(config.emptyKey)}
                    </TableCell>
                  </TableRow>
                ) : (
                  state.data.items.map((item) => (
                    <TableRow key={item.id}>
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

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {t("pagination.pageOf", {
                  page: String(page),
                  total: String(totalPages),
                })}
              </span>
              <div className="flex items-center gap-1">
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
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
