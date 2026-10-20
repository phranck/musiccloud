import type { RowStore } from "../engine.js";
import type { RepairManifest, RepairOperation, RowReference, RowValues } from "../manifest.js";

/** Stands in for a database in tests: rows in a map, every write recorded. */
export class MemoryRowStore implements RowStore {
  private readonly rows = new Map<string, RowValues>();
  /** One entry per write, in order, so a test can prove what ran and what did not. */
  readonly writes: string[] = [];
  /** One entry per read, with whether it locked. */
  readonly reads: { key: string; lock: boolean }[] = [];

  /**
   * @param initial - Rows to start with, each with its table and key column.
   */
  constructor(initial: { table: string; keyColumn: string; row: RowValues }[] = []) {
    for (const { table, keyColumn, row } of initial)
      this.rows.set(MemoryRowStore.keyOf({ table, keyValue: String(row[keyColumn]) }), structuredClone(row));
  }

  private static keyOf(reference: Pick<RowReference, "table" | "keyValue">): string {
    return `${reference.table}/${reference.keyValue}`;
  }

  /** Copies every row, keyed by table and key value, for comparing states. */
  snapshot(): Record<string, RowValues> {
    return Object.fromEntries(
      [...this.rows.entries()]
        .sort(([left], [right]) => (left < right ? -1 : 1))
        .map(([key, row]) => [key, structuredClone(row)]),
    );
  }

  /** Changes a row directly, as another process would. */
  tamper(reference: Pick<RowReference, "table" | "keyValue">, changes: RowValues): void {
    const key = MemoryRowStore.keyOf(reference);
    this.rows.set(key, { ...this.rows.get(key), ...changes });
  }

  async readRow(reference: RowReference, lock: boolean): Promise<RowValues | null> {
    const key = MemoryRowStore.keyOf(reference);
    this.reads.push({ key, lock });
    const row = this.rows.get(key);
    return row ? structuredClone(row) : null;
  }

  async insertRow(reference: RowReference, row: RowValues): Promise<void> {
    const key = MemoryRowStore.keyOf(reference);
    if (this.rows.has(key)) throw new Error("duplicate key");
    this.rows.set(key, structuredClone(row));
    this.writes.push(`insert ${key}`);
  }

  async updateColumns(reference: RowReference, after: RowValues): Promise<void> {
    const key = MemoryRowStore.keyOf(reference);
    this.rows.set(key, { ...this.rows.get(key), ...structuredClone(after) });
    this.writes.push(`update ${key}`);
  }

  async deleteRow(reference: RowReference): Promise<void> {
    const key = MemoryRowStore.keyOf(reference);
    this.rows.delete(key);
    this.writes.push(`delete ${key}`);
  }
}

/** A hash standing in for the newest Drizzle migration. */
export const MIGRATION_HASH = "a".repeat(64);

/** A hash standing in for the dump archive. */
export const ARCHIVE_HASH = "b".repeat(64);

/**
 * Builds a manifest around operations.
 *
 * @param operations - The operations, in apply order.
 * @returns A manifest with fixed provenance.
 */
export function manifestOf(operations: RepairOperation[]): RepairManifest {
  return {
    formatVersion: 1,
    repair: "fixture-repair",
    issue: 775,
    sourceArchiveSha256: ARCHIVE_HASH,
    requiredMigrationHash: MIGRATION_HASH,
    operations,
  };
}
