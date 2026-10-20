/**
 * @file Local command that turns a restored copy of the production database into a reviewed repair manifest.
 * It reads only. `repair-resolver-data.ts` is the one command that writes the manifest it produces.
 */
import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { Client } from "pg";
import type { NormalizedTrack } from "../services/types.js";
import { ManifestError } from "./resolver-repair/manifest.js";
import { planDuplicateIdentities } from "./resolver-repair/planners/duplicate-identities.js";
import { planRecordingArtwork } from "./resolver-repair/planners/recording-artwork.js";
import { planRecordingLinks } from "./resolver-repair/planners/recording-links.js";
import {
  type PlanContext,
  PlanFailure,
  type Planner,
  type PlanOptions,
  type PlanPorts,
  renderPlan,
} from "./resolver-repair/planning.js";
import { RowStoreError, withRepairTransaction } from "./resolver-repair/postgres-row-store.js";
import {
  isPrivateOwnedEntry,
  PrivatePublicationError,
  pathExists,
  publishPrivateDirectory,
  readPrivateText,
} from "./resolver-repair/private-files.js";
import { REPAIRABLE_TABLES } from "./resolver-repair/repairable-tables.js";
import {
  assertTargetIdentity,
  RepairFailure,
  type RepairTarget,
  readTargetIdentity,
  resolveRepairTarget,
  type TargetIdentity,
} from "./resolver-repair/target.js";

/** The repairs this command can plan. A new planner is registered here in the same change that adds it. */
const PLANNERS: Readonly<Record<string, Planner>> = {
  "duplicate-identities": planDuplicateIdentities,
  "recording-artwork": planRecordingArtwork,
  "recording-links": planRecordingLinks,
};

/** Options a planner reads from the command line, as repeated values. */
const PLANNER_OPTIONS = ["track-id"] as const;

const TARGET_ENVIRONMENT_PATTERN = /^REPAIR_[A-Z0-9_]+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

