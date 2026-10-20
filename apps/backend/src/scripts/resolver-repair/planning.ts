import type { NormalizedTrack } from "../../services/types.js";
import type { JsonValue } from "./canonical-json.js";
import { type RepairManifest, type RowValues, sealManifest } from "./manifest.js";
import type { PrivateFile } from "./private-files.js";

/** Why planning ended without a manifest. None of these codes contains a row value. */
export type PlanFailureCode =
  | "PLAN_OPTION_INVALID"
  | "PLAN_ROW_MISSING"
  | "PLAN_EMPTY"
  | "PLAN_UNKNOWN_REPAIR"
  | "PLAN_SNAPSHOT_MISMATCH"
  | "PLAN_TARGET_NOT_A_COPY"
  | "PLAN_PRIVATE_PATH_REQUIRED"
  | "PLAN_OUTPUT_INVALID";

/** Planning ended without a manifest. The message is the static code. */
export class PlanFailure extends Error {
  /**
   * @param code - The reason, chosen by the planner and never taken from input.
   */
  constructor(readonly code: PlanFailureCode) {
    super(code);
    this.name = "PlanFailure";
  }
}

/** The outside world a planner may ask. Tests replace it, so planners need neither a network nor an adapter. */
export interface PlanPorts {
  /**
   * Asks the service's own catalog for one track, by the id the link stores.
   *
   * @param service - A `service_links.service` value such as `deezer`.
   * @param externalId - The link's `external_id`.
   * @returns The provider's current metadata.
   * @throws Whatever the lookup throws. A failure never counts as a verdict about the recording.
   */
  fetchTrack(service: string, externalId: string): Promise<NormalizedTrack>;
}

/** What a planner may use: rows of the restored copy, its schema fingerprint, the archive hash, and the ports. */
export interface PlanContext {
  /** Runs a static `SELECT` and returns every row as JSON, with timestamps in UTC. */
  query(sql: string, parameters?: unknown[]): Promise<RowValues[]>;
  /** The newest Drizzle migration hash of the copy, which the manifest will require of its target. */
  migrationHash: string;
  /** SHA-256 of the dump archive the copy was restored from. */
  sourceArchiveSha256: string;
  ports: PlanPorts;
}

/** Repeated command-line values by option name, such as `track-id`. */
export type PlanOptions = Readonly<Record<string, readonly string[]>>;

/** A planner's result: the operations and the reasoning a reviewer reads before approving them. */
export interface PlanResult {
  manifest: RepairManifest;
  /** The judgments behind the operations. Provider metadata is public, and credentials never appear. */
  evidence: JsonValue;
}

/** A planner turns the data of a restored copy into a manifest. It reads, and it never writes. */
export type Planner = (context: PlanContext, options: PlanOptions) => Promise<PlanResult>;

/**
 * Renders a plan as the files of a new private directory: the manifest, its checksum, the evidence, and a marker
 * written last, so a reader that finds the marker can trust the rest.
 *
 * @param plan - The planner's result.
 * @param allowedTables - The tables a manifest may touch.
 * @returns The files in publication order and the manifest checksum.
 * @throws {PlanFailure} With `PLAN_EMPTY` when the plan has no operation, and {@link ManifestError} when it does not validate.
 */
export function renderPlan(
  plan: PlanResult,
  allowedTables: ReadonlySet<string>,
): { files: PrivateFile[]; sha256: string; operations: number } {
  if (plan.manifest.operations.length === 0) throw new PlanFailure("PLAN_EMPTY");
  const sealed = sealManifest(plan.manifest, allowedTables);
  return {
    sha256: sealed.sha256,
    operations: plan.manifest.operations.length,
    files: [
      { name: "manifest.json", content: sealed.content },
      { name: "manifest.json.sha256", content: `${sealed.sha256}  manifest.json\n` },
      { name: "plan-evidence.json", content: `${JSON.stringify(plan.evidence)}\n` },
      {
        name: "plan.json",
        content: `${JSON.stringify({ complete: true, repair: plan.manifest.repair, operations: plan.manifest.operations.length, manifestSha256: sealed.sha256 })}\n`,
      },
    ],
  };
}
