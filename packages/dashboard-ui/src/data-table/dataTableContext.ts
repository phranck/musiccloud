import {
  type ComponentType,
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useContext,
} from "react";
import type { SortState } from "../dashboard/tableSort.js";

/**
 * Which of the four mutually exclusive things a table is showing. Every state
 * slot reads this to decide whether it renders, so the call site does not
 * repeat the conditions around each one.
 */
export const DataTableState = {
  Loading: "loading",
  Error: "error",
  Empty: "empty",
  Ready: "ready",
} as const;

export type DataTableState = (typeof DataTableState)[keyof typeof DataTableState];

/**
 * Which element scrolls the table.
 *
 * `Self` makes the viewport the scroll port, which needs an ancestor that caps
 * its height. `Ancestor` leaves both axes to the nearest scrolling ancestor,
 * which is what the outlet card does on pages that do not cap their height.
 */
export const DataTableScroll = {
  Self: "self",
  Ancestor: "ancestor",
} as const;

export type DataTableScroll = (typeof DataTableScroll)[keyof typeof DataTableScroll];

/** How one column renders, sorts and is addressed. */
export interface ColumnDef<T> {
  id: string;
  header?: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
  /**
   * The value the table sorts this column on in the browser. Read only while
   * the table holds its own sort, and a column without it has no sort control
   * there.
   */
  sortKey?: (row: T) => string | number;
  /**
   * The name the server sorts this column under, sent as `sortBy`. Read only
   * while the caller holds the sort through `onSortChange`, and a column
   * without it has no sort control there, because a sort over the loaded rows
   * alone would not be the order of the whole list.
   */
  serverSort?: string;
  /**
   * Whether the list can do without this column when it is narrow. A secondary
   * column shows only while the table itself is wide enough, measured by
   * `useShowsSecondaryColumns`, so the column a list is about keeps its room in
   * a narrow window or a half-width section.
   */
  secondary?: boolean;
}

/**
 * What a row component receives. A custom one owns its own hook lifecycle, for
 * instance a sortable wrapper around `useSortable`, and must render something
 * that is a `<tr>` in the table layout.
 */
export interface DataTableRowProps<T> {
  row: T;
  rowKey: string | number;
  className?: string;
  children: ReactNode;
}

/** Everything the slots need in order to render themselves. */
export interface DataTableContextValue<T> {
  columns: ColumnDef<T>[];
  /** The rows in the order they render, so after sorting. */
  rows: T[];
  getRowKey: (row: T) => string | number;
  getRowClassName?: (row: T) => string;
  sort: SortState | null;
  /** The ids of the columns whose header carries a sort control. */
  sortableColumnIds: ReadonlySet<string>;
  toggleSort: (columnId: string) => void;
  columnWidths: Record<string, number>;
  startResize: (event: ReactMouseEvent, leftColumnIndex: number) => void;
  state: DataTableState;
  errorMessage?: string | null;
  RowComponent: ComponentType<DataTableRowProps<T>>;
  /** Receives the element the table renders into, which decides whether secondary columns show. */
  viewportRef: (element: HTMLDivElement | null) => void;
}

/**
 * Carries the value as `unknown` because a context cannot be generic. The row
 * type is restored in {@link useDataTable}, which is the only way the slots
 * read it.
 */
const DataTableContext = createContext<DataTableContextValue<unknown> | null>(null);

export const DataTableContextProvider = DataTableContext.Provider;

/**
 * Reads the surrounding table.
 *
 * @typeParam T - The row type, which the caller states and the table root
 *   guarantees, since it is the only thing that ever provides this context.
 * @returns The table's columns, rows and interaction handlers.
 * @throws When called outside a `DataTable`, because a slot rendered on its
 *   own has no table to describe and would otherwise fail further downstream.
 */
export function useDataTable<T>(): DataTableContextValue<T> {
  const value = useContext(DataTableContext);
  if (!value) {
    throw new Error("DataTable slots must be rendered inside a <DataTable>.");
  }
  return value as DataTableContextValue<T>;
}
