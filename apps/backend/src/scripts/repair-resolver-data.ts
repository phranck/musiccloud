/**
 * @file Local command that verifies, applies or rolls back a reviewed resolver data repair manifest.
 * The same code runs against a restored rehearsal copy and against production. Domain logic lives in the planners.
 */
import { randomUUID } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import {
  applyManifest,
  type RepairAbortCode,
  RepairAborted,
  type RepairReport,
  type RowStore,
  verifyManifest,
} from "./resolver-repair/engine.js";
import { invertManifest, ManifestError, parseManifest, type RepairManifest } from "./resolver-repair/manifest.js";
import {
  type RepairTransactionMode,
  RowStoreError,
  withRepairTransaction,
} from "./resolver-repair/postgres-row-store.js";
import { isPrivateOwnedEntry } from "./resolver-repair/private-files.js";
import {
  assertTargetIdentity,
  isRepairMode,
  RepairFailure,
  type RepairMode,
  type RepairTarget,
  type RepairTargetKind,
  readTargetIdentity,
  resolveRepairTarget,
  type TargetIdentity,
} from "./resolver-repair/target.js";

/**
 * The tables a repair may touch. A planner that needs another table adds it here in the same change, so the list a
 * reviewer reads is the list the runner enforces.
 */
export const REPAIRABLE_TABLES: ReadonlySet<string> = new Set([
  "tracks",
  "albums",
  "artist_profiles",
  "service_links",
  "service_link_misses",
  "short_urls",
  "track_external_ids",
  "track_artist_credits",
  "track_previews",
  "album_service_links",
  "album_short_urls",
  "album_external_ids",
  "album_artist_credits",
]);

/** The target variable must be named for the repair, so a development or production `DATABASE_URL` is never picked up. */
const TARGET_ENVIRONMENT_PATTERN = /^REPAIR_[A-Z0-9_]+$/;

/** An open connection to the target, with the transaction handling behind it. Tests replace it with an in-memory one. */
export interface RepairConnection {
  readIdentity(): Promise<TargetIdentity>;
  /** Runs work in one transaction that commits only when the work returns. */
  run<T>(mode: RepairTransactionMode, work: (store: RowStore, migrationHash: string) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Process ports, so tests need neither a database nor the real environment. */
export interface RepairRuntime {
  environment?: Record<string, string | undefined>;
  connect?(target: RepairTarget): Promise<RepairConnection>;
}

/** How a command ended. `aborted` and `conflicts` are results to read, not crashes. */
export type RepairStatus = "verified" | "conflicts" | "applied" | "rolled-back" | "aborted";

/** The result of a command: counts and conflict keys, never column values. */
export interface RepairOutcome {
  mode: RepairMode;
  status: RepairStatus;
  manifestSha256: string;
  target: RepairTargetKind;
  report: RepairReport;
  /** Operations written by this run. */
  written: number;
  /** Operations that were already in their approved state. */
  skipped: number;
  /** Why a run stopped, when it did. */
  abortCode?: RepairAbortCode | "REPAIR_POSTCOMMIT_MISMATCH";
  /** True when the abort came after the commit. Nothing was undone automatically. */
  committed?: boolean;
}

/**
 * Reads a file that only this user may access.
 * A manifest holds real catalog rows, so a file that others could read is refused.
 *
 * @param location - Path of an existing regular file.
 * @returns The file's text.
 * @throws {RepairFailure} With `REPAIR_PRIVATE_PATH_REQUIRED` for a link, a shared file or a file owned by someone else.
 */
async function readPrivateText(location: string): Promise<string> {
  const information = await lstat(location);
  if (!isPrivateOwnedEntry(information) || !information.isFile())
    throw new RepairFailure("REPAIR_PRIVATE_PATH_REQUIRED");
  return readFile(location, "utf8");
}

/**
 * Loads a manifest and the checksum recorded beside it.
 *
 * @param location - Path of `manifest.json`; its checksum is the first word of `manifest.json.sha256`.
 * @returns The validated manifest and its checksum.
 */
async function loadManifest(location: string): Promise<{ manifest: RepairManifest; sha256: string }> {
  const content = await readPrivateText(location);
  const sha256 = (await readPrivateText(`${location}.sha256`)).trim().split(/\s+/)[0];
  return { manifest: parseManifest(content, sha256, REPAIRABLE_TABLES), sha256 };
}

/** Opens a real PostgreSQL connection. */
async function connectToPostgres(target: RepairTarget): Promise<RepairConnection> {
  const client = new Client(target.config);
  await client.connect();
  return {
    readIdentity: () => readTargetIdentity(client),
    run: (mode, work) => withRepairTransaction(client, mode, work),
    close: () => client.end(),
  };
}

/**
 * Runs the write phase and the check that follows the commit.
 *
 * @param connection - The open connection.
 * @param manifest - The manifest to apply, already inverted for a rollback.
 * @returns The outcome fields for an applied manifest.
 */
async function applyAndCheck(
  connection: RepairConnection,
  manifest: RepairManifest,
): Promise<Pick<RepairOutcome, "report" | "written" | "skipped" | "abortCode" | "committed">> {
  const applied = await connection.run("read-write", (store, migrationHash) =>
    applyManifest(store, manifest, migrationHash),
  );
  const afterwards = await connection.run("read-only", (store, migrationHash) =>
    verifyManifest(store, manifest, migrationHash),
  );
  if (afterwards.after !== afterwards.total)
    return {
      report: afterwards,
      written: applied.written,
      skipped: applied.skipped,
      abortCode: "REPAIR_POSTCOMMIT_MISMATCH",
      committed: true,
    };
  return { report: applied.report, written: applied.written, skipped: applied.skipped };
}

/**
 * Verifies, applies or rolls back a manifest.
 *
 * @param argv - `verify`, `apply` or `rollback`, then `--manifest <file>` and `--target-env <REPAIR_...>`. On production,
 *   `apply` and `rollback` also need `--confirm <manifest checksum>`. `--report <new file>` keeps the outcome.
 * @param runtime - Process ports; the defaults use the real environment and PostgreSQL.
 * @returns How the command ended. An abort is returned, because it is a defined result of the state machine.
 * @throws {RepairFailure | ManifestError} When the command may not start; nothing has been connected then.
 */
export async function runRepairCommand(argv: string[], runtime: RepairRuntime = {}): Promise<RepairOutcome> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      manifest: { type: "string" },
      "target-env": { type: "string" },
      confirm: { type: "string" },
      report: { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });
  const mode = positionals[0];
  if (
    positionals.length !== 1 ||
    !isRepairMode(mode) ||
    !values.manifest ||
    !values["target-env"] ||
    !TARGET_ENVIRONMENT_PATTERN.test(values["target-env"])
  )
    throw new RepairFailure("REPAIR_CONFIG_REQUIRED");

