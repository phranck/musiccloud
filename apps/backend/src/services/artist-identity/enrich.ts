/**
 * @file Fills artist entities' type, lifecycle dates and band memberships from
 * MusicBrainz, a bounded batch at a time.
 *
 * Identity is exact or not at all. An entity is looked up by the MusicBrainz id
 * it already carries, or by its Spotify or Deezer artist page, which
 * MusicBrainz maps to its own artist. There is no search by name, because two
 * artists share a name and a wrong birthday on a real person is worse than
 * none.
 */

import type { ArtistIdentityCandidate, ArtistIdentityCheckOutcome, TrackRepository } from "../../db/repository.js";
import { log } from "../../lib/infra/logger.js";
import { ResolveError } from "../../lib/resolve/errors.js";
import { fetchMusicBrainzIdentity, findMusicBrainzIdForUrl } from "./musicbrainz-identity.js";

/**
 * How many entities one run checks. At most three MusicBrainz requests each
 * (two page lookups and the artist) under the one-per-1.1-second gate, a
 * full batch stays well inside the ten minutes between two runs.
 */
export const IDENTITY_BATCH_SIZE = 40;

/**
 * How long a check holds before the entity is asked about again. Dates and
 * line-ups change rarely, and an artist MusicBrainz did not know may have been
 * added since.
 */
export const IDENTITY_RECHECK_DAYS = 90;

/** How long a check that failed waits, so an outage is retried the next day rather than in a quarter. */
export const IDENTITY_RETRY_FAILED_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/** The artist page URL MusicBrainz records for a service, built from the service's own id. */
const ARTIST_PAGE_URL: Partial<Record<string, (externalId: string) => string>> = {
  spotify: (externalId) => `https://open.spotify.com/artist/${externalId}`,
  deezer: (externalId) => `https://www.deezer.com/artist/${externalId}`,
};

/**
 * The artist page URLs to ask MusicBrainz about, in the form MusicBrainz
 * stores them. A link with the service's id is rebuilt from it, because a
 * stored URL may carry a locale path or a query that MusicBrainz's exact
 * lookup does not match.
 *
 * @param links - The entity's Spotify and Deezer links.
 * @returns One URL per link, in the order given.
 */
export function artistPageUrls(links: ArtistIdentityCandidate["serviceLinks"]): string[] {
  return links.map((link) => {
    const build = ARTIST_PAGE_URL[link.service];
    return build && link.externalId ? build(link.externalId) : link.url;
  });
}

/**
 * The MusicBrainz id of a candidate: the one it carries, or the first its
 * artist pages map to.
 */
async function musicBrainzIdFor(candidate: ArtistIdentityCandidate): Promise<string | null> {
  if (candidate.musicBrainzId) return candidate.musicBrainzId;
  for (const url of artistPageUrls(candidate.serviceLinks)) {
    const musicBrainzId = await findMusicBrainzIdForUrl(url);
    if (musicBrainzId) return musicBrainzId;
  }
  return null;
}

/**
 * Checks one entity against MusicBrainz and records what came of it. A failure
 * is recorded and logged rather than thrown, so one artist cannot stop the
 * batch.
 */
async function enrichCandidate(
  repo: TrackRepository,
  candidate: ArtistIdentityCandidate,
  checkedAt: Date,
): Promise<ArtistIdentityCheckOutcome> {
  try {
    const musicBrainzId = await musicBrainzIdFor(candidate);
    const snapshot = musicBrainzId ? await fetchMusicBrainzIdentity(musicBrainzId) : null;
    if (!snapshot) {
      await repo.recordArtistIdentityCheck(candidate.artistEntityId, "no_match", checkedAt);
      return "no_match";
    }
    return await repo.recordArtistIdentity(candidate.artistEntityId, snapshot, checkedAt);
  } catch (error) {
    log.deviation(
      {
        component: "ArtistIdentityEnrichment",
        errorCode: error instanceof ResolveError ? error.code : "MC-SYS-0001",
        operation: "artist_identity_check",
        outcome: "check_recorded_as_failed",
        artistEntityId: candidate.artistEntityId,
      },
      error,
    );
    await repo.recordArtistIdentityCheck(candidate.artistEntityId, "failed", checkedAt);
    return "failed";
  }
}

/**
 * Checks the next batch of due artist entities against MusicBrainz.
 *
 * @param repo - The repository the candidates come from and the results go to.
 * @param now - The moment the checks are dated with and due times count back from.
 * @param limit - The most entities to check.
 * @returns How many checks came to each outcome.
 */
export async function enrichArtistIdentities(
  repo: TrackRepository,
  now: Date = new Date(),
  limit: number = IDENTITY_BATCH_SIZE,
): Promise<Record<ArtistIdentityCheckOutcome, number>> {
  const candidates = await repo.listArtistIdentityCandidates({
    limit,
    recheckBefore: new Date(now.getTime() - IDENTITY_RECHECK_DAYS * 24 * HOUR_MS),
    retryFailedBefore: new Date(now.getTime() - IDENTITY_RETRY_FAILED_HOURS * HOUR_MS),
  });

  const outcomes: Record<ArtistIdentityCheckOutcome, number> = { matched: 0, no_match: 0, conflict: 0, failed: 0 };
  for (const candidate of candidates) {
    outcomes[await enrichCandidate(repo, candidate, now)] += 1;
  }
  return outcomes;
}
