/**
 * @file Track-resolve persistence core.
 *
 * The route handler in `routes/resolve.ts` and the crawler ingest path in
 * `services/crawler/ingest.ts` both need the same DB-side effects after a
 * `ResolutionResult` has been produced: persist the track + its cross-service
 * links, fan out external-ids and per-service preview URLs, and refresh a
 * stale Deezer preview through `refreshTrackPreview` when the resolve result
 * didn't carry a fresh one. A result served from the cache is already stored
 * and skips the rewrite.
 *
 * Keeping this in a single helper means the two callers stay in lock-step.
 * The preview rules themselves live in `lib/preview-url.ts` and the refresh in
 * `preview-refresh.ts`, which the preview endpoint calls as well. The route
 * layer's job collapses to "call this, then build the response shape"; the
 * crawler layer's job collapses to "call this, count the result".
 */

import { getRepository, type TrackRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { isExpiredPreviewUrl, previewObservation } from "../lib/preview-url.js";
import { saveExternalIdsLogged } from "./external-ids.js";
import { refreshTrackPreview } from "./preview-refresh.js";
import { toStoredLinks } from "./resolved-links.js";
import type { ResolutionResult } from "./resolver.js";
import type { ArtistCredit } from "./types.js";

export interface PersistResolutionResult {
  trackId: string;
  shortId: string;
  /** The preview URL that the caller should surface to clients. May be the
   *  resolver's own value, or a freshly-fetched Deezer URL when the
   *  resolver's preview was missing/expired. `undefined` when no preview
   *  could be obtained. */
  refreshedPreviewUrl: string | undefined;
  artistCredits: ArtistCredit[];
}

/**
 * Persists a track resolve result and its side-effects. Idempotent on
 * re-runs of the same `result` (matches existing rows by ISRC / source URL).
 * A result from the cache, recognizable by its stored track id and share id,
 * goes through {@link persistCachedResolution} instead.
 *
 * @param result - resolver output (source track + cross-service links + external-ids)
 * @returns the canonical track-id, share-page short-id, and preview URL
 *          to surface to clients (refreshed for stale Deezer previews).
 */
export async function persistResolution(result: ResolutionResult): Promise<PersistResolutionResult> {
  const repo = await getRepository();

  if (result.trackId && result.shortId) {
    return persistCachedResolution(repo, result, result.trackId, result.shortId);
  }

  const { trackId, shortId, artistCredits } = await repo.persistTrackWithLinks({
    sourceTrack: {
      ...result.sourceTrack,
      sourceUrl: result.sourceTrack.webUrl,
    },
    links: toStoredLinks(result.links, { stripTracking: true }),
  });

  // Aggregate every ISRC observed during the resolve into the
  // `track_external_ids` table. Non-fatal: a write failure here must
  // not break the caller.
  await saveExternalIdsLogged(repo, "track", trackId, result.externalIds, "External-id persist failed:");

  // Persist per-(track, service) preview URLs into `track_previews`.
  // The canonical `tracks` row no longer carries a preview column; reads
  // pull the best preview from `track_previews` via subquery in the
  // adapter SELECTs.
  for (const link of result.links) {
    if (!link.previewUrl) continue;
    try {
      await repo.upsertTrackPreview(trackId, previewObservation(link.service, link.previewUrl));
    } catch (err) {
      log.debug("Resolve", "Preview persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Source-track preview from the originating adapter.
  if (
    result.sourceTrack.previewUrl &&
    result.sourceTrack.sourceService &&
    result.sourceTrack.sourceService !== "cached"
  ) {
    try {
      await repo.upsertTrackPreview(
        trackId,
        previewObservation(result.sourceTrack.sourceService, result.sourceTrack.previewUrl),
      );
    } catch (err) {
      log.debug("Resolve", "Source preview persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Refresh missing or expired Deezer preview URLs before returning so
  // clients (route or crawler) do not surface dead signed preview links.
  let refreshedPreviewUrl: string | undefined = result.sourceTrack.previewUrl ?? undefined;
  if (!refreshedPreviewUrl || isExpiredPreviewUrl(refreshedPreviewUrl)) {
    const fresh = await refreshTrackPreview(repo, {
      trackId,
      isrc: result.sourceTrack.isrc,
      title: result.sourceTrack.title,
      artists: result.sourceTrack.artists,
      durationMs: result.sourceTrack.durationMs,
      links: result.links,
    });
    if (fresh) refreshedPreviewUrl = fresh;
  }

  return { trackId, shortId, refreshedPreviewUrl, artistCredits };
}

/**
 * Finishes a resolve that came from the cache without rewriting the track.
 *
 * The track row, its credits and its links were read from the database, and
 * any link the gap fill found was stored by the resolver as it arrived, along
 * with its preview. The gap fill also refreshed an expired preview, so asking
 * Deezer again here would only repeat it. What is left are the external ids
 * the gap fill observed, and the timestamp that orders text search and the
 * admin track list by the last resolve. The timestamp is written in the
 * background, because nothing in the response depends on it.
 *
 * @param repo - The repository the result was read from.
 * @param result - A resolve that carries the stored track id and share id.
 * @param trackId - The stored track id.
 * @param shortId - The stored share id.
 * @returns The stored ids, the preview the resolver chose, and the stored credits.
 */
async function persistCachedResolution(
  repo: TrackRepository,
  result: ResolutionResult,
  trackId: string,
  shortId: string,
): Promise<PersistResolutionResult> {
  await saveExternalIdsLogged(repo, "track", trackId, result.externalIds, "External-id persist failed:");

  void repo
    .updateTrackTimestamp(trackId)
    .catch((err) =>
      log.debug("Resolve", "Track timestamp update failed:", err instanceof Error ? err.message : String(err)),
    );

  return {
    trackId,
    shortId,
    refreshedPreviewUrl: result.sourceTrack.previewUrl,
    artistCredits: result.sourceTrack.artistCredits ?? [],
  };
}
