export const TableSortDirectionValue = {
  Asc: "asc",
  Desc: "desc",
} as const;

export type TableSortDirection = (typeof TableSortDirectionValue)[keyof typeof TableSortDirectionValue] | null;

export function getTableSortAriaSort(direction: TableSortDirection) {
  if (direction === TableSortDirectionValue.Asc) return "ascending";
  if (direction === TableSortDirectionValue.Desc) return "descending";
  return "none";
}
