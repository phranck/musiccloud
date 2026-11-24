/**
 * @file Conversions between resolved links and the link rows the database stores.
 *
 * The track, album and artist resolvers and the persistence in
 * `persist-resolution.ts` and `resolve-response.ts` all write and read the same
 * row shape, so the shape is built and read here once. A field added to the
 * stored link reaches every writer through {@link toStoredLinks} and every
 * reader through {@link fromCachedLinks}.
 */
import { type MatchMethod, PLATFORM_CONFIG } from "@musiccloud/shared";
import type { PersistTrackData, PreviewRow } from "../db/repository.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { isValidServiceId, type ServiceId } from "./types.js";

/**
 * One cross-service link as the repository stores it for a track, an album or
 * an artist. The three entity kinds share this row shape.
 */
export type StoredLink = PersistTrackData["links"][number];

/**
 * A link row as the repository returns it from a cache lookup, before its
 * service id has been checked against the known services.
 *
 * @property service - The service id as stored, which may name a service that
 *   no longer exists.
 * @property url - The stored destination URL.
 * @property confidence - The stored match confidence.
 * @property matchMethod - The stored match method, not yet narrowed to {@link MatchMethod}.
 */
export interface CachedLinkRow {
  service: string;
  url: string;
  confidence: number;
  matchMethod: string;
}

/**
 * The fields every resolved link carries when it is rebuilt from a cached row.
 * It is assignable to the track, album and artist link types, whose further
 * fields are all optional and are absent on a cached link.
 *
 * @property service - A service id known to this build.
 * @property displayName - The service's label from `PLATFORM_CONFIG`.
 * @property url - The stored destination URL.
 * @property confidence - The stored match confidence.
 * @property matchMethod - The stored match method.
 */
export interface CachedResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
}

/**
 * Options for {@link toStoredLinks}.
 *
 * @property stripTracking - When `true`, each URL passes through
 *   `stripTrackingParams` before it is stored. Defaults to `false`, which
 *   stores every URL unchanged.
 */
export interface ToStoredLinksOptions {
  stripTracking?: boolean;
}

/**
 * Turns resolved links into the rows the repository stores, copying only the
 * stored fields. Previews, covers, labels and identifiers a link may carry are
 * left out, because they are stored through their own tables.
 *
 * @param links - Resolved track, album or artist links.
 * @param options - See {@link ToStoredLinksOptions}. Defaults to no stripping.
 * @returns One row per link, in the same order.
 */
export function toStoredLinks(links: readonly StoredLink[], options: ToStoredLinksOptions = {}): StoredLink[] {
  return links.map((link) => ({
    service: link.service,
    url: options.stripTracking ? stripTrackingParams(link.url) : link.url,
    confidence: link.confidence,
    matchMethod: link.matchMethod,
    externalId: link.externalId,
  }));
}

/**
 * Rebuilds resolved links from cached rows. Rows naming a service this build
 * does not know are dropped, and each remaining link gets its service's label.
 *
 * @param rows - Link rows from a track, album or artist cache lookup.
 * @returns The links of known services, in the order of `rows`.
 */
export function fromCachedLinks(rows: readonly CachedLinkRow[]): CachedResolvedLink[] {
  return rows
    .filter((row) => isValidServiceId(row.service))
    .map((row) => ({
      service: row.service as ServiceId,
      displayName: PLATFORM_CONFIG[row.service as ServiceId].label,
      url: row.url,
      confidence: row.confidence,
      matchMethod: row.matchMethod as MatchMethod,
    }));
}

/**
 * Decides whether any stored preview of a track or album can still be played.
 *
 * @param previews - The preview rows stored for the entity.
 * @param now - The current time in unix milliseconds. Defaults to `Date.now()`.
 * @returns `true` when at least one row has no expiry or expires after `now`;
 *   `false` when every row has expired or there is no row at all.
 */
export function isStoredPreviewFresh(
  previews: readonly Pick<PreviewRow, "expiresAt">[],
  now: number = Date.now(),
): boolean {
  return previews.some((preview) => preview.expiresAt === null || preview.expiresAt.getTime() > now);
}
