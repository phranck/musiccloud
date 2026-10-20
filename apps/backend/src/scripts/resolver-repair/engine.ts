import { canonicalJson } from "./canonical-json.js";
import type { RepairManifest, RepairOperation, RowReference, RowValues } from "./manifest.js";

/**
 * The rows of one database as the engine sees them. The PostgreSQL implementation wraps every call in the caller's
 * transaction, and tests use a map, so the state machine below runs without a database.
 */
export interface RowStore {
  /**
   * Reads one row.
   *
   * @param reference - The row's table and primary key.
   * @param lock - Whether to lock the row until the transaction ends. A write transaction locks so that nothing changes
   *   between the state check and the write; a read-only verification cannot lock.
   * @returns Every column of the row, or `null` when it does not exist.
   */
  readRow(reference: RowReference, lock: boolean): Promise<RowValues | null>;
  /** Inserts a row that does not exist. */
  insertRow(reference: RowReference, row: RowValues): Promise<void>;
  /** Sets the given columns on an existing row. */
  updateColumns(reference: RowReference, after: RowValues): Promise<void>;
  /** Deletes an existing row. */
  deleteRow(reference: RowReference): Promise<void>;
}

/**
 * Where one operation stands on the target.
 *
 * - `before`: the target is exactly in the recorded state, so the operation still has to run.
 * - `after`: the target already shows the approved result, so the operation is skipped.
 * - `conflict`: neither. Somebody or something changed the row since the plan was made.
 */
export type OperationState = "before" | "after" | "conflict";

/** A row an operation could not be applied to, named by key so the report can be matched to the manifest. */
export interface ConflictSummary {
  index: number;
  table: string;
  keyValue: string;
}

/** Counts of the operations by state, plus the conflicts by name. Contains no column values. */
export interface RepairReport {
  total: number;
  before: number;
  after: number;
  conflict: number;
  conflicts: ConflictSummary[];
}

/** What a committed apply did. */
export interface ApplyResult {
  report: RepairReport;
  written: number;
  skipped: number;
}

/** Reasons an apply or verification stops before it writes anything, or proves a write did not take. */
export type RepairAbortCode = "REPAIR_MIGRATION_MISMATCH" | "REPAIR_THIRD_STATE" | "REPAIR_POSTCONDITION";

/** The run stopped. The caller must roll the transaction back. */
export class RepairAborted extends Error {
  /**
   * @param code - The reason.
   * @param report - The state counts at the point of stopping.
   */
  constructor(
    readonly code: RepairAbortCode,
    readonly report: RepairReport,
  ) {
    super(code);
    this.name = "RepairAborted";
  }
}

/**
 * Whether every expected column of a row has the expected value.
 * Extra columns are fine, because an update names only the columns it changes.
 */
function containsColumns(actual: RowValues, expected: RowValues): boolean {
  return Object.entries(expected).every(
    ([column, value]) => column in actual && canonicalJson(actual[column]) === canonicalJson(value),
  );
}

/**
 * Whether a row equals an expected row in every column. A column added to the table since the plan makes the
 * comparison fail on purpose: the schema is no longer the one the operation was reviewed against.
 */
function sameRow(actual: RowValues, expected: RowValues): boolean {
  return canonicalJson(actual) === canonicalJson(expected);
}

/**
 * Decides where one operation stands.
 *
 * @param store - The target's rows.
 * @param operation - The operation to judge.
 * @param lock - Whether to lock the row while reading it.
 * @returns The operation's state.
 */
export async function classifyOperation(
  store: RowStore,
  operation: RepairOperation,
  lock: boolean,
): Promise<OperationState> {
  const current = await store.readRow(operation, lock);
  switch (operation.kind) {
    case "insert-row":
      if (current === null) return "before";
      return sameRow(current, operation.row) ? "after" : "conflict";
    case "delete-row":
      if (current === null) return "after";
      return sameRow(current, operation.row) ? "before" : "conflict";
    case "update-columns":
      if (current === null) return "conflict";
      if (containsColumns(current, operation.before)) return "before";
      return containsColumns(current, operation.after) ? "after" : "conflict";
  }
}

