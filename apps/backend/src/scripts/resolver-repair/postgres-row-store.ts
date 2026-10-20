import type { ClientBase } from "pg";
import type { RowStore } from "./engine.js";
import { IDENTIFIER_PATTERN, type RowReference, type RowValues } from "./manifest.js";

/** Why the PostgreSQL store refused a statement. None of these codes contains row values. */
export type RowStoreErrorCode =
  | "REPAIR_IDENTIFIER_INVALID"
  | "REPAIR_UNKNOWN_TABLE"
  | "REPAIR_UNKNOWN_COLUMN"
  | "REPAIR_KEY_NOT_UNIQUE"
  | "REPAIR_WRITE_MISSED"
  | "REPAIR_UNLISTED_SIDE_EFFECT"
  | "REPAIR_SIDE_EFFECT_UNSUPPORTED";

/** The store refused a statement and the transaction must be rolled back. */
export class RowStoreError extends Error {
  /**
   * @param code - The reason, chosen by the store and never taken from input.
   */
  constructor(readonly code: RowStoreErrorCode) {
    super(code);
    this.name = "RowStoreError";
  }
}

/** A foreign key whose parent delete changes child rows: a cascade, a reset to null or a reset to the default. */
interface DependentColumn {
  childTable: string;
  childColumn: string;
}

/**
 * Quotes a table or column name that came from a manifest.
 * The manifest was validated already; checking again here keeps this file safe on its own.
 *
 * @param name - A table or column name.
 * @returns The name in double quotes.
 * @throws {RowStoreError} For anything that is not a plain lowercase identifier.
 */
function quoteIdentifier(name: string): string {
  if (!IDENTIFIER_PATTERN.test(name)) throw new RowStoreError("REPAIR_IDENTIFIER_INVALID");
  return `"${name}"`;
}

/**
 * The rows of a PostgreSQL database, read and written through the caller's open transaction.
 *
 * Every name is validated and checked against the live catalog, and every value is a bound parameter. A delete first
 * proves that no row in another table would silently change with it, so what the manifest lists is everything that happens.
 */
export class PostgresRowStore implements RowStore {
  private readonly columnsByTable = new Map<string, ReadonlySet<string>>();
  private readonly dependentsByTable = new Map<string, readonly DependentColumn[]>();

  /**
   * @param client - A connected client that is inside a transaction.
   */
  constructor(private readonly client: ClientBase) {}

  /**
   * Lists the columns of a table from the catalog, so an identifier from a manifest must exist before it is used.
   * The lookup goes through the search path, which also finds a temporary table in tests.
   */
  private async columnsOf(table: string): Promise<ReadonlySet<string>> {
    const cached = this.columnsByTable.get(table);
    if (cached) return cached;
    const result = await this.client.query<{ name: string }>(
      "SELECT attname AS name FROM pg_attribute WHERE attrelid = to_regclass($1) AND attnum > 0 AND NOT attisdropped",
      [quoteIdentifier(table)],
    );
    if (result.rows.length === 0) throw new RowStoreError("REPAIR_UNKNOWN_TABLE");
    const columns = new Set(result.rows.map((row) => row.name));
    this.columnsByTable.set(table, columns);
    return columns;
  }

  /**
   * Proves that every named column exists in the table before a statement uses it.
   *
   * @throws {RowStoreError} With `REPAIR_UNKNOWN_TABLE` or `REPAIR_UNKNOWN_COLUMN`.
   */
  private async requireColumns(table: string, names: readonly string[]): Promise<void> {
    const columns = await this.columnsOf(table);
    if (!names.every((name) => columns.has(name))) throw new RowStoreError("REPAIR_UNKNOWN_COLUMN");
  }

  /**
   * Finds the foreign keys that change child rows when a parent row goes.
   * A key that is not a single column referencing the parent's key column cannot be counted by the key value alone,
   * so the store refuses the delete instead of guessing.
   */
  private async dependentsOf({ table, keyColumn }: RowReference): Promise<readonly DependentColumn[]> {
    const cached = this.dependentsByTable.get(table);
    if (cached) return cached;
    const result = await this.client.query<{
      child_table: string;
      child_column: string;
      width: number;
      parent_column: string;
    }>(
      `SELECT constraint_info.conrelid::regclass::text AS child_table, child_attribute.attname AS child_column,
              array_length(constraint_info.conkey, 1) AS width, parent_attribute.attname AS parent_column
         FROM pg_constraint AS constraint_info
         JOIN pg_attribute AS child_attribute
           ON child_attribute.attrelid = constraint_info.conrelid AND child_attribute.attnum = constraint_info.conkey[1]
         JOIN pg_attribute AS parent_attribute
           ON parent_attribute.attrelid = constraint_info.confrelid AND parent_attribute.attnum = constraint_info.confkey[1]
        WHERE constraint_info.contype = 'f' AND constraint_info.confdeltype IN ('c', 'n', 'd')
          AND constraint_info.confrelid = to_regclass($1)`,
      [quoteIdentifier(table)],
    );
    if (result.rows.some((row) => row.width !== 1 || row.parent_column !== keyColumn))
      throw new RowStoreError("REPAIR_SIDE_EFFECT_UNSUPPORTED");
    const dependents = result.rows.map((row) => ({ childTable: row.child_table, childColumn: row.child_column }));
    this.dependentsByTable.set(table, dependents);
    return dependents;
  }

