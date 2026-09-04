/**
 * @file Persists a resolution and shapes the `UnifiedResolveSuccess` response.
 *
 * Both resolve operations end here: `POST /api/v1/resolve` and its one-request
 * companion `GET /api/v1/resolve`. They accept different input and offer
 * different follow-ups, but a resolved track, album or artist has to come back
 * identical from either, because the two are documented as the same operation
 * in two shapes and a caller may move between them.
 *
 * That is why these three live beside the resolvers rather than inside one
 * route: a second copy in the other route drifts, and the field that drifts is
 * not obvious from either side. `releaseDate` is the example to keep in mind,
 * because `normalizeReleaseDate` drops a bare year and cuts a timestamp back to
 * a date, so a copy that skips it returns a different string for the same
 * recording.
 *
 * Every write past the main persist call is non-fatal. External ids, previews
 * and vinyl layouts enrich a response that is already correct without them, so
 * a failure there is logged and the resolve still succeeds.
 */
import type { UnifiedResolveSuccessResponse } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { getPreviewExpiry } from "../lib/preview-url.js";
import { normalizeReleaseDate } from "../lib/release-date.js";
import { toApiLinks } from "../lib/server/api-links.js";
import { createAlbumIdentityKey } from "./album-identity.js";
import type { AlbumResolutionResult } from "./album-resolver.js";
import type { ArtistResolutionResult } from "./artist-resolver.js";
import { persistResolution } from "./persist-resolution.js";
import type { ResolutionResult } from "./resolver.js";
import { resolveTrackVinylLayout } from "./track-vinyl-layout.js";

/**
 * Persists a resolved track with its cross-service links and returns the track
 * variant of the unified response.
 *
 * @param result - The resolver's output for one recording, carrying the source
 *   track, the matched links, and any external ids observed along the way.
 * @param origin - Public origin the share URL is built on. It comes from
 *   configuration rather than from the request, so a share URL always points at
 *   the public site whichever host answered.
 * @returns The `track` variant, including the persisted id and share URL.
 */
export async function persistTrackAndRespond(
  result: ResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const { trackId, shortId, refreshedPreviewUrl, artistCredits } = await persistResolution(result);
  const repo = await getRepository();
  const vinylLayout = await resolveTrackVinylLayout(repo, result.sourceTrack);
  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "track",
    id: trackId,
    shortUrl,
    track: {
      title: result.sourceTrack.title,
      artists: result.sourceTrack.artists,
      artistCredits,
      albumName: result.sourceTrack.albumName,
      artworkUrl: result.sourceTrack.artworkUrl,
      durationMs: result.sourceTrack.durationMs,
      isrc: result.sourceTrack.isrc,
      releaseDate: normalizeReleaseDate(result.sourceTrack.releaseDate) ?? undefined,
      isExplicit: result.sourceTrack.isExplicit,
      previewUrl: refreshedPreviewUrl,
      vinylLayout,
    },
    links: toApiLinks(result.links, { stripTracking: true }),
  };
}

/**
 * Persists a resolved album with its cross-service links and returns the album
 * variant of the unified response.
 *
 * @param result - The resolver's output for one album.
 * @param origin - Public origin the share URL is built on.
 * @returns The `album` variant, including the persisted id and share URL.
 */
export async function persistAlbumAndRespond(
  result: AlbumResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  let previewUrl = result.sourceAlbum.topTrackPreviewUrl;
  let previewService: string | null = previewUrl ? (result.sourceAlbum.sourceService ?? null) : null;
  if (!previewUrl) {
    const deezerLink = result.links.find((l) => l.service === "deezer" && l.topTrackPreviewUrl);
    if (deezerLink?.topTrackPreviewUrl) {
      previewUrl = deezerLink.topTrackPreviewUrl;
      previewService = "deezer";
    }
  }

  const { albumId, shortId, artistCredits } = await repo.persistAlbumWithLinks({
    sourceAlbum: {
      ...result.sourceAlbum,
      sourceUrl: result.sourceAlbum.webUrl,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  // Persist the resolved album preview into `album_previews`. The
  // canonical `albums` row no longer carries a preview column; reads
  // pull the best preview from `album_previews` via subquery.
  if (previewUrl && previewService) {
    const expiresAtMs = getPreviewExpiry(previewUrl, previewService);
    try {
      await repo.upsertAlbumPreview(albumId, {
        service: previewService,
        url: previewUrl,
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
      });
    } catch (err) {
      log.debug("Resolve", "Album preview persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  if (result.externalIds.length > 0) {
    try {
      await repo.addAlbumExternalIds(albumId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "Album external-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const albumIdentity = createAlbumIdentityKey({
    artists: result.sourceAlbum.artists,
    title: result.sourceAlbum.title,
  });

  if (albumIdentity && !result.albumId) {
    try {
      await repo.enrichVinylLayout({
        identityKey: albumIdentity,
        title: result.sourceAlbum.title,
        artists: result.sourceAlbum.artists,
        albumId,
        upc: result.sourceAlbum.upc,
      });
    } catch (err) {
      log.debug("Resolve", "Album vinyl-layout enrichment failed:", err instanceof Error ? err.message : String(err));
    }
  }
  const vinylLayout = albumIdentity ? await repo.readVinylLayout(albumIdentity) : undefined;

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "album",
    id: albumId,
    shortUrl,
    album: {
      title: result.sourceAlbum.title,
      artists: result.sourceAlbum.artists,
      artistCredits,
      releaseDate: normalizeReleaseDate(result.sourceAlbum.releaseDate) ?? undefined,
      totalTracks: result.sourceAlbum.totalTracks,
      artworkUrl: result.sourceAlbum.artworkUrl,
      label: result.sourceAlbum.label,
      upc: result.sourceAlbum.upc,
      previewUrl,
      vinylLayout: vinylLayout ?? null,
    },
    links: toApiLinks(result.links, { stripTracking: true }),
  };
}

/**
 * Persists a resolved artist with its cross-service links and returns the
 * artist variant of the unified response.
 *
 * @param result - The resolver's output for one artist.
 * @param origin - Public origin the share URL is built on.
 * @returns The `artist` variant, including the persisted id and share URL.
 */
export async function persistArtistAndRespond(
  result: ArtistResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  const { artistId, shortId } = await repo.persistArtistWithLinks({
    sourceArtist: {
      ...result.sourceArtist,
      sourceUrl: result.sourceArtist.webUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  if (result.externalIds.length > 0) {
    try {
      await repo.addArtistExternalIds(artistId, result.externalIds);
    } catch (err) {
      log.debug("Resolve", "Artist external-id persist failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "artist",
    id: artistId,
    shortUrl,
    artist: {
      name: result.sourceArtist.name,
      imageUrl: result.sourceArtist.imageUrl,
      genres: result.sourceArtist.genres,
    },
    links: toApiLinks(result.links, { stripTracking: true }),
  };
}
