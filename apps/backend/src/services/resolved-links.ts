/**
 * @file Link building shared by the track, album and artist resolvers.
 *
 * The three resolvers and the persistence in `persist-resolution.ts` and
 * `resolve-response.ts` all write and read the same row shape, so the shape is
 * built and read here once. A field added to the stored link reaches every
 * writer through {@link toStoredLinks} and every reader through
 * {@link fromCachedLinks}. The source link, the collection of settled fan-out
 * results, the adapter dedupe and the URL identification by capability are
 * shared here as well, so a new link field or logging rule reaches all three
 * pipelines together.
 */
import { type MatchMethod, PLATFORM_CONFIG } from "@musiccloud/shared";
import type { PersistTrackData, PreviewRow } from "../db/repository.js";
import { log } from "../lib/infra/logger.js";
import { stripTrackingParams } from "../lib/platform/url.js";
import { isValidServiceId, type ServiceAdapter, type ServiceId } from "./types.js";

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
 * A row naming a service this build does not know is ignored. Its URL points at
 * a removed service's host, and an unsigned one never expires, so counting it
 * would skip the Deezer refresh for that recording for good.
 *
 * @param previews - The preview rows stored for the entity.
 * @param now - The current time in unix milliseconds. Defaults to `Date.now()`.
 * @returns `true` when at least one row of a known service has no expiry or
 *   expires after `now`; `false` when every such row has expired or there is
 *   no row at all.
 */
export function isStoredPreviewFresh(
  previews: readonly Pick<PreviewRow, "service" | "expiresAt">[],
  now: number = Date.now(),
): boolean {
  return previews.some(
    (preview) =>
      isValidServiceId(preview.service) && (preview.expiresAt === null || preview.expiresAt.getTime() > now),
  );
}

/**
 * The fields of a link to the service a resolve started from. It is assignable
 * to the track, album and artist link types.
 *
 * @property service - The source adapter's service id.
 * @property displayName - The source adapter's label.
 * @property url - The source entity's web URL.
 * @property confidence - The confidence the caller assigns to the source.
 * @property matchMethod - How the source was found: `source` for a pasted URL,
 *   `search` for a text search or a picked candidate.
 * @property externalId - The source entity's id on its service.
 * @property previewUrl - The source track's preview, present only when the
 *   caller passes one through {@link SourceLinkOptions.previewUrl}.
 */
export interface SourceLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
  externalId: string;
  previewUrl?: string;
}

/**
 * Options for {@link sourceLink}.
 *
 * @property confidence - The source link's confidence, for example
 *   `IDENTIFIER_MATCH_CONFIDENCE` for a pasted URL or the search score for a
 *   text match.
 * @property matchMethod - The source link's match method.
 * @property previewUrl - A preview URL to carry on the link. When it is
 *   `undefined`, which is the default, the link has no `previewUrl` field.
 */
export interface SourceLinkOptions {
  confidence: number;
  matchMethod: MatchMethod;
  previewUrl?: string;
}

/**
 * Builds the link to the service a resolve started from, which every resolver
 * puts first in its link list.
 *
 * @param adapter - The source service's adapter.
 * @param entity - The source track, album or artist, read for its web URL and id.
 * @param options - See {@link SourceLinkOptions}.
 * @returns The source link, with `previewUrl` only when `options` carries one.
 */
export function sourceLink(
  adapter: Pick<ServiceAdapter, "id" | "displayName">,
  entity: { webUrl: string; sourceId: string },
  options: SourceLinkOptions,
): SourceLink {
  const link: SourceLink = {
    service: adapter.id,
    displayName: adapter.displayName,
    url: entity.webUrl,
    confidence: options.confidence,
    matchMethod: options.matchMethod,
    externalId: entity.sourceId,
  };
  return options.previewUrl === undefined ? link : { ...link, previewUrl: options.previewUrl };
}

/**
 * Options for {@link collectSettledLinks}.
 *
 * @property component - The log component the resolver logs under, such as
 *   `Resolver`, `AlbumResolver` or `ArtistResolver`.
 * @property logRejected - When `true`, a rejected lookup is logged with
 *   `log.error`. Defaults to `false`, which leaves rejections unlogged here,
 *   for a caller whose lookups log their own failures.
 */
export interface CollectSettledLinksOptions {
  component: string;
  logRejected?: boolean;
}

/**
 * Turns the settled results of a fan-out into the links of every service that
 * matched, logging each match and each clean miss at debug level. A result that
 * is `undefined` belongs to a service still running and is skipped. Links are
 * neither sorted nor filtered by confidence, because each resolver derives
 * further links from the full set before it filters.
 *
 * @param adapters - The services, in the same order as `results`.
 * @param results - One settled result, or `undefined`, per service.
 * @param options - See {@link CollectSettledLinksOptions}.
 * @returns The links of every service that matched, in service order.
 */
export function collectSettledLinks<Link extends { confidence: number }>(
  adapters: readonly Pick<ServiceAdapter, "id">[],
  results: ReadonlyArray<PromiseSettledResult<Link | null> | undefined>,
  options: CollectSettledLinksOptions,
): Link[] {
  const links: Link[] = [];
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const adapter = adapters[index];
    if (!result) continue;

    if (result.status === "fulfilled" && result.value) {
      log.debug(options.component, `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug(options.component, `[${adapter.id}] no match found`);
    } else if (options.logRejected) {
      log.error(
        options.component,
        `[${adapter.id}] resolve failed: ${result.reason instanceof Error ? result.reason.message : result.reason}`,
      );
    }
  }
  return links;
}

/**
 * Removes adapters that name a service already in the list.
 *
 * @param adapters - Adapters gathered from several sources, possibly repeating a service.
 * @returns One adapter per service id, in the order each id first appears. For
 *   a repeated id the last adapter given for it is kept.
 */
export function uniqueAdaptersByService<Adapter extends Pick<ServiceAdapter, "id">>(
  adapters: readonly Adapter[],
): Adapter[] {
  return [...new Map(adapters.map((adapter) => [adapter.id, adapter])).values()];
}

/**
 * The adapter methods that recognize a URL of one entity kind.
 *
 * - `detectAlbumUrl`: recognizes an album URL.
 * - `detectArtistUrl`: recognizes an artist URL.
 */
export type EntityUrlDetector = "detectAlbumUrl" | "detectArtistUrl";

/**
 * Finds the adapter that recognizes a URL through one detector method.
 * Adapters without that method are skipped.
 *
 * @param adapters - The active adapters, in registry order.
 * @param url - The URL to identify.
 * @param detector - The detector method to ask, see {@link EntityUrlDetector}.
 * @returns The first adapter whose detector returns an id for `url`, or
 *   `undefined` when none does.
 */
export function findAdapterForUrl(
  adapters: readonly ServiceAdapter[],
  url: string,
  detector: EntityUrlDetector,
): ServiceAdapter | undefined {
  return adapters.find((adapter) => Boolean(adapter[detector]) && adapter[detector]?.(url) !== null);
}
