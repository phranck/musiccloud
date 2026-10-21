import type { DeleteRowOperation, RowValues } from "./manifest.js";
import { PlanFailure } from "./planning.js";

/**
 * Reads a text column that every row of its table has.
 *
 * @param row - A row read from the restored copy.
 * @param column - The column to read.
 * @returns The column's text.
 * @throws {PlanFailure} With `PLAN_ROW_MISSING` when the column is null, absent or not text.
 */
export function textOf(row: RowValues, column: string): string {
  const value = row[column];
  if (typeof value !== "string") throw new PlanFailure("PLAN_ROW_MISSING");
  return value;
}

/**
 * Groups rows by the record they reference, in the order they arrive.
 *
 * @param rows - Rows read from the restored copy.
 * @param foreignKey - The text column that names the record a row belongs to.
 * @returns The rows of each record, keyed by that record's id.
 * @throws {PlanFailure} With `PLAN_ROW_MISSING` when a row has no text in that column.
 */
export function groupBy(rows: readonly RowValues[], foreignKey: string): Map<string, RowValues[]> {
  const grouped = new Map<string, RowValues[]>();
  for (const row of rows) {
    const owner = textOf(row, foreignKey);
    grouped.set(owner, [...(grouped.get(owner) ?? []), row]);
  }
  return grouped;
}

/**
 * The operation that removes a row, keyed by its `id` column and carrying the whole row as the state to expect.
 *
 * @param table - The table the row belongs to.
 * @param row - The row as the restored copy holds it.
 * @returns A `delete-row` operation.
 * @throws {PlanFailure} With `PLAN_ROW_MISSING` when the row has no text `id`.
 */
export function deletion(table: string, row: RowValues): DeleteRowOperation {
  return { kind: "delete-row", table, keyColumn: "id", keyValue: textOf(row, "id"), row };
}
