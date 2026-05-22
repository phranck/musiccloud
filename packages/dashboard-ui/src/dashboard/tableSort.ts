export type TableSortDirection = "asc" | "desc" | null;

export function getTableSortAriaSort(direction: TableSortDirection) {
  if (direction === "asc") return "ascending";
  if (direction === "desc") return "descending";
  return "none";
}
