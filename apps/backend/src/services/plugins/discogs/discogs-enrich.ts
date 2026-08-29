/**
 * Discogs vinyl-layout enrichment orchestration.
 *
 * Coordinates the Discogs client, pure layout normalisation, and persistence
 * without allowing a transient remote failure to create a negative cache.
 */

import type { Pool } from "pg";
import { upsertVinylLayout } from "../../../db/adapters/postgres-albums.js";
import { insertExternalIds } from "../../../db/adapters/postgres-shared.js";
import { log } from "../../../lib/infra/logger.js";
import { getMasterVinylVersions, getRelease, isDiscogsConfigured, searchVinylMaster } from "./discogs-client.js";
import { normalizeReleaseToLayout, selectOriginalVinylVersion } from "./discogs-parse.js";

/**
 * Looks up, normalises, and persists an album's original Discogs vinyl layout.
 *
 * Definitive missing masters or versions create a negative cache entry.
 * Incomplete release data plus client and persistence failures are transient,
 * so they are deliberately swallowed without writing a cache entry and can be
 * retried by a future resolve.
 *
 * @param pool - Postgres connection pool used by the persistence helpers.
 * @param album - Persisted album metadata used to query Discogs.
 * @returns A promise that resolves after enrichment or a best-effort no-op.
 */
export async function enrichVinylLayout(
  pool: Pool,
  album: { identityKey: string; title: string; artists: string[]; albumId?: string; upc?: string | null },
): Promise<void> {
  if (!isDiscogsConfigured()) {
    return;
  }

  try {
    const masterId = await searchVinylMaster({ artist: album.artists[0] ?? "", title: album.title });
    if (masterId === null) {
      await upsertVinylLayout(pool, album.identityKey, null);
      return;
    }

    const version = selectOriginalVinylVersion(await getMasterVinylVersions(masterId));
    if (version === null) {
      await upsertVinylLayout(pool, album.identityKey, null);
      return;
    }

    const layout = normalizeReleaseToLayout(await getRelease(version.id));
    if (layout === null) {
      return;
    }

    // The Discogs release id belongs to an album record. A layout is often
    // fetched for a track whose album is not in the catalogue, and then there
    // is nothing to attach it to.
    if (album.albumId) {
      await insertExternalIds(pool, "album_external_ids", "album_id", album.albumId, [
        { idType: "discogs_release", idValue: layout.discogsReleaseId, sourceService: "discogs" },
      ]);
    }
    await upsertVinylLayout(pool, album.identityKey, layout);
  } catch (error) {
    // A failed Discogs or persistence operation must remain retryable.
    log.deviation(
      {
        albumId: album.albumId ?? null,
        component: "Discogs",
        errorCode: "MC-SYS-0001",
        operation: "discogs_vinyl_layout_enrichment",
        outcome: "retryable_without_negative_cache",
      },
      error,
    );
  }
}
