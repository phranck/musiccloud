/**
 * Page segments: the sub-page layout entries an owner page lists, read and
 * replaced per owner, plus the segment step of the dashboard's bulk save.
 *
 * `postgres-content-pages.ts` re-exports `listSegmentsForOwner` and
 * `replaceSegmentsForOwner`, so importers keep using that module.
 */

import type { Pool, PoolClient } from "pg";
import type { BulkUpdatePagesPayload, PageSegmentInputRow, PageSegmentRow } from "../admin-repository.js";

// ============================================================================
// PAGE SEGMENTS
// ============================================================================

/**
 * Lists every segment row for one owner page, ordered by `position`.
 */
export async function listSegmentsForOwner(pool: Pool, ownerSlug: string): Promise<PageSegmentRow[]> {
  const result = await pool.query<{
    id: number;
    owner_slug: string;
    target_slug: string;
    position: number;
    label: string;
    label_updated_at: Date;
  }>(
    `SELECT id, owner_slug, target_slug, position, label, label_updated_at
     FROM page_segments
     WHERE owner_slug = $1
     ORDER BY position ASC`,
    [ownerSlug],
  );
  return result.rows.map((r) => ({
    id: r.id,
    ownerSlug: r.owner_slug,
    targetSlug: r.target_slug,
    position: r.position,
    label: r.label,
    labelUpdatedAt: r.label_updated_at,
  }));
}

/**
 * Atomically replaces every segment row for one owner page (delete-all
 * + insert in tx). Returns the freshly persisted rows sorted by
 * `position`.
 */
export async function replaceSegmentsForOwner(
  pool: Pool,
  ownerSlug: string,
  segments: PageSegmentInputRow[],
): Promise<PageSegmentRow[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
    const rows: PageSegmentRow[] = [];
    for (const s of segments) {
      const r = await client.query<{ id: number; label_updated_at: Date }>(
        `INSERT INTO page_segments (owner_slug, target_slug, position, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id, label_updated_at`,
        [ownerSlug, s.targetSlug, s.position, s.label],
      );
      rows.push({
        id: r.rows[0].id,
        ownerSlug,
        targetSlug: s.targetSlug,
        position: s.position,
        label: s.label,
        labelUpdatedAt: r.rows[0].label_updated_at,
      });
    }
    await client.query("COMMIT");
    return rows.sort((a, b) => a.position - b.position);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Replaces the segments of every owner in a bulk save, inside the transaction
 * `bulkUpdatePages` holds. Each owner's rows are deleted and its new rows
 * inserted, with `label_updated_at` set to now.
 *
 * @param client - The client of the caller's transaction.
 * @param entries - The payload's segment lists, one per owner page.
 * @returns Resolves once every owner's segments are written.
 */
export async function replaceSegmentsInBulkSave(
  client: PoolClient,
  entries: BulkUpdatePagesPayload["segments"],
): Promise<void> {
  for (const entry of entries) {
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [entry.ownerSlug]);
    for (const segment of entry.segments) {
      await client.query(
        `INSERT INTO page_segments (owner_slug, target_slug, position, label, label_updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
        [entry.ownerSlug, segment.targetSlug, segment.position, segment.label],
      );
    }
  }
}
