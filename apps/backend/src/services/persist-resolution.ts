/**
 * @file Track-resolve persistence core.
 *
 * The route handler in `routes/resolve.ts` and the crawler ingest path in
 * `services/crawler/ingest.ts` both need the same DB-side effects after a
 * `ResolutionResult` has been produced: persist the track + its cross-service
 * links, fan out external-ids and per-service preview URLs, and refresh a
 * stale Deezer preview when the resolve result didn't carry a fresh one. A
 * result served from the cache is already stored and skips the rewrite.
 *
 * Keeping this in a single helper means the two callers stay in lock-step:
 * a fix to one preview-handling rule cannot accidentally land in only one
 * persist path. The route layer's job collapses to "call this, then build
 * the response shape"; the crawler layer's job collapses to "call this,
 * count the result".
 */

import { getRepository, type TrackRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { getPreviewExpiry, isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { deezerAdapter } from "./plugins/deezer/adapter.js";
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
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  // Aggregate every ISRC observed during the resolve into the
  // `track_external_ids` table. Non-fatal: a write failure here must
  // not break the caller.
  if (result.externalIds.length > 0) {
    try {
      await repo.addTrackExternalIds(trackId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "External-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Persist per-(track, service) preview URLs into `track_previews`.
  // The canonical `tracks` row no longer carries a preview column; reads
  // pull the best preview from `track_previews` via subquery in the
  // adapter SELECTs.
  for (const link of result.links) {
    if (!link.previewUrl) continue;
    const expiresAtMs = getPreviewExpiry(link.previewUrl, link.service);
    try {
      await repo.upsertTrackPreview(trackId, {
        service: link.service,
        url: link.previewUrl,
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
      });
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
    const expiresAtMs = getPreviewExpiry(result.sourceTrack.previewUrl, result.sourceTrack.sourceService);
    try {
      await repo.upsertTrackPreview(trackId, {
        service: result.sourceTrack.sourceService,
        url: result.sourceTrack.previewUrl,
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
      });
    } catch (err) {
      log.debug("Resolve", "Source preview persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  // Refresh missing or expired Deezer preview URLs before returning so
  // clients (route or crawler) do not surface dead signed preview links.
  let refreshedPreviewUrl: string | undefined = result.sourceTrack.previewUrl ?? undefined;
  if (
    (!refreshedPreviewUrl || isExpiredDeezerPreviewUrl(refreshedPreviewUrl)) &&
    result.sourceTrack.isrc &&
    deezerAdapter.isAvailable()
  ) {
    try {
      const deezerTrack = await deezerAdapter.findByIsrc(result.sourceTrack.isrc);
      if (deezerTrack?.previewUrl) {
        const expiresAtMs = getPreviewExpiry(deezerTrack.previewUrl, "deezer");
        await repo.upsertTrackPreview(trackId, {
          service: "deezer",
          url: deezerTrack.previewUrl,
          expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
        });
        refreshedPreviewUrl = deezerTrack.previewUrl;
      }
    } catch (err) {
      log.debug("Resolve", "Deezer preview enrichment failed:", err instanceof Error ? err.message : String(err));
    }
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
  if (result.externalIds.length > 0) {
    try {
      await repo.addTrackExternalIds(trackId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "External-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

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