  /**
   * Runs a planner's query and returns every row as JSON in the same form `readRow` reports.
   * The text must be static code in a planner. It is wrapped as a subquery and never built from manifest or user data.
   *
   * @param sql - A `SELECT` statement.
   * @param parameters - Values bound to its placeholders.
   * @returns One JSON object per row.
   */
  async selectRows(sql: string, parameters: unknown[] = []): Promise<RowValues[]> {
    const result = await this.client.query<{ row: RowValues }>(
      `SELECT to_jsonb(item) AS row FROM (${sql}) AS item`,
      parameters,
    );
    return result.rows.map((row) => row.row);
  }

  async readRow(reference: RowReference, lock: boolean): Promise<RowValues | null> {
    await this.requireColumns(reference.table, [reference.keyColumn]);
    const result = await this.client.query<{ row: RowValues }>(
      `SELECT to_jsonb(item) AS row FROM ${quoteIdentifier(reference.table)} AS item
        WHERE item.${quoteIdentifier(reference.keyColumn)} = $1${lock ? " FOR UPDATE" : ""}`,
      [reference.keyValue],
    );
    if (result.rows.length > 1) throw new RowStoreError("REPAIR_KEY_NOT_UNIQUE");
    return result.rows[0]?.row ?? null;
  }

  async insertRow(reference: RowReference, row: RowValues): Promise<void> {
    await this.requireColumns(reference.table, Object.keys(row));
    const table = quoteIdentifier(reference.table);
    const result = await this.client.query(
      `INSERT INTO ${table} SELECT * FROM jsonb_populate_record(NULL::${table}, $1::jsonb)`,
      [JSON.stringify(row)],
    );
    if (result.rowCount !== 1) throw new RowStoreError("REPAIR_WRITE_MISSED");
  }

  async updateColumns(reference: RowReference, after: RowValues): Promise<void> {
    const names = Object.keys(after);
    await this.requireColumns(reference.table, [reference.keyColumn, ...names]);
    const table = quoteIdentifier(reference.table);
    const assignments = names.map((name) => `${quoteIdentifier(name)} = source.${quoteIdentifier(name)}`).join(", ");
    const result = await this.client.query(
      `UPDATE ${table} AS item SET ${assignments}
         FROM jsonb_populate_record(NULL::${table}, $2::jsonb) AS source
        WHERE item.${quoteIdentifier(reference.keyColumn)} = $1`,
      [reference.keyValue, JSON.stringify(after)],
    );
    if (result.rowCount !== 1) throw new RowStoreError("REPAIR_WRITE_MISSED");
  }

  async deleteRow(reference: RowReference): Promise<void> {
    await this.requireColumns(reference.table, [reference.keyColumn]);
    for (const dependent of await this.dependentsOf(reference)) {
      const count = await this.client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM ${dependent.childTable} WHERE ${quoteIdentifier(dependent.childColumn)} = $1`,
        [reference.keyValue],
      );
      if (count.rows[0].count > 0) throw new RowStoreError("REPAIR_UNLISTED_SIDE_EFFECT");
    }
    const result = await this.client.query(
      `DELETE FROM ${quoteIdentifier(reference.table)} WHERE ${quoteIdentifier(reference.keyColumn)} = $1`,
      [reference.keyValue],
    );
    if (result.rowCount !== 1) throw new RowStoreError("REPAIR_WRITE_MISSED");
  }
}

/**
 * Reads the hash of the newest applied Drizzle migration, which identifies the schema the operations were planned for.
 *
 * @param client - A connected client.
 * @returns The hash, or an empty string when no migration is recorded.
 */
export async function readNewestMigrationHash(client: ClientBase): Promise<string> {
  const result = await client.query<{ hash: string }>(
    "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1",
  );
  return result.rows[0]?.hash ?? "";
}

/** Whether a repair transaction may write. */
export type RepairTransactionMode = "read-only" | "read-write";

/**
 * Runs work in one repeatable-read transaction and commits only if the work returns.
 *
 * The session is set to UTC before anything is read, so timestamps look the same to the planner that recorded a
 * manifest and to the runner that checks it. Locks are not waited for beyond five seconds, because an abort is better
 * than a repair that stalls the live application.
 *
 * @param client - A connected client.
 * @param mode - `read-only` to verify, `read-write` to apply.
 * @param work - Receives the store and the newest migration hash.
 * @returns Whatever the work returns.
 * @throws Whatever the work throws, after rolling back.
 */
export async function withRepairTransaction<T>(
  client: ClientBase,
  mode: RepairTransactionMode,
  work: (store: PostgresRowStore, migrationHash: string) => Promise<T>,
): Promise<T> {
  await client.query(`BEGIN ISOLATION LEVEL REPEATABLE READ ${mode === "read-only" ? "READ ONLY" : "READ WRITE"}`);
  try {
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '60s'");
    const result = await work(new PostgresRowStore(client), await readNewestMigrationHash(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
