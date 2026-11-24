/**
 * @file Serves an album resolve from the database and completes the cached
 * album: the cache lookups, the derived YouTube Music link, the gap fill across
 * missing services, the cover and label backfill and the preview refresh.
 *
 * A cache hit identifies the album, not a complete destination set, so every
 * hit passes through {@link fillMissingAlbumServices}.
 */
import { getRepository } from "../../db/index.js";
import { log } from "../../lib/infra/logger.js";
import { previewObservation } from "../../lib/preview-url.js";
import type { AlbumResolutionResult, ResolvedAlbumLink } from "../album-resolver.js";
import { RECORDING_ARTWORK_LOOKUP_SERVICES } from "../artwork.js";
import { collectAlbumExternalIds } from "../external-ids.js";
import { filterDisabledLinks, getActiveAdapters } from "../index.js";
import { keepRecordingArtwork } from "../recording-artwork.js";
import { fromCachedLinks, isStoredPreviewFresh, toStoredLinks, uniqueAdaptersByService } from "../resolved-links.js";
import type { ServiceLinkLookup } from "../service-link-lookup.js";
import { deriveYouTubeMusicAlbumLink, pickLabelFromLinks, resolveAlbumOnService } from "./matching.js";

/**
 * Looks an album up in the database by its URL, by a link's own service id, or
 * by UPC, in that order, stopping at the first hit.
 *
 * @param lookup - The keys to try. Each one is optional, and an absent key is skipped.
 * @param lookup.url - The album URL, tracking parameters stripped.
 * @param lookup.serviceLink - A service and the external id that service gives the album.
 * @param lookup.upc - The album's Universal Product Code.
 * @returns The cached album with its stored links and an empty `externalIds`
 *   list, or `null` on a miss or when the read fails, so the caller resolves
 *   fresh.
 */
export async function tryAlbumCache(lookup: {
  url?: string;
  serviceLink?: ServiceLinkLookup;
  upc?: string;
}): Promise<AlbumResolutionResult | null> {
  // Static-vs-dynamic split (migration 0021): canonical album row is
  // permanently fresh; preview URL lives in `album_previews` and is
  // refreshed lazily on read. No `updated_at` TTL gate here anymore.
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findAlbumByUrl(lookup.url) : null;
    if (!cached && lookup.serviceLink) {
      cached = await repo.findAlbumByServiceLink(lookup.serviceLink.service, lookup.serviceLink.externalId);
    }
    if (!cached && lookup.upc) cached = await repo.findAlbumByUpc(lookup.upc);
    if (!cached) return null;

    const links: ResolvedAlbumLink[] = fromCachedLinks(cached.links);
    log.debug("AlbumResolver", `Cache hit: ${links.length} links`);

    return { sourceAlbum: cached.album, links, albumId: cached.albumId, shortId: cached.shortId, externalIds: [] };
  } catch (error) {
    log.deviation(
      {
        component: "AlbumResolver",
        errorCode: "MC-DB-0004",
        operation: "album_cache_read",
        outcome: "fresh_resolve_fallback",
      },
      error,
    );
    return null;
  }
}

/**
 * Adds the YouTube Music link a cached YouTube album playlist link implies, and
 * stores it with the album.
 *
 * @param cached - The cached album.
 * @param youtubeAvailable - Whether the YouTube adapter is active. When it is
 *   not, the cached album is returned unchanged.
 * @returns The cached album with the derived link appended, or unchanged when
 *   nothing can be derived. A failed write is logged and the derived link is
 *   still returned.
 */
async function deriveCachedYouTubeMusicLink(
  cached: AlbumResolutionResult,
  youtubeAvailable: boolean,
): Promise<AlbumResolutionResult> {
  if (!youtubeAvailable) return cached;
  const derived = deriveYouTubeMusicAlbumLink(cached.links);
  if (!derived) return cached;
  if (cached.albumId) {
    try {
      const repo = await getRepository();
      await repo.addLinksToAlbum(cached.albumId, toStoredLinks([derived]));
    } catch (error) {
      log.deviation(
        {
          component: "AlbumResolver",
          errorCode: "MC-DB-0004",
          operation: "album_gap_fill_persist",
          outcome: "response_without_cache_update",
        },
        error,
      );
    }
  }
  return { ...cached, links: [...cached.links, derived] };
}

/**
 * Completes a cached album: asks every active album service that has no link
 * yet, Deezer again when the stored preview is stale, and the cover services
 * when the album has no cover. New links, previews and the derived YouTube
 * Music link are stored with the album.
 *
 * @param cached - The cached album from {@link tryAlbumCache}.
 * @returns The album with the new links merged in and sorted by confidence,
 *   disabled services filtered out, the cover, label and preview backfilled,
 *   and the external ids the new links reported. Write failures are logged and
 *   do not fail the resolve.
 */
