import { canonicalJson, type JsonValue, sha256Hex } from "./canonical-json.js";

/** Column values of one row, in the form PostgreSQL's `to_jsonb` reports them. */
export type RowValues = { [column: string]: JsonValue };

/** Names one row by the single-column primary key of its table. */
export interface RowReference {
  table: string;
  keyColumn: string;
  keyValue: string;
}

/** Adds a row that must not exist yet. */
export interface InsertRowOperation extends RowReference {
  kind: "insert-row";
  /** Every column of the new row, including the key column. */
  row: RowValues;
}

/** Changes some columns of a row from exactly the expected values to the approved ones. */
export interface UpdateColumnsOperation extends RowReference {
  kind: "update-columns";
  /** The expected current values of the changed columns. */
  before: RowValues;
  /** The approved new values of the same columns. */
  after: RowValues;
}

/** Removes a row that must still be exactly as recorded. */
export interface DeleteRowOperation extends RowReference {
  kind: "delete-row";
  /** Every column of the row as it is expected right now. The inverse operation inserts this row again. */
  row: RowValues;
}

/** The only three things a repair can do to a database. */
export type RepairOperation = InsertRowOperation | UpdateColumnsOperation | DeleteRowOperation;

/**
 * A reviewed repair as data. The checksum of its canonical text identifies it, so the package rehearsed on a copy
 * is provably the package that runs on production.
 */
export interface RepairManifest {
  formatVersion: 1;
  /** Short name of the repair, such as `recording-artwork`. */
  repair: string;
  /** The GitHub issue that owns the repair. */
  issue: number;
  /** SHA-256 of the dump archive the operations were planned from. */
  sourceArchiveSha256: string;
  /** The newest Drizzle migration hash the target must have, so the operations match its schema. */
  requiredMigrationHash: string;
  /** Applied in this order; the inverse runs them in reverse. */
  operations: RepairOperation[];
}

/** A manifest as text together with the checksum that identifies it. */
export interface SealedManifest {
  content: string;
  sha256: string;
}

/** Why a manifest was refused. None of these codes contains row values. */
export type ManifestErrorCode =
  | "MANIFEST_CHECKSUM_MISMATCH"
  | "MANIFEST_NOT_JSON"
  | "MANIFEST_NOT_CANONICAL"
  | "MANIFEST_SHAPE_INVALID"
  | "MANIFEST_TABLE_NOT_ALLOWED"
  | "MANIFEST_IDENTIFIER_INVALID"
  | "MANIFEST_DUPLICATE_ROW"
  | "MANIFEST_OPERATION_INVALID";

/** A refused manifest. The message is the static code, never data from the manifest. */
export class ManifestError extends Error {
  /**
   * @param code - The reason, chosen by the validator and never taken from input.
   */
  constructor(readonly code: ManifestErrorCode) {
    super(code);
    this.name = "ManifestError";
  }
}

/** Upper bound that keeps a mistaken manifest from locking thousands of production rows in one transaction. */
const MAXIMUM_OPERATIONS = 20000;

/** Table and column names. They are quoted into SQL, so only this shape ever reaches a statement. */
export const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;

const REPAIR_NAME_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const OPERATION_KINDS: readonly RepairOperation["kind"][] = ["insert-row", "update-columns", "delete-row"];

/** Whether a value is a plain object, which excludes arrays, dates, class instances and `null`. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/** Whether a value consists only of JSON types, so that it serializes to the same text on every machine. */
function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isPlainObject(value) && Object.values(value).every(isJsonValue);
}

/**
 * Whether an object has exactly the expected keys.
 * An unknown key is refused rather than ignored, so a field a newer runner would act on cannot hide in a manifest.
 */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

/**
 * Checks the column map of an operation: a non-empty plain object of JSON values whose keys are plain identifiers.
 *
 * @param value - The `row`, `before` or `after` field of an operation.
 * @returns The same map, typed.
 * @throws {ManifestError} With `MANIFEST_SHAPE_INVALID` or `MANIFEST_IDENTIFIER_INVALID`.
 */
function validateRowValues(value: unknown): RowValues {
  if (!isPlainObject(value) || Object.keys(value).length === 0 || !isJsonValue(value))
    throw new ManifestError("MANIFEST_SHAPE_INVALID");
  if (!Object.keys(value).every((column) => IDENTIFIER_PATTERN.test(column)))
    throw new ManifestError("MANIFEST_IDENTIFIER_INVALID");
  return value as RowValues;
}

/**
 * Checks one operation: its kind, its table against the allowlist, its names as plain identifiers, and that its
 * before and after states are consistent with each other and with the key.
 *
 * @param value - One entry of the manifest's `operations`.
 * @param allowedTables - The tables a repair may touch.
 * @returns The operation, typed.
 * @throws {ManifestError} With the code that names the first deviation.
 */
