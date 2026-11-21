import type { ColumnDef } from "@musiccloud/dashboard-ui";
import { PencilSimpleIcon, TrashIcon } from "@phosphor-icons/react";

import { TableActionButton } from "@/components/ui/TableActionButton";
import { dashboardCopy } from "@/copy/dashboard";

/**
 * The width of the column holding the Edit and Remove buttons.
 *
 * The table lays out with `table-fixed`, so the column gets exactly this width
 * and anything wider runs into the column to its left. The two labelled buttons
 * need about 160px side by side, plus the cell's 32px of horizontal padding.
 * `w-56` is 224px and leaves room for that.
 */
const EDIT_REMOVE_COLUMN_WIDTH_CLASS = "w-56";

/**
 * The last column of a sponsoring ledger: an Edit and a Remove button per row,
 * right-aligned.
 *
 * @param onEdit - Opens the edit card for the row.
 * @param onRemove - Asks before removing the row.
 * @returns The column definition, with the id `actions` and no header.
 */
export function editRemoveColumn<T>(onEdit: (row: T) => void, onRemove: (row: T) => void): ColumnDef<T> {
  return {
    id: "actions",
    className: EDIT_REMOVE_COLUMN_WIDTH_CLASS,
    cell: (row) => (
      <div className="flex justify-end gap-1">
        <TableActionButton
          onClick={() => onEdit(row)}
          icon={<PencilSimpleIcon weight="duotone" className="size-3" />}
          label={dashboardCopy.common.edit}
        />
        <TableActionButton
          onClick={() => onRemove(row)}
          icon={<TrashIcon weight="duotone" className="size-3" />}
          label={dashboardCopy.common.remove}
        />
      </div>
    ),
  };
}