export async function fillMissingAlbumServices(cached: AlbumResolutionResult): Promise<AlbumResolutionResult> {
  const active = await getActiveAdapters();
  cached = await deriveCachedYouTubeMusicLink(
    cached,
    active.some((adapter) => adapter.id === "youtube"),
  );
  cached = {
    ...cached,
    sourceAlbum: {
      ...cached.sourceAlbum,
      artworkUrl: await keepRecordingArtwork("album", cached.albumId, cached.sourceAlbum.artworkUrl),
    },
  };
  const coveredServices = new Set(cached.links.map((l) => l.service));

  const missingAdapters = active.filter(
    (a) => Boolean(a.albumCapabilities) && !coveredServices.has(a.id) && a.id !== cached.sourceAlbum.sourceService,
  );

  const needsPreview = await isAlbumPreviewRefreshNeeded(cached);
  const deezerAdapter = needsPreview
    ? active.find(
        (a) =>
          a.id === "deezer" &&
          Boolean(a.albumCapabilities) &&
          a.id !== cached.sourceAlbum.sourceService &&
          !missingAdapters.some((m) => m.id === "deezer"),
      )
    : undefined;

  const artworkAdapters = !cached.sourceAlbum.artworkUrl
    ? RECORDING_ARTWORK_LOOKUP_SERVICES.flatMap((service) =>
        active.filter(
          (adapter) =>
            adapter.id === service &&
            Boolean(adapter.albumCapabilities) &&
            adapter.capabilities.supportsArtwork &&
            coveredServices.has(service),
        ),
      )
    : [];
  const adaptersToFetch = uniqueAdaptersByService([
    ...missingAdapters,
    ...(deezerAdapter ? [deezerAdapter] : []),
    ...artworkAdapters,
  ]);

  if (adaptersToFetch.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  log.debug(
    "AlbumResolver",
    `Gap-filling ${adaptersToFetch.length} new services for cached album${
      deezerAdapter ? " (incl. Deezer for preview)" : ""
    }`,
  );

  const results = await Promise.allSettled(adaptersToFetch.map((a) => resolveAlbumOnService(a, cached.sourceAlbum)));

  const newLinks: ResolvedAlbumLink[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    }
  }

  if (newLinks.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  const derived = deriveYouTubeMusicAlbumLink(newLinks);
  if (derived) newLinks.push(derived);
  const genuinelyNewLinks = newLinks.filter((l) => !coveredServices.has(l.service));

  if (cached.albumId && genuinelyNewLinks.length > 0) {
    try {
      const repo = await getRepository();
      await repo.addLinksToAlbum(cached.albumId, toStoredLinks(genuinelyNewLinks));
    } catch (error) {
      log.deviation(
        {
          component: "AlbumResolver",
          errorCode: "MC-DB-0004",
          operation: "album_gap_fill_persist",
          outcome: "response_without_cache_update",
        },
        error,
      );
    }
  }

  const allLinks = [...cached.links, ...genuinelyNewLinks].sort((a, b) => b.confidence - a.confidence);

  let sourceAlbum = {
    ...cached.sourceAlbum,
    artworkUrl: await keepRecordingArtwork("album", cached.albumId, cached.sourceAlbum.artworkUrl, newLinks),
  };

  if (!sourceAlbum.label) {
    const label = pickLabelFromLinks(allLinks);
    if (label) sourceAlbum = { ...sourceAlbum, label };
  }

  const previewLink =
    newLinks.find((l) => l.service === "deezer" && l.topTrackPreviewUrl) ?? newLinks.find((l) => l.topTrackPreviewUrl);
  if (previewLink?.topTrackPreviewUrl) {
    sourceAlbum = { ...sourceAlbum, topTrackPreviewUrl: previewLink.topTrackPreviewUrl };
  }

  if (cached.albumId) {
    try {
      const repo = await getRepository();
      for (const link of newLinks) {
        if (!link.topTrackPreviewUrl) continue;
        await repo.upsertAlbumPreview(cached.albumId, previewObservation(link.service, link.topTrackPreviewUrl));
      }
    } catch (error) {
      log.deviation(
        {
          component: "AlbumResolver",
          errorCode: "MC-DB-0004",
          operation: "album_preview_persist",
          outcome: "response_without_cache_update",
        },
        error,
      );
    }
  }

  return {
    sourceAlbum,
    links: await filterDisabledLinks(allLinks),
    albumId: cached.albumId,
    shortId: cached.shortId,
    externalIds: collectAlbumExternalIds(sourceAlbum, newLinks),
  };
}

/**
 * Decides whether a cached album's preview has to be fetched again.
 *
 * @param cached - The cached album.
 * @returns For an album without a stored row, whether it lacks a preview. For
 *   a stored album, whether its stored previews are missing or stale per
 *   `isStoredPreviewFresh`. `true` when the read fails.
 */
async function isAlbumPreviewRefreshNeeded(cached: AlbumResolutionResult): Promise<boolean> {
  if (!cached.albumId) return !cached.sourceAlbum.topTrackPreviewUrl;
  try {
    const repo = await getRepository();
    const previews = await repo.findAlbumPreviews(cached.albumId);
    return !isStoredPreviewFresh(previews);
  } catch (error) {
    log.deviation(
      {
        component: "AlbumResolver",
        errorCode: "MC-DB-0004",
        operation: "album_preview_refresh_check",
        outcome: "forced_refresh",
      },
      error,
    );
    return true;
  }
}