/** An open read-only connection to a restored copy. Tests replace it with fixed rows. */
export interface PlanConnection {
  readIdentity(): Promise<TargetIdentity>;
  /** Runs the planner's reads in one read-only, repeatable-read transaction. */
  read<T>(work: (query: PlanContext["query"], migrationHash: string) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Process ports, so tests need neither a database nor a provider. */
export interface PlanRuntime {
  environment?: Record<string, string | undefined>;
  connect?(target: RepairTarget): Promise<PlanConnection>;
  ports?: PlanPorts;
}

/** What a command planned. Counts and the checksum, never rows. */
export interface PlanOutcome {
  repair: string;
  operations: number;
  manifestSha256: string;
}

async function connectToPostgres(target: RepairTarget): Promise<PlanConnection> {
  const client = new Client(target.config);
  await client.connect();
  return {
    readIdentity: () => readTargetIdentity(client),
    read: (work) =>
      withRepairTransaction(client, "read-only", (store, migrationHash) =>
        work((sql, parameters) => store.selectRows(sql, parameters), migrationHash),
      ),
    close: () => client.end(),
  };
}

/**
 * Asks the registered adapter of a service for one track.
 * The registry loads when the first lookup needs it, so planning that never leaves the database never loads an adapter.
 */
const adapterPorts: PlanPorts = {
  async fetchTrack(service: string, externalId: string): Promise<NormalizedTrack> {
    const { listPlugins } = await import("../services/plugins/registry.js");
    const plugin = listPlugins().find((candidate) => candidate.adapter.id === service);
    if (!plugin) throw new Error("NO_ADAPTER");
    return plugin.adapter.getTrack(externalId);
  },
};

/**
 * Reads what the snapshot directory says about the copy, and proves the copy is the one it describes.
 *
 * @param snapshotDirectory - The private directory that holds `dump-manifest.json` and `restore-verification.json`.
 * @param database - The database the command is about to read.
 * @returns The SHA-256 of the archive the copy was restored from.
 * @throws {PlanFailure} When the directory is not private, a file is malformed, or the copy is not the verified restore.
 */
async function readSnapshotProvenance(snapshotDirectory: string, database: string): Promise<string> {
  const directory = await lstat(snapshotDirectory);
  if (!isPrivateOwnedEntry(directory) || !directory.isDirectory()) throw new PlanFailure("PLAN_PRIVATE_PATH_REQUIRED");
  const denied = () => new PlanFailure("PLAN_PRIVATE_PATH_REQUIRED");
  const dump: unknown = JSON.parse(await readPrivateText(path.join(snapshotDirectory, "dump-manifest.json"), denied));
  const restore: unknown = JSON.parse(
    await readPrivateText(path.join(snapshotDirectory, "restore-verification.json"), denied),
  );
  const archiveSha256 = (dump as { sha256?: unknown } | null)?.sha256;
  const verified = restore as { database?: unknown; tableCountsMatch?: unknown; migrationsMatch?: unknown } | null;
  if (typeof archiveSha256 !== "string" || !SHA256_PATTERN.test(archiveSha256))
    throw new PlanFailure("PLAN_SNAPSHOT_MISMATCH");
  if (verified?.database !== database || verified.tableCountsMatch !== true || verified.migrationsMatch !== true)
    throw new PlanFailure("PLAN_SNAPSHOT_MISMATCH");
  return archiveSha256;
}

/**
 * Requires a new output path in a private directory outside every Git checkout.
 * A plan holds real catalog rows, so it must never sit where a commit could pick it up.
 *
 * @param output - The planned directory.
 * @throws {PlanFailure} With `PLAN_OUTPUT_INVALID` or `PLAN_PRIVATE_PATH_REQUIRED`.
 */
async function requireNewPrivateOutput(output: string): Promise<void> {
  const parent = await lstat(path.dirname(output));
  if (!isPrivateOwnedEntry(parent) || !parent.isDirectory()) throw new PlanFailure("PLAN_PRIVATE_PATH_REQUIRED");
  if (await pathExists(output)) throw new PlanFailure("PLAN_OUTPUT_INVALID");
  for (let ancestor = path.dirname(output); ancestor !== path.dirname(ancestor); ancestor = path.dirname(ancestor))
    if (await pathExists(path.join(ancestor, ".git"))) throw new PlanFailure("PLAN_OUTPUT_INVALID");
}

/**
 * Plans one repair from a restored copy and publishes the result to a new private directory.
 *
 * @param argv - The repair name, then `--snapshot-dir`, `--target-env <REPAIR_...>`, `--out-dir <new directory>`, and
 *   the planner's own options such as `--track-id`.
 * @param runtime - Process ports; the defaults use the real environment, PostgreSQL and the registered adapters.
 * @returns The repair, its operation count and the manifest checksum.
 * @throws {PlanFailure | RepairFailure | ManifestError} When nothing can be planned or published. A restored copy is
 *   the only accepted source, so production is never read here.
 */
export async function runPlanCommand(argv: string[], runtime: PlanRuntime = {}): Promise<PlanOutcome> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      "snapshot-dir": { type: "string" },
      "target-env": { type: "string" },
      "out-dir": { type: "string" },
      "track-id": { type: "string", multiple: true },
    },
    strict: true,
    allowPositionals: true,
  });
  const repair = positionals[0];
  if (positionals.length !== 1 || !repair || !Object.hasOwn(PLANNERS, repair))
    throw new PlanFailure("PLAN_UNKNOWN_REPAIR");
  const targetName = values["target-env"];
  if (!values["snapshot-dir"] || !values["out-dir"] || !targetName || !TARGET_ENVIRONMENT_PATTERN.test(targetName))
    throw new PlanFailure("PLAN_OPTION_INVALID");

  const connectionUrl = (runtime.environment ?? process.env)[targetName];
  if (!connectionUrl) throw new PlanFailure("PLAN_OPTION_INVALID");
  const target = resolveRepairTarget(connectionUrl, "verify");
  if (target.kind !== "rehearsal-copy") throw new PlanFailure("PLAN_TARGET_NOT_A_COPY");
  const sourceArchiveSha256 = await readSnapshotProvenance(path.resolve(values["snapshot-dir"]), target.database);
  const output = path.resolve(values["out-dir"]);
  await requireNewPrivateOutput(output);

  const options: PlanOptions = Object.fromEntries(PLANNER_OPTIONS.map((name) => [name, values[name] ?? []]));
  const connection = await (runtime.connect ?? connectToPostgres)(target);
  let rendered: ReturnType<typeof renderPlan>;
  try {
    assertTargetIdentity(target, await connection.readIdentity());
    const plan = await connection.read((query, migrationHash) =>
      PLANNERS[repair]({ query, migrationHash, sourceArchiveSha256, ports: runtime.ports ?? adapterPorts }, options),
    );
    rendered = renderPlan(plan, REPAIRABLE_TABLES);
  } finally {
    await connection.close();
  }
  try {
    await publishPrivateDirectory(output, rendered.files);
  } catch (error) {
    if (error instanceof PrivatePublicationError) throw new PlanFailure("PLAN_OUTPUT_INVALID");
    throw error;
  }
  return { repair, operations: rendered.operations, manifestSha256: rendered.sha256 };
}

if (typeof module !== "undefined" && typeof require !== "undefined" && module === require.main) {
  runPlanCommand(process.argv.slice(2))
    .then((outcome) => {
      console.log(JSON.stringify({ status: "planned", ...outcome }));
    })
    .catch((error: unknown) => {
      const code =
        error instanceof PlanFailure ||
        error instanceof RepairFailure ||
        error instanceof ManifestError ||
        error instanceof RowStoreError
          ? error.code
          : "PLAN_FAILED";
      console.error(JSON.stringify({ status: "failed", code, errorId: randomUUID() }));
      process.exitCode = 1;
    });
}
