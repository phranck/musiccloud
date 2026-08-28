import { getTableSortAriaSort, TableSortHeader } from "@musiccloud/dashboard-ui";
import { type ComponentType, type HTMLAttributes, type ReactNode, useCallback, useMemo } from "react";

import {
  type ColumnDef,
  DataTableContextProvider,
  type DataTableContextValue,
  type DataTableRowProps,
  DataTableScroll,
  DataTableState,
  useDataTable,
} from "@/components/ui/dataTableContext";
import { useColumnWidths } from "@/lib/hooks/useColumnWidths";
import { type SortState, useTableSort } from "@/lib/hooks/useTableSort";

export type { ColumnDef, DataTableRowProps } from "@/components/ui/dataTableContext";
export { DataTableScroll, DataTableState } from "@/components/ui/dataTableContext";

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  getRowKey: (row: T) => string | number;
  getRowClassName?: (row: T) => string;
  /** Which column the table sorts by before anybody clicks a header. */
  defaultSort?: SortState | null;
  /** Whether a third click on the same header returns the rows to their given order. */
  allowUnsorted?: boolean;
  /** Overrides the row element, for instance with a drag-and-drop wrapper. */
  RowComponent?: ComponentType<DataTableRowProps<T>>;
  /**
   * What the table is showing. Left out, it derives from the data, so an empty
   * array means the empty state and anything else means ready.
   */
  state?: DataTableState;
  /** The message `DataTable.Error` shows in the error state. */
  errorMessage?: string | null;
  children: ReactNode;
}

/**
 * The root of the table, which holds the data and hands it to its slots.
 *
 * It renders no markup of its own. Which of the children appear is decided by
 * the children themselves, because each state slot reads {@link DataTableState}
 * from the context. A call site therefore lists the states it cares about and
 * leaves out the rest, rather than guarding every one of them by hand.
 *
 * @param columns - The columns, in render order. Their ids key both the sort
 *   state and the stored widths.
 * @param data - The rows in their given order, before sorting.
 * @param getRowKey - Returns the React key of a row.
 * @param getRowClassName - Returns extra classes for a row, for selection or
 *   for a row on its way out.
 * @param defaultSort - The sort applied before any header is clicked.
 * @param allowUnsorted - Whether the sort cycle includes the unsorted step.
 * @param RowComponent - Replaces the default row element.
 * @param state - What the table is showing, if the caller tracks loading and
 *   errors itself.
 * @param errorMessage - The message shown in the error state.
 */
export function DataTable<T>({
  columns,
  data,
  getRowKey,
  getRowClassName,
  defaultSort = null,
  allowUnsorted = true,
  RowComponent,
  state,
  errorMessage,
  children,
}: DataTableProps<T>) {
  const columnIds = useMemo(() => columns.map((column) => column.id), [columns]);
  const { columnWidths, startResize } = useColumnWidths(columnIds);

  const getSortKey = useCallback(
    (columnId: string) => columns.find((column) => column.id === columnId)?.sortKey,
    [columns],
  );
  const { sort, toggleSort, sortedRows } = useTableSort({ rows: data, defaultSort, allowUnsorted, getSortKey });

  const resolvedState = state ?? (data.length === 0 ? DataTableState.Empty : DataTableState.Ready);

  const value = useMemo<DataTableContextValue<T>>(
    () => ({
      columns,
      rows: sortedRows,
      getRowKey,
      getRowClassName,
      sort,
      toggleSort,
      columnWidths,
      startResize,
      state: resolvedState,
      errorMessage,
      RowComponent: RowComponent ?? DefaultRow,
    }),
    [
      columns,
      sortedRows,
      getRowKey,
      getRowClassName,
      sort,
      toggleSort,
      columnWidths,
      startResize,
      resolvedState,
      errorMessage,
      RowComponent,
    ],
  );

  return (
    <DataTableContextProvider value={value as DataTableContextValue<unknown>}>{children}</DataTableContextProvider>
  );
}

function DefaultRow<T>({ className = "", children }: DataTableRowProps<T>) {
  return <tr className={`table-row-hover ${className}`}>{children}</tr>;
}

/* ---- DataTable.Loading -------------------------------------------- */

/**
 * Shows its children whilst the table is loading. Renders nothing in every
 * other state, so the caller does not repeat the condition.
 */
function DataTableLoading({ children }: { children: ReactNode }) {
  const { state } = useDataTable();
  if (state !== DataTableState.Loading) return null;
  return <>{children}</>;
}

/* ---- DataTable.Error ---------------------------------------------- */

/**
 * Shows the error the table was given. Children replace the default rendering
 * where a page needs more than the message.
 */
function DataTableError({ children }: { children?: ReactNode }) {
  const { state, errorMessage } = useDataTable();
  if (state !== DataTableState.Error) return null;
  if (children) return <>{children}</>;
  return <p className="text-sm text-[var(--ds-danger-text)] p-4">{errorMessage}</p>;
}

/* ---- DataTable.Empty ---------------------------------------------- */

/** Shows its children when the table has no rows to show. */
function DataTableEmpty({ children }: { children: ReactNode }) {
  const { state } = useDataTable();
  if (state !== DataTableState.Empty) return null;
  return <>{children}</>;
}

