import type { JsonValue } from "../canonical-json.js";
import type { RowValues, UpdateColumnsOperation } from "../manifest.js";
import type { Planner } from "../planning.js";
import {
  ARTWORK_COLUMNS,
  type RejectedArtworkPolicy,
  rejectedStoredArtwork,
  type StoredArtworkTable,
} from "../stored-artwork-policy.js";

/** The name this repair carries in its manifest. */
export const RECORDING_ARTWORK_REPAIR = "recording-artwork";

/** The issue that owns this repair. */
const RECORDING_ARTWORK_ISSUE = 767;

/** The tables in the order the repair visits them. */
const TABLES: readonly StoredArtworkTable[] = ["tracks", "albums", "artist_profiles"];

/**
 * Plans the removal of stored covers and portraits that the current policy does not allow.
 *
 * Each rejected value becomes one `update-columns` operation that sets its column to null, and only while the column
 * still holds the recorded value. Nothing else changes: the recording, its identifiers, credits and short URLs stay,
 * and no replacement is looked up or invented, because normal enrichment fills a missing cover when a recording is
 * resolved again. Served share pages already hide these values, so clearing them changes no page.
 *
 * @param context - Rows of the restored copy.
 * @returns The manifest, and counts by table and policy as evidence.
 */
export const planRecordingArtwork: Planner = async (context) => {
  const operations: UpdateColumnsOperation[] = [];
  const counts: Record<string, Partial<Record<RejectedArtworkPolicy, number>>> = {};
  for (const table of TABLES) {
    const { column, keyColumn } = ARTWORK_COLUMNS[table];
    const rows: RowValues[] = await context.query(
      `SELECT ${keyColumn} AS key, ${column} AS url FROM ${table} WHERE ${column} IS NOT NULL ORDER BY ${keyColumn} COLLATE "C"`,
    );
    counts[table] = {};
    for (const row of rows) {
      if (typeof row.key !== "string" || typeof row.url !== "string") continue;
      const policy = rejectedStoredArtwork(table, row.url);
      if (!policy) continue;
      counts[table][policy] = (counts[table][policy] ?? 0) + 1;
      operations.push({
        kind: "update-columns",
        table,
        keyColumn,
        keyValue: row.key,
        before: { [column]: row.url },
        after: { [column]: null },
      });
    }
  }
  const evidence: JsonValue = { counts, operations: operations.length };
  return {
    manifest: {
      formatVersion: 1,
      repair: RECORDING_ARTWORK_REPAIR,
      issue: RECORDING_ARTWORK_ISSUE,
      sourceArchiveSha256: context.sourceArchiveSha256,
      requiredMigrationHash: context.migrationHash,
      operations,
    },
    evidence,
  };
};
