import type { Pool } from "pg";
import type { RecordingKind } from "../repository.js";

/**
 * Atomically changes an observed recording cover without rewriting metadata.
 *
 * The null-safe comparison protects operator edits and competing enrichments.
 * The update cannot resurrect a deleted entity. Only fixed table names enter
 * SQL; ids and both image addresses remain bound parameters.
 *
 * @param pool - Runtime query client; no connection is created by this helper.
 * @param kind - Track or album. Any other runtime value is rejected.
 * @param id - Stored entity id.
 * @param expected - Cover observed before enrichment, including null.
 * @param replacement - Allowed cover, or null to remove prohibited artwork.
 * @returns Whether this statement changed the observed row.
 */
export async function replaceRecordingArtwork(
  pool: Pool,
  kind: RecordingKind,
  id: string,
  expected: string | null,
  replacement: string | null,
): Promise<boolean> {
  const table = kind === "track" ? "tracks" : kind === "album" ? "albums" : null;
  if (!table) throw new Error("Unsupported recording kind");
  const result = await pool.query(
    `UPDATE ${table} SET artwork_url = $3, updated_at = $4
     WHERE id = $1 AND artwork_url IS NOT DISTINCT FROM $2 RETURNING id`,
    [id, expected, replacement, new Date()],
  );
  return result.rows.length > 0;
}
