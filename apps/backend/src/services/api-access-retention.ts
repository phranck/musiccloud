/**
 * @file How long the API-access tables keep their rows, and the sweep that
 * removes what is older.
 *
 * `docs/api-access-retention.md` explains each period. The numbers are here,
 * once, and both the sweep and the audit read take them from here.
 */
import type { ApiAccessRepository } from "../db/api-access-repository.js";

/**
 * How long a usage row is kept.
 *
 * Ninety days covers a quarter, which is the longest range any screen offers
 * and long enough to answer "was this developer always this busy". Nothing
 * bills on these rows, so keeping them beyond the question they answer buys
 * only disk.
 */
export const USAGE_RETENTION_DAYS = 90;

/**
 * How long an audit-trail row is kept.
 *
 * A year covers the longest billing period sold, so a change to a project's
 * quota, plan or keys can still be traced while the period it fell in can be
 * disputed. The rows name the admin or developer who acted, so they are not
 * kept longer than that question lasts.
 */
export const AUDIT_RETENTION_DAYS = 365;

/** One day in milliseconds. */
export const RETENTION_DAY_MS = 24 * 60 * 60 * 1000;

/** How many rows one sweep removed from each table. */
export interface ApiAccessRetentionResult {
  usageRows: number;
  auditRows: number;
}

/**
 * Removes usage and audit rows older than their retention periods.
 *
 * @param repo - The API-access repository to delete through.
 * @param now - The moment to measure both cutoffs back from.
 * @returns How many rows each table lost.
 */
export async function sweepApiAccessRetention(
  repo: Pick<ApiAccessRepository, "deleteApiUsageEventsBefore" | "deleteApiAccessAuditEventsBefore">,
  now: number,
): Promise<ApiAccessRetentionResult> {
  const usageRows = await repo.deleteApiUsageEventsBefore(now - USAGE_RETENTION_DAYS * RETENTION_DAY_MS);
  const auditRows = await repo.deleteApiAccessAuditEventsBefore(now - AUDIT_RETENTION_DAYS * RETENTION_DAY_MS);
  return { usageRows, auditRows };
}