function validateOperation(value: unknown, allowedTables: ReadonlySet<string>): RepairOperation {
  if (!isPlainObject(value)) throw new ManifestError("MANIFEST_OPERATION_INVALID");
  const { kind, table, keyColumn, keyValue } = value;
  if (!OPERATION_KINDS.includes(kind as RepairOperation["kind"])) throw new ManifestError("MANIFEST_OPERATION_INVALID");
  if (typeof table !== "string" || typeof keyColumn !== "string" || typeof keyValue !== "string")
    throw new ManifestError("MANIFEST_OPERATION_INVALID");
  if (!IDENTIFIER_PATTERN.test(table) || !IDENTIFIER_PATTERN.test(keyColumn))
    throw new ManifestError("MANIFEST_IDENTIFIER_INVALID");
  if (!allowedTables.has(table)) throw new ManifestError("MANIFEST_TABLE_NOT_ALLOWED");
  if (keyValue.length === 0 || keyValue.length > 200) throw new ManifestError("MANIFEST_OPERATION_INVALID");
  const reference = { table, keyColumn, keyValue };

  if (kind === "update-columns") {
    if (!hasExactKeys(value, ["kind", "table", "keyColumn", "keyValue", "before", "after"]))
      throw new ManifestError("MANIFEST_OPERATION_INVALID");
    const before = validateRowValues(value.before);
    const after = validateRowValues(value.after);
    const columns = Object.keys(before);
    const sameColumns = columns.length === Object.keys(after).length && columns.every((column) => column in after);
    if (!sameColumns || columns.includes(keyColumn) || canonicalJson(before) === canonicalJson(after))
      throw new ManifestError("MANIFEST_OPERATION_INVALID");
    return { kind, ...reference, before, after };
  }

  if (!hasExactKeys(value, ["kind", "table", "keyColumn", "keyValue", "row"]))
    throw new ManifestError("MANIFEST_OPERATION_INVALID");
  const row = validateRowValues(value.row);
  if (row[keyColumn] !== keyValue) throw new ManifestError("MANIFEST_OPERATION_INVALID");
  return { kind: kind as "insert-row" | "delete-row", ...reference, row };
}

/**
 * Checks a manifest object field by field.
 *
 * @param value - Parsed JSON of unknown shape.
 * @param allowedTables - The tables a repair may touch.
 * @returns The same content, typed.
 * @throws {ManifestError} For any deviation: wrong version, unknown keys, a table outside the allowlist, a name that
 *   is not a plain identifier, a key that appears twice, or an operation whose before and after states are inconsistent.
 */
export function validateManifest(value: unknown, allowedTables: ReadonlySet<string>): RepairManifest {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "formatVersion",
      "repair",
      "issue",
      "sourceArchiveSha256",
      "requiredMigrationHash",
      "operations",
    ])
  )
    throw new ManifestError("MANIFEST_SHAPE_INVALID");
  const { formatVersion, repair, issue, sourceArchiveSha256, requiredMigrationHash, operations } = value;
  if (
    formatVersion !== 1 ||
    typeof repair !== "string" ||
    !REPAIR_NAME_PATTERN.test(repair) ||
    typeof issue !== "number" ||
    !Number.isInteger(issue) ||
    issue <= 0 ||
    typeof sourceArchiveSha256 !== "string" ||
    !SHA256_PATTERN.test(sourceArchiveSha256) ||
    typeof requiredMigrationHash !== "string" ||
    !SHA256_PATTERN.test(requiredMigrationHash) ||
    !Array.isArray(operations) ||
    operations.length === 0 ||
    operations.length > MAXIMUM_OPERATIONS
  )
    throw new ManifestError("MANIFEST_SHAPE_INVALID");

  const validated = operations.map((operation) => validateOperation(operation, allowedTables));
  const seen = new Set<string>();
  for (const operation of validated) {
    const identity = JSON.stringify([operation.table, operation.keyColumn, operation.keyValue]);
    if (seen.has(identity)) throw new ManifestError("MANIFEST_DUPLICATE_ROW");
    seen.add(identity);
  }
  return { formatVersion, repair, issue, sourceArchiveSha256, requiredMigrationHash, operations: validated };
}

/**
 * Turns a manifest into its canonical text and checksum.
 *
 * @param manifest - A planner's result.
 * @param allowedTables - The tables a repair may touch.
 * @returns The text to store and the SHA-256 that identifies it.
 * @throws {ManifestError} When the manifest does not validate.
 */
export function sealManifest(manifest: RepairManifest, allowedTables: ReadonlySet<string>): SealedManifest {
  validateManifest(manifest, allowedTables);
  const content = `${canonicalJson(manifest)}\n`;
  return { content, sha256: sha256Hex(content) };
}

/**
 * Reads a stored manifest and proves it is the one that was reviewed.
 *
 * The checksum is compared before the text is parsed, and the text must equal its own canonical form, so an edit of
 * any byte, including whitespace, is refused.
 *
 * @param content - Exact text of the manifest file.
 * @param expectedSha256 - The checksum recorded when the manifest was sealed.
 * @param allowedTables - The tables a repair may touch.
 * @returns The validated manifest.
 * @throws {ManifestError} On a checksum mismatch, malformed text or an invalid manifest.
 */
export function parseManifest(
  content: string,
  expectedSha256: string,
  allowedTables: ReadonlySet<string>,
): RepairManifest {
  if (sha256Hex(content) !== expectedSha256) throw new ManifestError("MANIFEST_CHECKSUM_MISMATCH");
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new ManifestError("MANIFEST_NOT_JSON");
  }
  const manifest = validateManifest(parsed, allowedTables);
  if (`${canonicalJson(manifest)}\n` !== content) throw new ManifestError("MANIFEST_NOT_CANONICAL");
  return manifest;
}

/**
 * Builds the manifest that undoes another one: operations in reverse order, each turned around.
 * Because every operation records its full expected state, no separate capture of the changed data is needed.
 *
 * @param manifest - A validated manifest.
 * @returns The inverse, for the same state machine to apply.
 */
export function invertManifest(manifest: RepairManifest): RepairManifest {
  const operations = manifest.operations
    .map((operation): RepairOperation => {
      if (operation.kind === "insert-row") return { ...operation, kind: "delete-row" };
      if (operation.kind === "delete-row") return { ...operation, kind: "insert-row" };
      return { ...operation, before: operation.after, after: operation.before };
    })
    .reverse();
  return { ...manifest, operations };
}
