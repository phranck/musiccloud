import type { VinylLayout } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { createAlbumIdentityKey } from "./album-identity.js";

/** The narrow persistence surface used to attach a track to an album layout. */
export interface TrackVinylLayoutRepository {
  findAlbumByVinylLayoutIdentity(identityKey: string): Promise<{ albumId: string } | null>;
  ensureAlbumVinylLayoutIdentity(identityKey: string, albumId: string): Promise<string>;
  createAlbumVinylLayoutPlaceholder(title: string): Promise<string>;
  deleteAlbumVinylLayoutPlaceholder(albumId: string): Promise<void>;
  readAlbumVinylLayout(albumId: string): Promise<VinylLayout | null | undefined>;
  enrichAlbumVinylLayout(album: { id: string; title: string; artists: string[] }): Promise<void>;
}

/**
 * Reads a previously checked Discogs layout by artist-qualified album identity.
 * It never creates an album, calls Discogs, or changes cache state, so it is safe
 * for persistent share-page reads.
 */
export async function readCachedAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  try {
    const cached = await repo.findAlbumByVinylLayoutIdentity(identityKey);
    if (!cached) return null;
    return (await repo.readAlbumVinylLayout(cached.albumId)) ?? null;
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
 */
export async function refreshAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  let albumId: string | undefined;
  let placeholderId: string | undefined;
  let cachedLayout: VinylLayout | null | undefined;
  try {
    const cached = await repo.findAlbumByVinylLayoutIdentity(identityKey);
    albumId = cached?.albumId;
    if (!albumId) {
      placeholderId = await repo.createAlbumVinylLayoutPlaceholder(album.title);
      albumId = await repo.ensureAlbumVinylLayoutIdentity(identityKey, placeholderId);
      if (albumId !== placeholderId) await repo.deleteAlbumVinylLayoutPlaceholder(placeholderId);
    }

    cachedLayout = await repo.readAlbumVinylLayout(albumId);
    await repo.enrichAlbumVinylLayout({ id: albumId, title: album.title, artists: album.artists });
    const refreshedLayout = await repo.readAlbumVinylLayout(albumId);
    return refreshedLayout === undefined ? (cachedLayout ?? null) : refreshedLayout;
  } catch (error) {
    if (typeof placeholderId !== "undefined" && albumId !== placeholderId) {
      try {
        await repo.deleteAlbumVinylLayoutPlaceholder(placeholderId);
      } catch (cleanupError) {
        log.deviation(
          {
            component: "VinylLayout",
            errorCode: "MC-DB-0004",
            operation: "vinyl_layout_placeholder_cleanup",
            outcome: "orphan_placeholder_possible",
          },
          cleanupError,
        );
      }
    }
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
 * artist is part of the cache identity, making a title-only cross-artist match
 * impossible. Every failure remains non-fatal for the track resolve.
 */
export async function resolveTrackVinylLayout(
  repo: TrackVinylLayoutRepository,
  track: { artists: string[]; albumName?: string },
): Promise<VinylLayout | null> {
  if (!track.albumName) return null;

  return resolveAlbumVinylLayout(repo, { artists: track.artists, title: track.albumName });
}

/**
 * Gets the shared Discogs layout for an artist-qualified album identity. This is
 * the common cache and enrichment path used by commercial and CC album sources.
 */
export async function resolveAlbumVinylLayout(
  repo: TrackVinylLayoutRepository,
  album: { artists: string[]; title: string },
): Promise<VinylLayout | null> {
  const identityKey = createAlbumIdentityKey(album);
  if (!identityKey) return null;

  let albumId: string | undefined;
  let placeholderId: string | undefined;
  try {
    const cached = await repo.findAlbumByVinylLayoutIdentity(identityKey);
    albumId = cached?.albumId;
    if (!albumId) {
      placeholderId = await repo.createAlbumVinylLayoutPlaceholder(album.title);
      albumId = await repo.ensureAlbumVinylLayoutIdentity(identityKey, placeholderId);
      if (albumId !== placeholderId) await repo.deleteAlbumVinylLayoutPlaceholder(placeholderId);
    }

    const cachedLayout = await repo.readAlbumVinylLayout(albumId);
    if (cachedLayout !== undefined) return cachedLayout;

    await repo.enrichAlbumVinylLayout({ id: albumId, title: album.title, artists: album.artists });
    return (await repo.readAlbumVinylLayout(albumId)) ?? null;
  } catch (error) {
    // A failed identity claim can only leave behind the freshly-created,
    // unclaimed placeholder. Retain a claimed owner so a transient Discogs
    // failure remains retryable, but remove every losing placeholder.
    if (typeof placeholderId !== "undefined" && albumId !== placeholderId) {
      try {
        await repo.deleteAlbumVinylLayoutPlaceholder(placeholderId);
      } catch (cleanupError) {
        log.deviation(
          {
            component: "VinylLayout",
            errorCode: "MC-DB-0004",
            operation: "vinyl_layout_placeholder_cleanup",
            outcome: "orphan_placeholder_possible",
          },
          cleanupError,
        );
      }
    }
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