/* ---- DataTable.Viewport ------------------------------------------- */

interface DataTableViewportProps extends HTMLAttributes<HTMLDivElement> {
  scroll?: DataTableScroll;
}

/**
 * Holds the table element and, with `scroll="self"`, the scroll port.
 *
 * A sticky header anchors to the nearest scroll port, and a box with
 * `overflow-x: auto` computes `overflow-y` to `auto` as well. A viewport that
 * scrolls without capping its height therefore pins the header to something
 * that never moves, and the header leaves with the rows. That is why
 * `Ancestor` renders no overflow at all rather than only an axis.
 *
 * @param scroll - Whether this element scrolls or a surrounding one does.
 */
function DataTableViewport({ scroll = DataTableScroll.Ancestor, className = "", children }: DataTableViewportProps) {
  const { state } = useDataTable();
  if (state !== DataTableState.Ready) return null;

  const scrollClass = scroll === DataTableScroll.Self ? "min-h-0 flex-1 overflow-auto" : "";
  return (
    <div className={`${scrollClass} ${className}`.trim()}>
      <table className="w-full table-fixed border-collapse text-sm">{children}</table>
    </div>
  );
}

/* ---- DataTable.Head ----------------------------------------------- */

/**
 * The header row, carrying the sort control and the resize handle of each
 * column.
 *
 * @param sticky - Whether the header holds the top edge of the scroll port
 *   whilst the rows pass underneath.
 */
function DataTableHead({ sticky = false }: { sticky?: boolean }) {
  const { columns, sort, toggleSort, columnWidths, startResize } = useDataTable();

  return (
    <thead className={`text-left ${sticky ? "sticky top-0 z-10 shadow-[0_1px_0_var(--ds-border)]" : ""}`}>
      <tr className="hover:bg-transparent">
        {columns.map((column, index) => (
          <th
            key={column.id}
            aria-sort={column.sortKey ? getTableSortAriaSort(sort?.id === column.id ? sort.dir : null) : undefined}
            className={`section-header px-4 ${column.headerClassName ?? column.className ?? ""} ${
              column.sortKey ? "select-none" : ""
            }`}
            style={
              columnWidths[column.id]
                ? { width: columnWidths[column.id], minWidth: columnWidths[column.id] }
                : undefined
            }
          >
            <div className="relative -mx-1 px-1">
              {column.sortKey ? (
                <TableSortHeader
                  direction={sort?.id === column.id ? sort.dir : null}
                  onClick={() => toggleSort(column.id)}
                >
                  {column.header}
                </TableSortHeader>
              ) : (
                column.header
              )}
              {index < columns.length - 1 && (
                <>
                  <div
                    role="presentation"
                    onMouseDown={(event) => startResize(event, index)}
                    className="absolute top-0 right-[-6px] h-full w-3 cursor-col-resize z-20"
                    aria-hidden
                  />
                  <div className="absolute top-1/2 -translate-y-1/2 right-0 h-4 w-px bg-[var(--ds-border-strong)] opacity-0 pointer-events-none" />
                </>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

/* ---- DataTable.Rows ----------------------------------------------- */

/** The body, one row per entry, in the order the sort produced. */
function DataTableRows() {
  const { columns, rows, getRowKey, getRowClassName, columnWidths, RowComponent } = useDataTable();

  return (
    <tbody className="divide-y divide-[var(--ds-table-row-separator)] bg-[var(--ds-section-body-bg)]">
      {rows.map((row) => {
        const rowKey = getRowKey(row);
        return (
          <RowComponent key={rowKey} row={row} rowKey={rowKey} className={getRowClassName?.(row)}>
            {columns.map((column) => (
              <td
                key={column.id}
                className={`px-4 py-2 align-middle ${column.cellClassName ?? column.className ?? ""}`}
                style={
                  columnWidths[column.id]
                    ? { width: columnWidths[column.id], minWidth: columnWidths[column.id] }
                    : undefined
                }
              >
                {column.cell(row)}
              </td>
            ))}
          </RowComponent>
        );
      })}
    </tbody>
  );
}

/* ---- DataTable.Footer --------------------------------------------- */

/**
 * Sits below the rows and spans every column.
 *
 * It renders as a table foot rather than as a sibling of the table, because
 * the viewport owns the scroll port and anything placed outside the table
 * would sit outside it. An infinite-scroll sentinel therefore enters the same
 * scroll port the rows leave.
 */
function DataTableFooter({ children }: { children: ReactNode }) {
  const { state, columns } = useDataTable();
  if (state !== DataTableState.Ready) return null;

  return (
    <tfoot>
      <tr className="hover:bg-transparent">
        <td colSpan={columns.length}>{children}</td>
      </tr>
    </tfoot>
  );
}

DataTable.Loading = DataTableLoading;
DataTable.Error = DataTableError;
DataTable.Empty = DataTableEmpty;
DataTable.Viewport = DataTableViewport;
DataTable.Head = DataTableHead;
DataTable.Rows = DataTableRows;
DataTable.Footer = DataTableFooter;