/** Counts the states and names the conflicting rows. The report holds keys and counts, never column values. */
function summarize(manifest: RepairManifest, states: readonly OperationState[]): RepairReport {
  const conflicts = manifest.operations.flatMap((operation, index) =>
    states[index] === "conflict" ? [{ index, table: operation.table, keyValue: operation.keyValue }] : [],
  );
  return {
    total: states.length,
    before: states.filter((state) => state === "before").length,
    after: states.filter((state) => state === "after").length,
    conflict: conflicts.length,
    conflicts,
  };
}

/**
 * Judges every operation before any write, so the state of a row never depends on what an earlier operation wrote.
 * That is sound because a manifest names each row only once.
 */
async function classifyAll(store: RowStore, manifest: RepairManifest, lock: boolean): Promise<OperationState[]> {
  const states: OperationState[] = [];
  for (const operation of manifest.operations) states.push(await classifyOperation(store, operation, lock));
  return states;
}

/** A report for an abort that happens before any row was read. */
function untouchedReport(manifest: RepairManifest): RepairReport {
  return { total: manifest.operations.length, before: 0, after: 0, conflict: 0, conflicts: [] };
}

/**
 * Stops when the target's schema is not the one the operations were reviewed against.
 *
 * @throws {RepairAborted} With `REPAIR_MIGRATION_MISMATCH`, before any row is read.
 */
function requireMigration(manifest: RepairManifest, observedMigrationHash: string): void {
  if (observedMigrationHash !== manifest.requiredMigrationHash)
    throw new RepairAborted("REPAIR_MIGRATION_MISMATCH", untouchedReport(manifest));
}

/**
 * Reports where every operation stands without writing.
 *
 * @param store - The target's rows, read in a read-only transaction.
 * @param manifest - The validated manifest.
 * @param observedMigrationHash - The newest Drizzle migration hash on the target.
 * @returns The counts by state and the conflicting rows.
 * @throws {RepairAborted} With `REPAIR_MIGRATION_MISMATCH` when the target's schema is not the one the manifest names.
 */
export async function verifyManifest(
  store: RowStore,
  manifest: RepairManifest,
  observedMigrationHash: string,
): Promise<RepairReport> {
  requireMigration(manifest, observedMigrationHash);
  return summarize(manifest, await classifyAll(store, manifest, false));
}

/**
 * Applies a manifest inside the caller's open write transaction.
 *
 * Every row is read and locked first. A conflict stops the run before any write, so the target never holds half
 * of a repair. Operations already in the approved state are skipped, which makes a second run change nothing.
 * Afterwards every operation is read again and must show its approved state, which catches a write that did not take.
 * The caller commits only when this returns, and rolls back when it throws.
 *
 * @param store - The target's rows.
 * @param manifest - The validated manifest.
 * @param observedMigrationHash - The newest Drizzle migration hash on the target.
 * @returns The state counts before the run and how many operations were written or skipped.
 * @throws {RepairAborted} For a schema mismatch, a conflict, or an operation that is not in its approved state afterwards.
 */
export async function applyManifest(
  store: RowStore,
  manifest: RepairManifest,
  observedMigrationHash: string,
): Promise<ApplyResult> {
  requireMigration(manifest, observedMigrationHash);
  const states = await classifyAll(store, manifest, true);
  const report = summarize(manifest, states);
  if (report.conflict > 0) throw new RepairAborted("REPAIR_THIRD_STATE", report);

  let written = 0;
  for (const [index, operation] of manifest.operations.entries()) {
    if (states[index] !== "before") continue;
    if (operation.kind === "insert-row") await store.insertRow(operation, operation.row);
    else if (operation.kind === "update-columns") await store.updateColumns(operation, operation.after);
    else await store.deleteRow(operation);
    written++;
  }

  const afterwards = summarize(manifest, await classifyAll(store, manifest, true));
  if (afterwards.after !== afterwards.total) throw new RepairAborted("REPAIR_POSTCONDITION", afterwards);
  return { report, written, skipped: report.after };
}
