import type { VinylLayout } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { createAlbumIdentityKey } from "./album-identity.js";

/** The narrow persistence surface used to read and refresh a vinyl layout. */
export interface TrackVinylLayoutRepository {
  readVinylLayout(identityKey: string): Promise<VinylLayout | null | undefined>;
  enrichVinylLayout(album: { identityKey: string; title: string; artists: string[]; albumId?: string }): Promise<void>;
}

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
 * Forces a fresh Discogs lookup for an artist-qualified album identity while
 * retaining the previous cached layout when the refresh fails transiently.
 *
 * @param albumId - The catalogue album, where one exists. It only decides
 *   whether the Discogs release id can be recorded as an external id; the
 *   layout itself belongs to the identity either way.
 */
export async function refreshAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string; albumId?: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  let cachedLayout: VinylLayout | null | undefined;
  try {
    cachedLayout = await repo.readVinylLayout(identityKey);
    await repo.enrichVinylLayout({
      identityKey,
      title: album.title,
      artists: album.artists,
      albumId: album.albumId,
    });
    const refreshedLayout = await repo.readVinylLayout(identityKey);
    return refreshedLayout === undefined ? (cachedLayout ?? null) : refreshedLayout;
  } catch (error) {
    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-SYS-0001",
        operation: "vinyl_layout_refresh",
        outcome: cachedLayout ? "cached_fallback" : "layout_omitted",
      },
      error,
    );
    return cachedLayout ?? null;
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
 * is the common cache and enrichment path used by commercial and CC album
 * sources: a cached answer is returned as it stands, including a negative one,
 * and only an identity that has never been checked reaches Discogs.
 *
 * @param albumId - The catalogue album, where one exists, so the Discogs
 *   release id can be recorded as an external id.
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

    await repo.enrichVinylLayout({
      identityKey,
      title: album.title,
      artists: album.artists,
      albumId: album.albumId,
    });
    return (await repo.readVinylLayout(identityKey)) ?? null;
  } catch (error) {
    log.deviation(
      {
        component: "VinylLayout",
        errorCode: "MC-SYS-0001",
        operation: "vinyl_layout_enrichment",
        outcome: "layout_omitted",
      },
      error,
    );
    return null;
  }
}