  const { manifest, sha256 } = await loadManifest(path.resolve(values.manifest));
  const connectionUrl = (runtime.environment ?? process.env)[values["target-env"]];
  if (!connectionUrl) throw new RepairFailure("REPAIR_CONFIG_REQUIRED");
  const target = resolveRepairTarget(connectionUrl, mode);
  if (target.kind === "production" && mode !== "verify" && values.confirm !== sha256)
    throw new RepairFailure("REPAIR_CONFIRMATION_REQUIRED");
  if (values.report) {
    const parent = await lstat(path.dirname(path.resolve(values.report)));
    if (!isPrivateOwnedEntry(parent) || !parent.isDirectory()) throw new RepairFailure("REPAIR_PRIVATE_PATH_REQUIRED");
    const exists = await lstat(path.resolve(values.report)).then(
      () => true,
      () => false,
    );
    if (exists) throw new RepairFailure("REPAIR_REPORT_EXISTS");
  }

  const connection = await (runtime.connect ?? connectToPostgres)(target);
  let outcome: RepairOutcome;
  try {
    assertTargetIdentity(target, await connection.readIdentity());
    const base = { mode, manifestSha256: sha256, target: target.kind };
    try {
      if (mode === "verify") {
        const report = await connection.run("read-only", (store, migrationHash) =>
          verifyManifest(store, manifest, migrationHash),
        );
        outcome = { ...base, status: report.conflict > 0 ? "conflicts" : "verified", report, written: 0, skipped: 0 };
      } else {
        const effective = mode === "rollback" ? invertManifest(manifest) : manifest;
        const result = await applyAndCheck(connection, effective);
        outcome = {
          ...base,
          ...result,
          status: result.abortCode ? "aborted" : mode === "apply" ? "applied" : "rolled-back",
        };
      }
    } catch (error) {
      if (!(error instanceof RepairAborted)) throw error;
      outcome = { ...base, status: "aborted", report: error.report, written: 0, skipped: 0, abortCode: error.code };
    }
  } finally {
    await connection.close();
  }
  if (values.report)
    await writeFile(
      path.resolve(values.report),
      `${JSON.stringify({ ...outcome, recordedAt: new Date().toISOString() })}\n`,
      {
        mode: 0o600,
        flag: "wx",
      },
    );
  return outcome;
}

if (typeof module !== "undefined" && typeof require !== "undefined" && module === require.main) {
  runRepairCommand(process.argv.slice(2))
    .then((outcome) => {
      const { report, ...summary } = outcome;
      console.log(JSON.stringify({ ...summary, operations: { ...report, conflicts: report.conflicts.length } }));
      if (outcome.status === "aborted" || outcome.status === "conflicts") process.exitCode = 1;
    })
    .catch((error: unknown) => {
      const code =
        error instanceof RepairFailure || error instanceof ManifestError || error instanceof RowStoreError
          ? error.code
          : "REPAIR_FAILED";
      console.error(JSON.stringify({ status: "failed", code, errorId: randomUUID() }));
      process.exitCode = 1;
    });
}
