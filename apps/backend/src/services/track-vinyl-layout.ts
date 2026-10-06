import type { VinylLayout } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { createAlbumIdentityKey } from "./album-identity.js";

/** The narrow persistence surface used to read and refresh a vinyl layout. */
export interface TrackVinylLayoutRepository {
  readVinylLayout(identityKey: string): Promise<VinylLayout | null | undefined>;
  enrichVinylLayout(album: { identityKey: string; title: string; artists: string[]; albumId?: string }): Promise<void>;
}

/**
 * How long an identity whose enrichment stored nothing waits before it is tried
 * again. Discogs requests share one process-wide queue spaced 1.1 s apart, and
 * an incomplete release or an outage answers the same way on the next attempt,
 * so retrying on every resolve would only hold up the enrichments behind it.
 */
const VINYL_ENRICHMENT_RETRY_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const enrichmentsInFlight = new Map<string, Promise<void>>();
const unsuccessfulAttemptAt = new Map<string, number>();

/**
 * Reads a previously checked Discogs layout by artist-qualified album identity.
 * It never calls Discogs or changes cache state, so it is safe for persistent
 * share-page reads.
 */
export async function readCachedAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  try {
    return (await repo.readVinylLayout(identityKey)) ?? null;
  } catch (error) {
    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-DB-0004",
        operation: "vinyl_layout_cache_read",
        outcome: "layout_omitted",
      },
      error,
    );
    return null;
  }
}

/**
 * Gets the Discogs layout belonging to a resolved track's album. The primary
 * artist is part of the cache identity, so a title-only cross-artist match is
 * impossible. Every failure stays non-fatal for the track resolve.
 */
export async function resolveTrackVinylLayout(
  repo: TrackVinylLayoutRepository,
  track: { artists: string[]; albumName?: string },
): Promise<VinylLayout | null> {
  if (!track.albumName) return null;

  return resolveAlbumVinylLayout(repo, { artists: track.artists, title: track.albumName });
}

/**
 * Gets the shared Discogs layout for an artist-qualified album identity. This
 * is the common read path for commercial and CC resolves and CC share pages: a
 * stored answer is returned as it stands, including a negative one.
 *
 * It never waits for Discogs. An identity that has never been checked answers
 * `null` at once and starts the enrichment in the background, so the layout
 * appears from the next request on. The site's responsiveness depends on this:
 * one enrichment takes at least three Discogs requests through a queue spaced
 * 1.1 s apart.
 *
 * @param albumId - The catalogue album, where one exists, so the Discogs
 *   release id can be recorded as an external id.
 * @returns The stored layout, or `null` when none is stored yet or none exists.
 */
export async function resolveAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string; albumId?: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  try {
    const cachedLayout = await repo.readVinylLayout(identityKey);
    if (cachedLayout !== undefined) return cachedLayout;

    scheduleVinylLayoutEnrichment(repo, {
      identityKey,
      title: album.title,
      artists: album.artists,
      albumId: album.albumId,
    });
    return null;
  } catch (error) {
    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-DB-0004",
        operation: "vinyl_layout_cache_read",
        outcome: "layout_omitted",
      },
      error,
    );
    return null;
  }
}

/**
 * Starts a background enrichment for an unchecked identity, unless one is
 * already running for it or an unsuccessful attempt is still inside its
 * cooldown.
 *
 * @param repo - Persistence used for the enrichment and the follow-up read.
 * @param album - The identity and the album metadata Discogs is queried with.
 */
function scheduleVinylLayoutEnrichment(
  repo: TrackVinylLayoutRepository,
  album: { identityKey: string; title: string; artists: string[]; albumId?: string },
): void {
  const { identityKey } = album;
  if (enrichmentsInFlight.has(identityKey)) return;

  const lastUnsuccessfulAttempt = unsuccessfulAttemptAt.get(identityKey);
  if (
    lastUnsuccessfulAttempt !== undefined &&
    Date.now() - lastUnsuccessfulAttempt < VINYL_ENRICHMENT_RETRY_COOLDOWN_MS
  ) {
    return;
  }

  const enrichment = runVinylLayoutEnrichment(repo, album).finally(() => {
    enrichmentsInFlight.delete(identityKey);
  });
  enrichmentsInFlight.set(identityKey, enrichment);
}

/**
 * Runs one enrichment and records whether it stored an answer. Nothing it does
 * may reject: it runs detached from any request.
 */
async function runVinylLayoutEnrichment(
  repo: TrackVinylLayoutRepository,
  album: { identityKey: string; title: string; artists: string[]; albumId?: string },
): Promise<void> {
  try {
    await repo.enrichVinylLayout(album);
    const stored = await repo.readVinylLayout(album.identityKey);
    if (stored === undefined) {
      recordUnsuccessfulAttempt(album.identityKey);
    } else {
      unsuccessfulAttemptAt.delete(album.identityKey);
    }
  } catch (error) {
    recordUnsuccessfulAttempt(album.identityKey);
    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-SYS-0001",
        operation: "vinyl_layout_enrichment",
        outcome: "layout_omitted",
      },
      error,
    );
  }
}

/**
 * Remembers an attempt that stored nothing and drops entries whose cooldown has
 * passed, so the map holds only identities that are currently suppressed.
 */
function recordUnsuccessfulAttempt(identityKey: string): void {
  const now = Date.now();
  for (const [key, attemptedAt] of unsuccessfulAttemptAt) {
    if (now - attemptedAt >= VINYL_ENRICHMENT_RETRY_COOLDOWN_MS) unsuccessfulAttemptAt.delete(key);
  }
  unsuccessfulAttemptAt.set(identityKey, now);
}
