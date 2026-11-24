/**
 * @file Stores the links, identifiers and previews a track resolve produced.
 *
 * The cached gap fill in `cache.ts` stores each of its batches here, and
 * `resolve-response.ts` hands the late links of a fresh resolve to
 * {@link persistLateTrackLinks} once the track row exists.
 */
import { getRepository } from "../../db/index.js";
import { log } from "../../lib/infra/logger.js";
import { previewObservation } from "../../lib/preview-url.js";
import { collectTrackExternalIds } from "../external-ids.js";
import { keepRecordingArtwork } from "../recording-artwork.js";
import { toStoredLinks } from "../resolved-links.js";
import type { ResolutionResult, ResolvedLink } from "./types.js";

/**
 * Stores links and every identifier/preview observation in a completed batch.
 * Cover policy is applied separately by the cached or late-result owner.
 *
 * @param trackId - The persisted track.
 * @param links - Links to add or replace, one per service.
 * @param observations - All validated metadata, including covered services
 *   refreshed only for artwork or preview. Identifiers retain provider provenance.
 *   Preview expiry is parsed; null means that no expiry was encoded.
 * @returns A promise that settles once the writes are done or given up on. It
 *   never rejects: the response it belongs to is already correct without them.
 */
export async function persistTrackLinks(
  trackId: string,
  links: readonly ResolvedLink[],
  observations: readonly ResolvedLink[],
): Promise<void> {
  if (links.length > 0) {
    try {
      const repo = await getRepository();
      await repo.addLinksToTrack(trackId, toStoredLinks(links));
      // A service that just produced a link must not keep a miss beside it,
      // or the two tables would assert opposite things about the same pair.
      await repo.clearServiceLinkMisses(
        trackId,
        links.map((l) => l.service),
      );
    } catch (error) {
      log.deviation(
        {
          component: "Resolver",
          errorCode: "MC-DB-0004",
          operation: "track_links_persist",
          outcome: "response_without_link_update",
        },
        error,
      );
    }
  }

  const identifiers = collectTrackExternalIds(undefined, observations);
  if (identifiers.length > 0) {
    try {
      const repository = await getRepository();
      await repository.addTrackExternalIds(trackId, identifiers);
    } catch (error) {
      log.deviation(
        {
          component: "Resolver",
          errorCode: "MC-DB-0004",
          operation: "track_identifier_persist",
          outcome: "links_without_identifier_update",
        },
        error,
      );
    }
  }

  try {
    const repo = await getRepository();
    for (const link of observations) {
      if (!link.previewUrl) continue;
      await repo.upsertTrackPreview(trackId, previewObservation(link.service, link.previewUrl));
    }
  } catch (error) {
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-DB-0004",
        operation: "track_preview_persist",
        outcome: "links_without_preview_update",
      },
      error,
    );
  }
}

/**
 * Stores the links of services that answered after a fresh resolve had already
 * responded. A late YouTube match replaces the search fallback stored in its
 * place. The caller starts this detached once the track is persisted.
 *
 * @param trackId - The track the fresh resolve just persisted.
 * @param lateLinks - The {@link ResolutionResult.lateLinks} of that resolve.
 * @returns A promise that settles once the links are stored. It never rejects.
 */
export async function persistLateTrackLinks(trackId: string, lateLinks: Promise<ResolvedLink[]>): Promise<void> {
  try {
    const links = await lateLinks;
    if (links.length === 0) return;
    await persistTrackLinks(trackId, links, links);
    const repository = await getRepository();
    const stored = await repository.loadByTrackId(trackId);
    if (stored) await keepRecordingArtwork("track", trackId, stored.track.artworkUrl ?? undefined, links);
  } catch (error) {
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-DB-0004",
        operation: "late_track_links_persist",
        outcome: "primary_result_retained",
      },
      error,
    );
  }
}
