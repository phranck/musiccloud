import type { SortState } from "@musiccloud/dashboard-ui";
import { type ColumnDef, DataTable, DataTableState } from "@musiccloud/dashboard-ui";
import { SpinnerGap as SpinnerGapIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ContentLoadingView } from "@/components/ui/ContentLoadingView";
import type { InfiniteAdminTable as InfiniteAdminTableResult } from "@/features/music/hooks/useInfiniteAdminTable";

interface InfiniteAdminTableProps<T extends { id: string }> {
  /** The list state, as returned by `useInfiniteAdminTable`. */
  table: InfiniteAdminTableResult<T>;
  columns: ColumnDef<T>[];
  defaultSort?: SortState | null;
  /**
   * The slots this list shows, which in practice is an
   * `InfiniteAdminTable.Empty` holding whatever belongs on screen once the
   * list is known to be empty.
   */
  children: ReactNode;
}

/**
 * Renders a paged admin list, so the tracks, albums and artists pages, from
 * the state `useInfiniteAdminTable` holds.
 *
 * It exists because those three pages differ only in their columns and in
 * their empty state. Everything else, meaning which state is on screen, how a
 * selected or departing row is marked, and where the infinite-scroll sentinel
 * sits, is the same on all three and lives here once.
 *
 * The scroll port is the outlet card rather than this element, because the
 * dashboard leaves the height chain open below it. That is also what lets the
 * sticky header hold: a scroll port here would grow with the table, never
 * scroll, and take the header with the rows.
 *
 * @param table - The list state driving every slot.
 * @param columns - The columns, which is the part each page brings itself.
 * @param defaultSort - The sort applied before any header is clicked.
 * @param children - The empty state, as an `InfiniteAdminTable.Empty`.
 */
export function InfiniteAdminTable<T extends { id: string }>({
  table,
  columns,
  defaultSort = null,
  children,
}: InfiniteAdminTableProps<T>) {
  const state = table.isInitialLoading
    ? DataTableState.Loading
    : table.isError
      ? DataTableState.Error
      : table.items.length === 0
        ? DataTableState.Empty
        : DataTableState.Ready;

  return (
    <DataTable
      columns={columns}
      data={table.items}
      getRowKey={(row) => row.id}
      getRowClassName={(row) =>
        [
          table.selectedIds.has(row.id) ? "bg-[var(--ds-accent-subtle)]" : "",
          table.deletingIds.has(row.id) ? "opacity-0 transition-opacity duration-300" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
      defaultSort={defaultSort}
      state={state}
      errorMessage={table.errorMessage}
    >
      <DataTable.Loading>
        <ContentLoadingView className="flex-1 min-h-0" />
      </DataTable.Loading>

      <DataTable.Error />

      {children}

      <DataTable.Viewport
        className={`-mx-3 -mt-3 min-h-0 flex-1 transition-opacity duration-200 ${
          table.isRefreshing ? "opacity-50" : "opacity-100"
        }`}
      >
        <DataTable.Head sticky />
        <DataTable.Rows />
        <DataTable.Footer>
          <div ref={table.sentinelRef} className="h-px" />
          {table.isLoadingMore && (
            <div className="flex justify-center py-4">
              <SpinnerGapIcon className="w-5 h-5 animate-spin text-[var(--ds-text-muted)]" />
            </div>
          )}
        </DataTable.Footer>
      </DataTable.Viewport>
    </DataTable>
  );
}

InfiniteAdminTable.Empty = DataTable.Empty;
