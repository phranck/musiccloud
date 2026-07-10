import type { VinylLayout } from "@musiccloud/shared";
import { log } from "../lib/infra/logger.js";
import { createAlbumIdentityKey } from "./album-identity.js";

/** The narrow persistence surface used to attach a track to an album layout. */
export interface TrackVinylLayoutRepository {
  findAlbumByVinylLayoutIdentity(identityKey: string): Promise<{ albumId: string } | null>;
  ensureAlbumVinylLayoutIdentity(identityKey: string, albumId: string): Promise<string>;
  persistAlbumWithLinks(data: {
    sourceAlbum: { title: string; artists: string[] };
    links: [];
  }): Promise<{ albumId: string }>;
  readAlbumVinylLayout(albumId: string): Promise<VinylLayout | null | undefined>;
  enrichAlbumVinylLayout(album: { id: string; title: string; artists: string[] }): Promise<void>;
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

  const identityKey = createAlbumIdentityKey({ artists: track.artists, title: track.albumName });
  if (!identityKey) return null;

  try {
    const cached = await repo.findAlbumByVinylLayoutIdentity(identityKey);
    const persistedAlbumId =
      cached?.albumId ??
      (
        await repo.persistAlbumWithLinks({
          sourceAlbum: { title: track.albumName, artists: track.artists },
          links: [],
        })
      ).albumId;
    const albumId = cached?.albumId ?? (await repo.ensureAlbumVinylLayoutIdentity(identityKey, persistedAlbumId));

    const cachedLayout = await repo.readAlbumVinylLayout(albumId);
    if (cachedLayout !== undefined) return cachedLayout;

    await repo.enrichAlbumVinylLayout({ id: albumId, title: track.albumName, artists: track.artists });
    return (await repo.readAlbumVinylLayout(albumId)) ?? null;
  } catch (error) {
    log.debug(
      "Resolve",
      "Track vinyl-layout enrichment failed:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
