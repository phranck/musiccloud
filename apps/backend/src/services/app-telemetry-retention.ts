/**
 * @file How long the Apple app's telemetry events are kept, and the sweep
 * that removes what is older.
 *
 * The number is here, once. The notice TestFlight testers read promises the
 * same period, so changing it means changing that text too.
 */
import type { TrackRepository } from "../db/repository.js";
import { RETENTION_DAY_MS } from "./api-access-retention.js";

/**
 * How long a telemetry event is kept.
 *
 * An event describes one failed conversion in a TestFlight build. Ninety
 * days is long enough to see whether a fix shipped in the next builds
 * worked, and each row carries an install id, so it is not kept longer.
 */
export const TELEMETRY_RETENTION_DAYS = 90;

/**
 * Removes telemetry events older than `TELEMETRY_RETENTION_DAYS`.
 *
 * @param repo - The repository to delete through.
 * @param now - The moment to measure the cutoff back from.
 * @returns How many rows were removed.
 */
export async function sweepAppTelemetryRetention(
  repo: Pick<TrackRepository, "deleteAppTelemetryEventsBefore">,
  now: number,
): Promise<number> {
  return repo.deleteAppTelemetryEventsBefore(now - TELEMETRY_RETENTION_DAYS * RETENTION_DAY_MS);
}
