import type { ColumnDef } from "@musiccloud/dashboard-ui";

/**
 * The column of an admin music list that counts a row's service links, shared
 * by the tracks, albums and artist profiles.
 *
 * It is right-aligned because a reader compares the counts by size, and wide
 * enough for its heading on one line.
 *
 * @param header - The column heading.
 * @returns The column definition.
 */
export function linkCountColumn<T extends { linkCount: number }>(header: string): ColumnDef<T> {
  return {
    id: "links",
    header,
    className: "w-28 text-right",
    cell: (row) => (
      <span className="inline-block min-w-6 px-1.5 py-0.5 rounded text-xs font-medium text-center border border-[var(--ds-border)] text-[var(--ds-text)]">
        {row.linkCount}
      </span>
    ),
  };
}
