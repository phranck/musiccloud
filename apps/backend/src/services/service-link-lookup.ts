/**
 * @file Cache key for a pasted link: its service and the id the catalog stores.
 *
 * The track and album resolvers both look a pasted link up in the database
 * before asking its service, so a link the database knows still resolves while
 * that service is down. Both need the id in the form `service_links` and
 * `album_service_links` store it, which is not always the form `detectUrl` and
 * `detectAlbumUrl` return.
 */

import type { ServiceAdapter, ServiceId } from "./types.js";

/** A pasted link reduced to its service and the stored form of its id. */
export interface ServiceLinkLookup {
  service: ServiceId;
  externalId: string;
}

/**
 * Builds the cache key for a link detected by `adapter`.
 *
 * @param adapter - The service the link belongs to.
 * @param detectedId - What its `detectUrl` or `detectAlbumUrl` returned for the link.
 * @returns The service and the id as its links store it, via
 *   {@link ServiceAdapter.toCatalogId} where the adapter has one.
 */
export function serviceLinkLookup(adapter: ServiceAdapter, detectedId: string): ServiceLinkLookup {
  return { service: adapter.id, externalId: adapter.toCatalogId?.(detectedId) ?? detectedId };
}
