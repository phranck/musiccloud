/**
 * @file Resolver-chain navigation and ownership for recording destinations.
 *
 * Start here to follow a URL, text query, or picked candidate through matching,
 * cache enrichment, persistence, and the later read-only share response. Album
 * and artist matching remain in `album-resolver.ts` and `artist-resolver.ts`.
 * This module coordinates tracks rather than defining provider HTTP contracts.
 *
 * ## Request and source selection
 *
 * `routes/resolve.ts` dispatches a URL, text query, or `selectedCandidate` after
 * its registered authentication scope and client/site rate limits. The landing
 * client's `apps/frontend/src/hooks/useAppState.ts` sends
 * text first and the selected provider/id in its follow-up. A stored YouTube
 * source therefore does not imply that every caller pasted a YouTube URL.
 *
 * `resolve-response.ts` classifies URLs through plugin detectors and chooses
 * the track, album, or artist resolver. `resolveQuery` is the track front door;
 * `resolveUrl` strips tracking, expands registered short links, and coalesces
 * concurrent requests for the same canonical URL with `resolveCanonicalUrlOnce`.
 *
 * Text discovery walks `plugins/registry.ts` order. Native candidate lists use
 * `AUTO_SELECT_THRESHOLD` to choose automatic resolution or disambiguation.
 * Providers exposing only one match resolve under their own accepted score.
 * `resolveSelectedCandidate` fetches the chosen id rather than searching again.
 * Provider order and enabled/credential gates belong to the registry, not here.
 *
 * ## Cache identity is not destination completeness
 *
 * The URL path checks canonical URL, then a known provider id, then ISRC after
 * fetching metadata. Provider-id cache lookup accepts source/identifier links,
 * not potentially ambiguous text matches. Candidate selection also checks the
 * fetched canonical URL because video sources have no ISRC.
 *
 * Every recognized cache hit enters `fillMissingServices`. It preserves newly
 * confirmed source observations before querying gaps, so a redundant search
 * cannot discard a destination already obtained by the caller. Observed ISRCs
 * guide lookups without replacing canonical display metadata or the share id.
 * The canonical row does not expire; preview rows have their own expiry.
 *
 * A gap-fill records only fulfilled, empty lookups as `service_link_misses`.
 * Rejections, malformed replies, and timeouts are not catalogue misses. Covered
 * services refreshed for enrichment do not acquire contradictory miss rows.
 * `constants.ts` owns the miss TTL and all matching/disambiguation thresholds.
 *
 * ## Per-provider matching and link normalization
 *
 * `resolveOnService` uses a known provider id for metadata refresh, otherwise
 * ISRC before text. A failed identifier request is an upstream failure, while
 * an actual empty identifier result permits text fallback. Adapters own their
 * HTTP contracts and candidate validation. `plugins/_shared/confidence.ts`
 * owns free-text interpretation, bounded title interpretations and recording
 * guards. `track-search-query.ts` builds requests from that same policy.
 * `recordingSearchQuery` applies verified provider artist-label interpretations
 * to lookup values only. `resolveViaSearch` checks accepted adapter results
 * again before link or negative-cache persistence. Canonical metadata survives.
 * `confidence.ts` interprets match methods; `constants.ts` owns acceptance gates.
 *
 * `normalizeTrackLinks` runs after source assembly and on completed deadline
 * batches. It keeps one destination per provider and derives YouTube Music
 * only from the shared `lib/platform/youtube-video.ts` recording-id grammar.
 * A `search-fallback` opens search results, not the recording; it never seeds
 * a derived recording link. Registry filtering applies the parent's toggle to
 * persisted YouTube Music aliases as well as ordinary destinations.
 *
 * ## Deadline and persistence ownership
 *
 * `fan-out-deadline.ts` owns `RESOLVE_RESPONSE_DEADLINE_MS`. Early results form
 * the response while each pending lookup remains bounded by `ADAPTER_TIMEOUT_MS`.
 * A deadline is not cancellation. Late successful destinations remain useful.
 *
 * `completeFreshResolution` applies visibility, normalization, artwork policy,
 * and initial identifier collection. `persist-resolution.ts` stores a fresh
 * recording or preserves cached ids. Only after this primary persistence does
 * `resolve-response.ts` start `persistLateTrackLinks`, because late writes need
 * a real track id. Cached gap-fill batches already know that id and persist
 * themselves. Both store links, provider-specific identifier observations, and
 * previews. `external-ids.ts` owns provenance and deduplication of identifiers.
 * Preview expiry is parsed by `lib/preview-url.ts`; an encoded expiry remains
 * significant even for a provider preferred by the preview-selection policy.
 *
 * ## Artwork and share reads
 *
 * `artwork.ts` owns recording-cover eligibility and bounded lookup priority.
 * YouTube imagery is never a recording fallback, and Apple restrictions remain.
 * Fresh image provenance identifies the image's provider, not merely whichever
 * service supplied title metadata. Artist portraits keep their separate policy.
 *
 * Cached/late changes use `recording-artwork.ts` and cover-only compare-and-set
 * storage, so another resolve or an operator's valid cover is not overwritten.
 * Stored links contain no covers, which is why a missing cover permits bounded
 * metadata refresh even when destinations and previews are already complete.
 *
 * `lib/server/share-page.ts` filters stored recording images for output and OG
 * metadata without upstream calls or repair writes. Opening a share does not
 * resolve missing destinations. Explicit resolution enriches service coverage;
 * `routes/share.ts` separately owns HTTP caching of the resulting payload.
 *
 * The OG metadata escape hatch is entered only after metadata fetch fails and
 * the availability check reports missing configuration. Registry gating still
 * runs first; a quota failure is not a reason to scrape. Page metadata enters
 * ordinary matching and image policy rather than bypassing either boundary.
 */
import { getPlatformLabel, isShortLinkHost, type MatchMethod, PLATFORM_CONFIG } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import { createSingleFlight } from "../lib/concurrency.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { UpstreamUnavailableError } from "../lib/infra/upstream-unavailable.js";
import { isUrl, stripTrackingParams, validateMusicUrl } from "../lib/platform/url.js";
import { youtubeVideoId } from "../lib/platform/youtube-video.js";
import { getPreviewExpiry, pickPreferredPreview } from "../lib/preview-url.js";
import { ResolveError, searchExhaustedError } from "../lib/resolve/errors.js";
import { pickRecordingArtworkUrl, RECORDING_ARTWORK_LOOKUP_SERVICES } from "./artwork.js";
import { confidenceForMethod } from "./confidence.js";
import {
  AUTO_SELECT_THRESHOLD,
  CANDIDATE_MIN_CONFIDENCE,
  IDENTIFIER_MATCH_CONFIDENCE,
  LINK_QUALITY_THRESHOLD,
  MATCH_MIN_CONFIDENCE,
  MAX_CANDIDATES,
  SEARCH_FALLBACK_CONFIDENCE,
  SERVICE_MISS_TTL_MS,
} from "./constants.js";
import { collectTrackExternalIds } from "./external-ids.js";
import { RESOLVE_RESPONSE_DEADLINE_MS, settleWithinDeadline } from "./fan-out-deadline.js";
import {
  filterDisabledLinks,
  findInactiveServiceFor,
  getActiveAdapters,
  identifyService,
  isPluginAvailable,
} from "./index.js";
import { isTrackSearchFallbackMatch, recordingSearchQuery } from "./plugins/_shared/track-search-query.js";
import { keepRecordingArtwork } from "./recording-artwork.js";
import { type ServiceLinkLookup, serviceLinkLookup } from "./service-link-lookup.js";
import type {
  ExternalIdRecord,
  MatchResult,
  NormalizedTrack,
  SearchCandidate,
  SearchQuery,
  SearchResultWithCandidates,
  ServiceAdapter,
  ServiceId,
} from "./types.js";
import { isValidServiceId } from "./types.js";

export interface ResolvedLink {
  service: ServiceId;
  displayName: string;
  url: string;
  confidence: number;
  matchMethod: MatchMethod;
  /** Service-specific track ID (e.g. Spotify track ID, Deezer track ID) */
  externalId?: string;
  /** 30-second audio preview URL from this service (if available) */
  previewUrl?: string;
  /**
   * Cover this service returned for the track, which `withKeptArtwork` may
   * borrow when the source track has none to keep. `toApiLinks` copies named
   * link fields only, so the cover never reaches the API response.
   */
  artworkUrl?: string;
  /**
   * ISRC reported by this service for the track. May differ from the
   * source track's ISRC for regional variants / re-releases — that is
   * precisely the surface we want to aggregate. Optional because not
   * every adapter exposes an ISRC for every match.
   */
  isrc?: string;
  /**
   * MusicBrainz Recording MBID reported by this service for the track.
   * Today only the MusicBrainz adapter populates this; other adapters
   * leave it undefined. Drives `track_external_ids` aggregation.
   */
  mbid?: string;
  /**
   * ISWC of the underlying composition (work). Populated by the
   * MusicBrainz adapter when work-rels are returned. Drives
   * `track_external_ids` aggregation as `idType='iswc'`.
   */
  iswc?: string;
}

export interface ResolutionResult {
  sourceTrack: NormalizedTrack;
  links: ResolvedLink[];
  trackId?: string; // present when loaded from cache
  /** The stored share id, present when loaded from cache. */
  shortId?: string;
  /**
   * External-id observations harvested across every adapter contacted
   * during the resolve. Persisted into `track_external_ids` so the
   * aggregation grows beyond the single canonical `tracks.isrc`.
   * Always present; empty array when the resolve produced no IDs
   * (e.g. cache hit where re-collection is skipped).
   */
  externalIds: ExternalIdRecord[];
  /**
   * Links from services that were still running when the resolve answered.
   * Settles, never rejects, once they have all answered. Whoever persists the
   * result hands it to {@link persistLateTrackLinks} with the new track id.
   */
  lateLinks?: Promise<ResolvedLink[]>;
}

export interface TextSearchResult {
  kind: "resolved" | "disambiguation";
  result?: ResolutionResult;
  candidates?: SearchCandidate[];
}

function mapCachedLinks(
  links: Array<{ service: string; url: string; confidence: number; matchMethod: string }>,
): ResolvedLink[] {
  return links
    .filter((l) => isValidServiceId(l.service))
    .map((l) => ({
      service: l.service as ServiceId,
      displayName: PLATFORM_CONFIG[l.service as ServiceId].label,
      url: l.url,
      confidence: l.confidence,
      matchMethod: l.matchMethod as MatchMethod,
    }));
}

/**
 * Reads the services that recently came back empty for this track.
 *
 * @param trackId - Track being resolved, absent when nothing is persisted yet.
 * @returns The service ids whose last fruitless lookup is younger than
 *   {@link SERVICE_MISS_TTL_MS}. Empty when there is no track row to key on, or
 *   when the read fails: skipping a service on bad information would hide a
 *   link, whilst asking one time too often only costs a request.
 */
async function readRecentServiceMisses(trackId: string | undefined): Promise<ReadonlySet<string>> {
  if (!trackId) return new Set();
  try {
    const repo = await getRepository();
    const misses = await repo.readServiceLinkMisses(trackId);
    const cutoff = Date.now() - SERVICE_MISS_TTL_MS;
    return new Set(misses.filter((m) => m.checkedAt.getTime() > cutoff).map((m) => m.service));
  } catch (error) {
    log.error("Resolver", `Failed to read service misses: ${error instanceof Error ? error.message : error}`);
    return new Set();
  }
}

/**
 * Writes down that these services had nothing for this track.
 *
 * @param trackId - Track being resolved, absent when nothing is persisted yet.
 * @param services - Service ids that answered with no match.
 * @returns A promise that resolves when the write is done or has been given up
 *   on. A failure here is not fatal: the resolve already succeeded, and the
 *   cost of losing the record is one wasted lookup next time.
 */
async function recordServiceMisses(trackId: string | undefined, services: readonly string[]): Promise<void> {
  if (!trackId || services.length === 0) return;
  try {
    const repo = await getRepository();
    await repo.recordServiceLinkMisses(trackId, services);
  } catch (error) {
    log.error("Resolver", `Failed to record service misses: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Try to serve a result from DB cache, by the URL a track was first resolved
 * from, then by a link it has on the pasted link's service, then by ISRC.
 *
 * Static-vs-dynamic split (migration 0021): the canonical track row is
 * permanently fresh, so a cache hit always wins regardless of `updated_at`.
 * The only time-sensitive field, the preview URL, lives in
 * `track_previews` and is refreshed lazily by `fillMissingServices`
 * when its `expires_at` is in the past. Returns null only on miss or
 * read errors.
 */
async function tryCache(lookup: {
  url?: string;
  serviceLink?: ServiceLinkLookup;
  isrc?: string;
}): Promise<ResolutionResult | null> {
  try {
    const repo = await getRepository();
    let cached = lookup.url ? await repo.findTrackByUrl(lookup.url) : null;
    if (!cached && lookup.serviceLink) {
      cached = await repo.findTrackByServiceLink(lookup.serviceLink.service, lookup.serviceLink.externalId);
    }
    if (!cached && lookup.isrc) cached = await repo.findTrackByIsrc(lookup.isrc);
    if (!cached) return null;

    const links = mapCachedLinks(cached.links);
    log.debug("Resolver", `Cache hit: ${links.length} links`);

    return {
      sourceTrack: cached.track,
      links,
      trackId: cached.trackId,
      shortId: cached.shortId,
      externalIds: [],
    };
  } catch (error) {
    log.error("Resolver", `Cache read failed: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * Completes a cached recording without losing evidence already obtained upstream.
 *
 * A cache hit identifies the recording, not a complete destination set. Known
 * source observations must be retained before gap filling, because searching
 * again can fail after the source was already confirmed. Their ISRC may guide
 * lookups without rewriting canonical metadata or changing the share id.
 *
 * @param cached - Stored recording and its current destinations.
 * @param observations - Newly confirmed metadata for this same cached identity.
 * @returns Visible destinations and early enrichment; late batches persist themselves.
 */
async function fillMissingServices(
  cached: ResolutionResult,
  observations: readonly ResolvedLink[] = [],
): Promise<ResolutionResult> {
  const normalizedLinks = await filterDisabledLinks([...cached.links, ...observations]);
  const visibleServices = new Set(normalizedLinks.map((link) => link.service));
  const visibleObservations = observations.filter((link) => visibleServices.has(link.service));
  normalizeTrackLinks(normalizedLinks);
  const changed = normalizedLinks.filter((link) => {
    const stored = cached.links.find((candidate) => candidate.service === link.service);
    return (
      !stored ||
      stored.url !== link.url ||
      stored.confidence !== link.confidence ||
      stored.matchMethod !== link.matchMethod
    );
  });
  if (cached.trackId && (changed.length > 0 || visibleObservations.length > 0)) {
    await persistTrackLinks(cached.trackId, changed, visibleObservations);
  }
  cached = {
    ...cached,
    links: normalizedLinks,
    sourceTrack: {
      ...cached.sourceTrack,
      previewUrl: pickPreferredPreview(visibleObservations, cached.sourceTrack.previewUrl),
      artworkUrl: await keepRecordingArtwork(
        "track",
        cached.trackId,
        cached.sourceTrack.artworkUrl,
        visibleObservations,
      ),
    },
  };
  const observedIsrc = cached.sourceTrack.isrc ?? visibleObservations.find((link) => link.isrc)?.isrc;
  const lookupTrack = observedIsrc ? { ...cached.sourceTrack, isrc: observedIsrc } : cached.sourceTrack;
  const coveredServices = new Set(cached.links.map((l) => l.service));
  const active = await getActiveAdapters();

  // A service that answered with nothing last time is not asked again until
  // its record has aged out. Without this the set below holds every service
  // that will never carry this track, and a cached resolve pays for all of
  // them on every request.
  const recentMisses = await readRecentServiceMisses(cached.trackId);

  const missingAdapters = active.filter(
    (a) => !coveredServices.has(a.id) && a.id !== cached.sourceTrack.sourceService && !recentMisses.has(a.id),
  );

  // Destination completeness does not imply a usable preview. The preview
  // rows' expiry controls this refresh; missing artwork is checked separately.
  const needsPreview = await isPreviewRefreshNeeded(cached);
  // A service with a fresh miss is skipped here too: it has no link for this
  // track, so it has no preview for it either, and asking is the same waste in
  // a different shape.
  const deezerAdapter =
    needsPreview && !recentMisses.has("deezer")
      ? active.find(
          (a) =>
            a.id === "deezer" &&
            a.id !== cached.sourceTrack.sourceService &&
            !missingAdapters.some((m) => m.id === "deezer"),
        )
      : undefined;

  // Stored links do not contain covers. A missing cover therefore permits a
  // bounded metadata refresh even when previews and destinations are complete.
  const artworkAdapters = !cached.sourceTrack.artworkUrl
    ? RECORDING_ARTWORK_LOOKUP_SERVICES.flatMap((service) =>
        active.filter(
          (adapter) => adapter.id === service && adapter.capabilities.supportsArtwork && coveredServices.has(service),
        ),
      )
    : [];
  const adaptersToFetch = [
    ...new Map(
      [...missingAdapters, ...(deezerAdapter ? [deezerAdapter] : []), ...artworkAdapters].map((adapter) => [
        adapter.id,
        adapter,
      ]),
    ).values(),
  ];

  if (adaptersToFetch.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  log.debug(
    "Resolver",
    `Gap-filling ${adaptersToFetch.length} services for cached track${deezerAdapter ? " (incl. Deezer for preview)" : ""}`,
  );

  // The response carries what arrived by the deadline. The rest is stored, and
  // its misses recorded, in the background once it arrives, so a slow service
  // costs the next load nothing and this one no wait.
  const fanOut = await settleWithinDeadline(
    adaptersToFetch.map((adapter) =>
      resolveOnServiceWithTimeout(
        adapter,
        lookupTrack,
        cached.links.find((link) => link.service === adapter.id),
      ),
    ),
    RESOLVE_RESPONSE_DEADLINE_MS,
  );
  const newLinks = await storeGapFillResults(cached, coveredServices, adaptersToFetch, fanOut.early);

  const lateAdapterIndices = indicesStillRunning(fanOut.early);
  if (lateAdapterIndices.length > 0) {
    void fanOut.all.then((results) =>
      storeGapFillResults(
        cached,
        coveredServices,
        lateAdapterIndices.map((index) => adaptersToFetch[index]),
        lateAdapterIndices.map((index) => results[index]),
      ),
    );
  }

  if (newLinks.length === 0) return { ...cached, links: await filterDisabledLinks(cached.links) };

  // Don't add Deezer twice to allLinks if it was only re-fetched for preview
  const genuinelyNewLinks = newLinks.filter((l) => !coveredServices.has(l.service));
  const allLinks = [...cached.links, ...genuinelyNewLinks].sort((a, b) => b.confidence - a.confidence);

  const sourceTrack = {
    ...cached.sourceTrack,
    previewUrl: pickPreferredPreview(newLinks, cached.sourceTrack.previewUrl),
  };

  return {
    sourceTrack,
    links: await filterDisabledLinks(allLinks),
    trackId: cached.trackId,
    shortId: cached.shortId,
    // Each gap-fill batch stores its own identifiers, including late batches.
    externalIds: [],
  };
}

/**
 * Records and stores one batch of gap-fill results: clean misses are written
 * down, links for services the track did not have yet are added, and every
 * preview picked up is saved. Runs once for the results that beat the response
 * deadline and once, detached, for the rest, so it never rejects.
 *
 * @param cached - The cached track being filled.
 * @param coveredServices - Services the track already had before this fill.
 * @param adapters - The services, in the same order as `results`.
 * @param results - One settled result, or `undefined`, per service.
 * @returns Every link the batch produced, including a Deezer link fetched only
 *   for its preview.
 */
async function storeGapFillResults(
  cached: ResolutionResult,
  coveredServices: ReadonlySet<string>,
  adapters: readonly ServiceAdapter[],
  results: ReadonlyArray<PromiseSettledResult<ResolvedLink | null> | undefined>,
): Promise<ResolvedLink[]> {
  const newLinks: ResolvedLink[] = [];
  const missedServices: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result?.status === "fulfilled" && result.value) {
      newLinks.push(result.value);
    } else if (result?.status === "fulfilled" && !coveredServices.has(adapters[i].id)) {
      // A clean "not here". A rejected lookup is left out on purpose: that is
      // an outage or a timeout, and recording it would suppress the service
      // for a month over a bad minute.
      missedServices.push(adapters[i].id);
    }
  }

  normalizeTrackLinks(newLinks);
  await recordServiceMisses(cached.trackId, missedServices);
  // Both deadline batches share this owned snapshot, so late artwork compares
  // against the cover kept by the early batch rather than its obsolete fallback.
  cached.sourceTrack = {
    ...cached.sourceTrack,
    artworkUrl: await keepRecordingArtwork("track", cached.trackId, cached.sourceTrack.artworkUrl, newLinks),
  };

  // Only persist genuinely new service links (not Deezer re-fetched for preview only)
  if (cached.trackId) {
    await persistTrackLinks(
      cached.trackId,
      newLinks.filter((l) => !coveredServices.has(l.service)),
      newLinks,
    );
  }
  return newLinks;
}

/**
 * Stores links and every identifier/preview observation in a completed batch.
 * Cover policy is applied separately by the cached or late-result owner.
 *
 * @param trackId - The persisted track.
 * @param links - Links to add or replace, one per service.
 * @param observations - All validated metadata, including covered services
 *   refreshed only for artwork or preview. Identifiers retain provider provenance.
 *   Preview expiry is parsed; null means that no expiry was encoded.
 * @returns A promise that settles once the writes are done or given up on. It
 *   never rejects: the response it belongs to is already correct without them.
 */
async function persistTrackLinks(
  trackId: string,
  links: readonly ResolvedLink[],
  observations: readonly ResolvedLink[],
): Promise<void> {
  if (links.length > 0) {
    try {
      const repo = await getRepository();
      await repo.addLinksToTrack(
        trackId,
        links.map((l) => ({
          service: l.service,
          url: l.url,
          confidence: l.confidence,
          matchMethod: l.matchMethod,
          externalId: l.externalId,
        })),
      );
      // A service that just produced a link must not keep a miss beside it,
      // or the two tables would assert opposite things about the same pair.
      await repo.clearServiceLinkMisses(
        trackId,
        links.map((l) => l.service),
      );
    } catch (error) {
      log.deviation(
        {
          component: "Resolver",
          errorCode: "MC-DB-0004",
          operation: "track_links_persist",
          outcome: "response_without_link_update",
        },
        error,
      );
    }
  }

  const identifiers = collectTrackExternalIds(undefined, observations);
  if (identifiers.length > 0) {
    try {
      const repository = await getRepository();
      await repository.addTrackExternalIds(trackId, identifiers);
    } catch (error) {
      log.deviation(
        {
          component: "Resolver",
          errorCode: "MC-DB-0004",
          operation: "track_identifier_persist",
          outcome: "links_without_identifier_update",
        },
        error,
      );
    }
  }

  try {
    const repo = await getRepository();
    for (const link of observations) {
      if (!link.previewUrl) continue;
      const expiresAtMs = getPreviewExpiry(link.previewUrl, link.service);
      await repo.upsertTrackPreview(trackId, {
        service: link.service,
        url: link.previewUrl,
        expiresAt: expiresAtMs ? new Date(expiresAtMs) : null,
      });
    }
  } catch (error) {
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-DB-0004",
        operation: "track_preview_persist",
        outcome: "links_without_preview_update",
      },
      error,
    );
  }
}

/**
 * Stores the links of services that answered after a fresh resolve had already
 * responded. A late YouTube match replaces the search fallback stored in its
 * place. The caller starts this detached once the track is persisted.
 *
 * @param trackId - The track the fresh resolve just persisted.
 * @param lateLinks - The {@link ResolutionResult.lateLinks} of that resolve.
 * @returns A promise that settles once the links are stored. It never rejects.
 */
export async function persistLateTrackLinks(trackId: string, lateLinks: Promise<ResolvedLink[]>): Promise<void> {
  try {
    const links = await lateLinks;
    if (links.length === 0) return;
    await persistTrackLinks(trackId, links, links);
    const repository = await getRepository();
    const stored = await repository.loadByTrackId(trackId);
    if (stored) await keepRecordingArtwork("track", trackId, stored.track.artworkUrl ?? undefined, links);
  } catch (error) {
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-DB-0004",
        operation: "late_track_links_persist",
        outcome: "primary_result_retained",
      },
      error,
    );
  }
}

/**
 * Returns true when the cached track has no usable preview URL or the
 * persisted `track_previews` row for the source service has expired.
 *
 * Pre-migration logic: any cached track without `previewUrl` set on the
 * row triggered a Deezer fetch on every cache hit.
 *
 * Post-migration logic: the canonical row no longer carries the URL;
 * this function asks the `track_previews` table directly. A row whose
 * `expires_at` is in the past, or which is missing entirely, is what
 * the Deezer refresh now exists to fix.
 */
async function isPreviewRefreshNeeded(cached: ResolutionResult): Promise<boolean> {
  if (!cached.trackId) return !cached.sourceTrack.previewUrl;
  try {
    const repo = await getRepository();
    const previews = await repo.findTrackPreviews(cached.trackId);
    if (previews.length === 0) return true;
    const now = Date.now();
    const fresh = previews.find((p) => p.expiresAt === null || p.expiresAt.getTime() > now);
    return !fresh;
  } catch (error) {
    log.debug(
      "Resolver",
      `Preview-refresh check failed, defaulting to refresh: ${error instanceof Error ? error.message : error}`,
    );
    return true;
  }
}

/**
 * Confidence scoring constants (unified strategy).
 *
 * MATCH_MIN_CONFIDENCE: Minimum score for an adapter to consider a result "found".
 * LINK_QUALITY_THRESHOLD: Minimum score for inclusion in final cross-service results.
 * AUTO_SELECT_THRESHOLD: Above this, text search auto-selects without disambiguation.
 * CANDIDATE_MIN_CONFIDENCE: Minimum score to appear in disambiguation list.
 * CACHE_CONFIDENCE: Confidence assigned to DB-cached search results.
 * SEARCH_FALLBACK_CONFIDENCE: Confidence for generic "search on X" fallback links.
 */
export { LINK_QUALITY_THRESHOLD, MATCH_MIN_CONFIDENCE };

/**
 * If `url` is a known short link, follows the redirect (HEAD) and returns the
 * final canonical URL. Falls back to the original URL on network failure.
 *
 * Which hosts serve short links is the shared table of music-link hosts, so a
 * service that adds one is followed here once its entry names it.
 */
export async function expandShortLink(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!isShortLinkHost(parsed.hostname)) return url;
  try {
    const res = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    if (res.url && res.url !== url) return res.url;
  } catch (error) {
    // Network failure – fall through so the caller can surface a meaningful error
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-API-0004",
        operation: "expand_short_link",
        outcome: "original_url_fallback",
      },
      error,
    );
  }
  return url;
}

/**
 * Main entry point used by both public resolve routes. Dispatches to
 * `resolveUrl` for URL input and `resolveTextSearch` for free text.
 * URL validation runs *before* dispatch so unsupported content types
 * (e.g. playlists, podcasts) surface a precise error rather than
 * entering the track pipeline.
 *
 * @param input - raw user input, URL or text
 * @param expandedUrl - the input already passed through `expandShortLink`,
 *   when the caller expanded it to classify the URL, so it is not expanded a
 *   second time. Ignored for text input.
 * @returns resolved track result
 * @throws `ResolveError` with the validation code when the input is a
 *         non-track URL, or any of the pipeline errors documented on
 *         `resolveUrl` / `resolveTextSearch`
 */
export async function resolveQuery(input: string, expandedUrl?: string): Promise<ResolutionResult> {
  const trimmed = input.trim();

  if (isUrl(trimmed)) {
    // Last.fm URLs from genre-search are not a streaming service — extract
    // artist + title and resolve as a text search.
    const lastfmQuery = parseLastfmUrl(trimmed);
    if (lastfmQuery) return resolveTextSearch(lastfmQuery);

    // Validate URL for unsupported content types
    const validation = validateMusicUrl(trimmed);
    if (!validation.valid) {
      throw new ResolveError(validation.code, validation.message);
    }
    // Pass the raw URL – resolveUrl handles tracking-param stripping and short-link expansion
    return resolveUrl(trimmed, expandedUrl);
  }

  return resolveTextSearch(trimmed);
}

/**
 * URL input pipeline. See the file header for the three-layer cache,
 * SERVICE_DISABLED vs NOT_MUSIC_LINK ordering, preview URL preference,
 * artwork rule, and OG-scrape escape hatch.
 *
 * @param inputUrl - streaming-service URL identifying a track
 * @param preExpandedUrl - `inputUrl` already passed through `expandShortLink`
 *   by the caller; when absent it is expanded here
 * @returns resolved track result
 * @throws `ResolveError("SERVICE_DISABLED")` if the URL belongs to a currently-disabled plugin
 * @throws `ResolveError("NOT_MUSIC_LINK")` if no adapter recognizes the URL shape
 * @throws `ResolveError("INVALID_URL")` if the adapter cannot extract a track ID
 * @throws `ResolveError("SERVICE_DOWN")` (or adapter MC code) if metadata fetch fails and scrape also fails
 */
export async function resolveUrl(inputUrl: string, preExpandedUrl?: string): Promise<ResolutionResult> {
  // Strip tracking params, then expand short links (e.g. link.deezer.com/s/…)
  const strippedInput = stripTrackingParams(inputUrl);
  const expandedUrl = preExpandedUrl ?? (await expandShortLink(strippedInput));
  const cleanUrl = stripTrackingParams(expandedUrl); // strip again in case expanded URL carries UTMs

  // Two requests for the same link at once share one resolve, so the second
  // neither runs the fan-out a second time nor persists a second track.
  return resolveCanonicalUrlOnce(cleanUrl, () => resolveCanonicalUrl(cleanUrl));
}

/** One resolve per canonical URL at a time. */
const resolveCanonicalUrlOnce = createSingleFlight<string, ResolutionResult>();

/**
 * The URL pipeline past short-link expansion: the cache lookups, then the
 * source service, then the other services.
 *
 * @param cleanUrl - The canonical URL, tracking parameters stripped.
 * @returns The resolved track.
 */
async function resolveCanonicalUrl(cleanUrl: string): Promise<ResolutionResult> {
  // 1. Cache lookup by the URL the track was first resolved from
  const cachedByCanonical = await tryCache({ url: cleanUrl });
  if (cachedByCanonical) return fillMissingServices(cachedByCanonical);

  // 2. Identify which service the URL belongs to.
  //    Check against ALL plugins first so we can distinguish a truly
  //    unknown URL (NOT_MUSIC_LINK) from a known-but-disabled one
  //    (SERVICE_DISABLED). The user controls which link to paste; the
  //    admin controls which plugins are on.
  const inactiveService = await findInactiveServiceFor(cleanUrl);
  if (inactiveService) {
    throw new ResolveError("SERVICE_DISABLED", undefined, { service: inactiveService });
  }
  const sourceAdapter = await identifyService(cleanUrl);
  if (!sourceAdapter) {
    throw new ResolveError("NOT_MUSIC_LINK", "Unrecognized music service URL");
  }

  const trackId = sourceAdapter.detectUrl(cleanUrl);
  if (!trackId) {
    throw new ResolveError("INVALID_URL", "Could not extract track ID from URL");
  }

  // 2b. Cache lookup by the link's own id: a track the database already holds
  //     with this link resolves without asking the service, so a link it knows
  //     still resolves while that service is down.
  const cachedByLink = await tryCache({ serviceLink: serviceLinkLookup(sourceAdapter, trackId) });
  if (cachedByLink) return fillMissingServices(cachedByLink);

  // 3. Fetch metadata
  let sourceTrack: NormalizedTrack;
  try {
    sourceTrack = await sourceAdapter.getTrack(trackId);
  } catch (error) {
    if (!isPluginAvailable(sourceAdapter.id)) {
      return resolveUrlViaScrape(cleanUrl, sourceAdapter.id);
    }
    if (error instanceof ResolveError) throw error;
    throw new ResolveError(
      "SERVICE_DOWN",
      `Failed to fetch track from ${sourceAdapter.id}: ${error instanceof Error ? error.message : error}`,
    );
  }

  // 3b. Cache lookup by ISRC (in case same track was resolved via different URL)
  if (sourceTrack.isrc) {
    const cachedByIsrc = await tryCache({ isrc: sourceTrack.isrc });
    if (cachedByIsrc)
      return fillMissingServices(cachedByIsrc, [
        resolvedTrackLink(sourceAdapter, sourceTrack, IDENTIFIER_MATCH_CONFIDENCE, "source"),
      ]);
  }

  // 4. Resolve on all other services in parallel
  const { links, lateLinks } = await resolveAcrossServices(sourceTrack, sourceAdapter);

  // 5. Add the source service link. It was not found by any method: it is the
  // address the request came in on, which `source` says and `isrc` did not.
  links.unshift({
    service: sourceAdapter.id,
    displayName: sourceAdapter.displayName,
    url: sourceTrack.webUrl,
    confidence: IDENTIFIER_MATCH_CONFIDENCE,
    matchMethod: "source",
    externalId: sourceTrack.sourceId,
    previewUrl: sourceTrack.previewUrl,
  });

  // Source assembly is complete before preview, alias, and recording-cover selection.
  return completeFreshResolution(sourceTrack, links, lateLinks);
}

/**
 * Builds the result of a resolve that went to the services rather than the
 * database, once the source link is in `links`. Every such path ends here, so
 * each one keeps a cover by the same rule.
 *
 * @param sourceTrack - The track the resolve started from.
 * @param links - Every link found, the source's included.
 * @param lateLinks - Links still on their way, see {@link ResolutionResult.lateLinks}.
 * @returns The result, its track carrying the cover {@link withKeptArtwork} keeps.
 */
async function completeFreshResolution(
  sourceTrack: NormalizedTrack,
  links: ResolvedLink[],
  lateLinks: Promise<ResolvedLink[]> | undefined,
): Promise<ResolutionResult> {
  const visible = await filterDisabledLinks(links);
  normalizeTrackLinks(visible);
  const track = await withKeptArtwork(
    {
      ...sourceTrack,
      previewUrl: pickPreferredPreview(visible, sourceTrack.previewUrl),
    },
    visible,
  );
  return {
    sourceTrack: track,
    links: visible,
    externalIds: collectTrackExternalIds(track, visible),
    lateLinks,
  };
}

/**
 * Gives fresh metadata a permitted cover through {@link pickRecordingArtworkUrl}.
 *
 * @param sourceTrack - The resolved track, with the cover its service returned.
 * @param links - The links the resolve found, each with the cover its service
 *   returned.
 * @returns The track with the kept cover, or with none. When neither the track
 *   nor a link has a cover to keep and the track has an ISRC, the cover comes
 *   from {@link findArtworkByIsrc}.
 */
async function withKeptArtwork(sourceTrack: NormalizedTrack, links: readonly ResolvedLink[]): Promise<NormalizedTrack> {
  let artworkUrl = pickRecordingArtworkUrl(sourceTrack.artworkUrl, links, sourceTrack.sourceService);
  if (!artworkUrl && sourceTrack.isrc) {
    artworkUrl = await findArtworkByIsrc(sourceTrack.isrc, new Set(links.map((link) => link.service)));
  }
  return { ...sourceTrack, artworkUrl };
}

/**
 * Asks {@link RECORDING_ARTWORK_LOOKUP_SERVICES} in turn for a cover of the recording.
 *
 * @param isrc - The track's ISRC.
 * @param considered - Services whose link is already in the result. They are
 *   skipped, because their cover was part of the pick that came up empty.
 * @returns The first cover that may be kept, or `undefined`. A service that
 *   fails is logged as a deviation and the next one is asked.
 */
async function findArtworkByIsrc(isrc: string, considered: ReadonlySet<string>): Promise<string | undefined> {
  const active = await getActiveAdapters();
  for (const serviceId of RECORDING_ARTWORK_LOOKUP_SERVICES) {
    const adapter = active.find((candidate) => candidate.id === serviceId);
    if (!adapter || considered.has(serviceId)) continue;
    try {
      const track = await adapter.findByIsrc(isrc);
      const artworkUrl = pickRecordingArtworkUrl(track?.artworkUrl);
      if (artworkUrl) return artworkUrl;
    } catch (error) {
      log.deviation(
        {
          adapterId: serviceId,
          component: "Resolver",
          errorCode: "MC-API-0004",
          operation: "track_artwork_enrichment",
          outcome: "next_artwork_source",
        },
        error,
      );
    }
  }
  return undefined;
}

type RankedSearchCandidate = SearchResultWithCandidates["candidates"][number];

function normalizeCandidateKeyPart(value: string | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function candidateAlbumKey(candidate: RankedSearchCandidate): string {
  const artistKey = candidate.track.artists.map((artist) => normalizeCandidateKeyPart(artist)).join(",");
  const albumKey = normalizeCandidateKeyPart(candidate.track.albumName);
  if (albumKey) return `album:${artistKey}:${albumKey}`;
  if (candidate.track.artworkUrl) return `artwork:${candidate.track.artworkUrl}`;
  return `track:${candidate.track.sourceService}:${candidate.track.sourceId}`;
}

function selectDiverseSearchCandidates(candidates: RankedSearchCandidate[], cap: number): RankedSearchCandidate[] {
  const byTrack = new Map<string, RankedSearchCandidate>();
  for (const candidate of candidates) {
    const key = `${candidate.track.sourceService}:${candidate.track.sourceId}`;
    if (!byTrack.has(key)) byTrack.set(key, candidate);
  }

  const pool = [...byTrack.values()].filter((c) => c.confidence >= CANDIDATE_MIN_CONFIDENCE);
  const selected: RankedSearchCandidate[] = [];
  const usedAlbums = new Set<string>();

  for (const candidate of pool) {
    if (selected.length >= cap) break;
    const albumKey = candidateAlbumKey(candidate);
    if (usedAlbums.has(albumKey)) continue;
    selected.push(candidate);
    usedAlbums.add(albumKey);
  }

  for (const candidate of pool) {
    if (selected.length >= cap) break;
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
  }

  return selected;
}

export async function resolveTextSearch(query: string): Promise<ResolutionResult> {
  // Service search: try all active adapters
  const searchAdapters = await getActiveAdapters();
  let failedSearches = 0;
  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack({
        title: query,
        artist: query,
      });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full cross-service resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached)
            return fillMissingServices(cached, [resolvedTrackLink(adapter, result.track, result.confidence, "search")]);
        }

        const { links, lateLinks } = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return completeFreshResolution(result.track, links, lateLinks);
      }
    } catch (error) {
      failedSearches++;
      log.debug("Resolver", `[${adapter.id}] text search failed:`, error instanceof Error ? error.message : error);
    }
  }

  throw searchExhaustedError(searchAdapters.length, failedSearches, "No track found for the search query");
}

/**
 * Text search variant used by the authenticated POST endpoint.
 *
 * Returns `{ kind: "resolved" }` when a single clear match exists
 * (either through the adapter's native candidate API, or a good
 * confidence on the plain `searchTrack`). Returns
 * `{ kind: "disambiguation" }` with up to `MAX_CANDIDATES` candidates
 * when confidence is below `AUTO_SELECT_THRESHOLD`. The client then
 * calls `resolveSelectedCandidate` with the picked candidate's ID.
 *
 * Adapters that implement `searchTrackWithCandidates` (e.g. Spotify)
 * get the richer path; others fall back to single-result
 * `searchTrack`, which can only trigger the auto-resolve branch.
 *
 * @param query - free-text search query
 * @param structured - optional pre-parsed query; when supplied, adapters receive this
 *   instead of `{ title: query, artist: query }`. Pass `undefined` for free-text callers.
 * @param candidateLimit - optional cap on the disambiguation list, clamped to
 *   `[1, MAX_CANDIDATES]`. Defaults to `MAX_CANDIDATES` when omitted.
 * @returns either a resolved track or a candidate list
 * @throws `ResolveError("TRACK_NOT_FOUND")` if no adapter returns anything usable
 */
export async function resolveTextSearchWithDisambiguation(
  query: string,
  structured?: SearchQuery,
  candidateLimit?: number,
): Promise<TextSearchResult> {
  log.debug("Resolver", "resolveTextSearchWithDisambiguation called with:", query);

  // Service search: try adapters that support searchTrackWithCandidates, then fall back
  const searchAdapters = await getActiveAdapters();
  let failedSearches = 0;

  for (const adapter of searchAdapters) {
    try {
      // Use searchTrackWithCandidates if available (e.g. Spotify)
      if (adapter.searchTrackWithCandidates) {
        const searchResult = await adapter.searchTrackWithCandidates(structured ?? { title: query, artist: query });

        if (searchResult.candidates.length === 0) continue;

        const topCandidate = searchResult.candidates[0];

        // Auto-select when confidence is high enough
        if (topCandidate.confidence >= AUTO_SELECT_THRESHOLD) {
          // Cache lookup by ISRC before full resolve
          if (topCandidate.track.isrc) {
            const cached = await tryCache({ isrc: topCandidate.track.isrc });
            if (cached)
              return {
                kind: "resolved",
                result: await fillMissingServices(cached, [
                  resolvedTrackLink(adapter, topCandidate.track, topCandidate.confidence, "search"),
                ]),
              };
          }

          const { links, lateLinks } = await resolveAcrossServices(topCandidate.track, adapter);
          links.unshift({
            service: adapter.id,
            displayName: adapter.displayName,
            url: topCandidate.track.webUrl,
            confidence: topCandidate.confidence,
            matchMethod: "search",
            externalId: topCandidate.track.sourceId,
          });

          return {
            kind: "resolved",
            result: await completeFreshResolution(topCandidate.track, links, lateLinks),
          };
        }

        // Return candidates for disambiguation
        const cap =
          candidateLimit !== undefined ? Math.min(MAX_CANDIDATES, Math.max(1, candidateLimit)) : MAX_CANDIDATES;
        const candidates: SearchCandidate[] = selectDiverseSearchCandidates(searchResult.candidates, cap).map((c) => ({
          id: `${c.track.sourceService}:${c.track.sourceId}`,
          title: c.track.title,
          artists: c.track.artists,
          albumName: c.track.albumName,
          artworkUrl: c.track.artworkUrl,
          durationMs: c.track.durationMs,
          confidence: c.confidence,
        }));

        return { kind: "disambiguation", candidates };
      }

      // Fallback: use regular searchTrack
      const result = await adapter.searchTrack(structured ?? { title: query, artist: query });

      if (result.found && result.track) {
        // Cache lookup by ISRC before full resolve
        if (result.track.isrc) {
          const cached = await tryCache({ isrc: result.track.isrc });
          if (cached)
            return {
              kind: "resolved",
              result: await fillMissingServices(cached, [
                resolvedTrackLink(adapter, result.track, result.confidence, "search"),
              ]),
            };
        }

        const { links, lateLinks } = await resolveAcrossServices(result.track, adapter);
        links.unshift({
          service: adapter.id,
          displayName: adapter.displayName,
          url: result.track.webUrl,
          confidence: result.confidence,
          matchMethod: "search",
          externalId: result.track.sourceId,
        });

        return {
          kind: "resolved",
          result: await completeFreshResolution(result.track, links, lateLinks),
        };
      }
    } catch (error) {
      failedSearches++;
      log.debug(
        "Resolver",
        `[${adapter.id}] disambiguation search failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  throw searchExhaustedError(searchAdapters.length, failedSearches, "No track found for the search query");
}

/**
 * Second leg of the disambiguation flow. The client passes back the ID
 * of the candidate it picked (format: `<service>:<trackId>`), and the
 * resolver completes the full cross-service resolve against that track.
 *
 * @param candidateId - stable ID from a disambiguation candidate
 *                      (`sourceService:sourceId` as minted in
 *                      `resolveTextSearchWithDisambiguation`)
 * @returns resolved track result
 * @throws `ResolveError("INVALID_URL")` if the candidate ID is malformed
 * @throws `ResolveError("SERVICE_DOWN")` if the referenced service adapter is unavailable
 */
export async function resolveSelectedCandidate(candidateId: string): Promise<ResolutionResult> {
  // candidateId format: "spotify:trackId"
  const [service, trackId] = candidateId.split(":", 2);
  if (!service || !trackId) {
    throw new ResolveError("INVALID_URL", "Invalid candidate ID format");
  }

  const active = await getActiveAdapters();
  const adapter = active.find((a) => a.id === service);
  if (!adapter) {
    throw new ResolveError("SERVICE_DOWN", `${service} is not available`);
  }

  const sourceTrack = await adapter.getTrack(trackId);

  // Video sources have no ISRC. Their canonical URL still identifies the
  // stored recording, which must keep its share id and receive the same gap fill.
  const cached = await tryCache({
    url: sourceTrack.webUrl,
    serviceLink: serviceLinkLookup(adapter, trackId),
    isrc: sourceTrack.isrc,
  });
  if (cached)
    return fillMissingServices(cached, [
      resolvedTrackLink(adapter, sourceTrack, IDENTIFIER_MATCH_CONFIDENCE, "search"),
    ]);

  const { links, lateLinks } = await resolveAcrossServices(sourceTrack, adapter);

  links.unshift({
    service: adapter.id,
    displayName: adapter.displayName,
    url: sourceTrack.webUrl,
    confidence: 1.0,
    matchMethod: "search",
    externalId: sourceTrack.sourceId,
  });

  return completeFreshResolution(sourceTrack, links, lateLinks);
}

async function resolveAcrossServices(
  sourceTrack: NormalizedTrack,
  excludeAdapter: ServiceAdapter,
): Promise<CrossServiceLinks> {
  const active = await getActiveAdapters();
  const targetAdapters = active.filter((a) => a.id !== excludeAdapter.id);

  const fanOut = await settleWithinDeadline(
    targetAdapters.map((adapter) => resolveOnServiceWithTimeout(adapter, sourceTrack)),
    RESOLVE_RESPONSE_DEADLINE_MS,
  );

  const links = collectMatchedLinks(targetAdapters, fanOut.early);
  normalizeTrackLinks(links);

  // For services with no match, add YouTube search fallback
  const coveredServices = new Set([excludeAdapter.id, ...links.map((l) => l.service)]);

  if (!coveredServices.has("youtube") && sourceTrack.title && sourceTrack.artists.length > 0) {
    const searchQuery = encodeURIComponent(`${sourceTrack.artists[0]} ${sourceTrack.title}`);
    links.push({
      service: "youtube",
      displayName: getPlatformLabel("youtube"),
      url: `https://music.youtube.com/search?q=${searchQuery}`,
      confidence: SEARCH_FALLBACK_CONFIDENCE,
      matchMethod: "search-fallback",
    });
  }

  // Sort by confidence (highest first)
  links.sort((a, b) => b.confidence - a.confidence);

  // Filter out low-confidence matches (but keep search fallbacks)
  const responseLinks = links.filter(
    (l) => l.confidence >= LINK_QUALITY_THRESHOLD || l.matchMethod === "search-fallback",
  );

  const lateAdapterIndices = indicesStillRunning(fanOut.early);
  if (lateAdapterIndices.length === 0) return { links: responseLinks };

  log.debug(
    "Resolver",
    `Answering without ${lateAdapterIndices.map((index) => targetAdapters[index].id).join(", ")}; their links are stored when they arrive`,
  );
  const lateLinks = fanOut.all.then((results) => {
    const late = collectMatchedLinks(
      lateAdapterIndices.map((index) => targetAdapters[index]),
      lateAdapterIndices.map((index) => results[index]),
    );
    normalizeTrackLinks(late);
    return late.filter((l) => l.confidence >= LINK_QUALITY_THRESHOLD);
  });

  return { links: responseLinks, lateLinks };
}

/**
 * Links found for a source track on the other services.
 *
 * @property links - What arrived before {@link RESOLVE_RESPONSE_DEADLINE_MS},
 *   ready for the response: with the derived YouTube Music link and the YouTube
 *   search fallback, sorted by confidence and filtered by link quality.
 * @property lateLinks - Present when services were still running at the
 *   deadline. Settles, never rejects, with the qualifying links they produced,
 *   for {@link persistLateTrackLinks} to store on the track.
 */
interface CrossServiceLinks {
  links: ResolvedLink[];
  lateLinks?: Promise<ResolvedLink[]>;
}

/**
 * Turns per-service results into links and logs fulfilled outcomes. Failures
 * are already logged by resolveOnServiceWithTimeout for fresh and cached paths.
 * An undefined result belongs to a service still running and is skipped.
 *
 * @param adapters - The services, in the same order as `results`.
 * @param results - One settled result, or `undefined`, per service.
 * @returns The links of every service that matched.
 */
function collectMatchedLinks(
  adapters: readonly ServiceAdapter[],
  results: ReadonlyArray<PromiseSettledResult<ResolvedLink | null> | undefined>,
): ResolvedLink[] {
  const links: ResolvedLink[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const adapter = adapters[i];
    if (!result) continue;

    if (result.status === "fulfilled" && result.value) {
      log.debug("Resolver", `[${adapter.id}] matched: confidence=${result.value.confidence}`);
      links.push(result.value);
    } else if (result.status === "fulfilled") {
      log.debug("Resolver", `[${adapter.id}] no match found`);
    }
  }
  return links;
}

/**
 * Keeps one destination per provider and derives a validated music-video alias.
 *
 * Sources are assembled first. A recording replaces a search-page fallback,
 * while stronger evidence can replace a weaker provider observation. Validated
 * video grammar is shared with the input adapter; search pages never become
 * recording destinations. Availability filtering belongs to the calling boundary.
 *
 * @param links - Final source set or completed deadline batch, mutated in place.
 */
function normalizeTrackLinks(links: ResolvedLink[]): void {
  const unique = new Map<ServiceId, ResolvedLink>();
  for (const link of links) {
    const current = unique.get(link.service);
    if (
      !current ||
      (current.matchMethod === "search-fallback" && link.matchMethod !== "search-fallback") ||
      (link.matchMethod !== "search-fallback" && link.confidence > current.confidence)
    )
      unique.set(link.service, link);
  }
  links.splice(0, links.length, ...unique.values());
  const youtubeLink = links.find((link) => link.service === "youtube");
  if (
    !youtubeLink ||
    youtubeLink.matchMethod === "search-fallback" ||
    links.some((link) => link.service === "youtube-music")
  )
    return;

  const videoId = youtubeVideoId(youtubeLink.url);
  if (!videoId) return;
  links.push({
    service: "youtube-music",
    displayName: getPlatformLabel("youtube-music"),
    url: `https://music.youtube.com/watch?v=${videoId}`,
    confidence: youtubeLink.confidence,
    matchMethod: youtubeLink.matchMethod,
    externalId: videoId,
  });
}

/**
 * @param early - The settled-by-deadline results of a fan-out.
 * @returns The positions of the services that had not settled by the deadline.
 */
function indicesStillRunning(early: ReadonlyArray<PromiseSettledResult<unknown> | undefined>): number[] {
  return early.flatMap((result, index) => (result === undefined ? [index] : []));
}

/**
 * Upper bound for one service's lookup. The response no longer waits for it,
 * see {@link RESOLVE_RESPONSE_DEADLINE_MS}, but the background work that stores
 * late links does, and a service that never answers must not hold that open.
 */
const ADAPTER_TIMEOUT_MS = 10_000;

/**
 * {@link resolveOnService} raced against {@link ADAPTER_TIMEOUT_MS}. The timer
 * is cleared once the lookup settles, so a fast answer leaves nothing pending.
 */
function resolveOnServiceWithTimeout(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
  knownLink?: ResolvedLink,
): Promise<ResolvedLink | null> {
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutTimer = setTimeout(() => reject(new Error(`Timeout after ${ADAPTER_TIMEOUT_MS}ms`)), ADAPTER_TIMEOUT_MS);
  });
  return Promise.race([resolveOnService(adapter, sourceTrack, knownLink), timeout])
    .catch((error) => {
      log.deviation(
        {
          component: "Resolver",
          adapterId: adapter.id,
          errorCode: "MC-API-0004",
          operation: "resolve_recording_destination",
          outcome: "destination_not_added",
        },
        error,
      );
      throw error;
    })
    .finally(() => clearTimeout(timeoutTimer));
}

/**
 * Refreshes a known destination by its id, otherwise tries ISRC before text.
 *
 * @param adapter - Enabled, configured provider owning the destination.
 * @param sourceTrack - Original recording identity; display metadata stays intact.
 * @param knownLink - Existing destination being refreshed for preview or artwork.
 * @returns A validated match with enrichment metadata, or null for a clean miss.
 * @throws Provider failures, which must not become negative catalogue cache entries.
 */
async function resolveOnService(
  adapter: ServiceAdapter,
  sourceTrack: NormalizedTrack,
  knownLink?: ResolvedLink,
): Promise<ResolvedLink | null> {
  if (knownLink) {
    const sourceId = adapter.detectUrl(knownLink.url);
    if (sourceId) {
      const track = await adapter.getTrack(sourceId);
      if (!isTrackSearchFallbackMatch(recordingSearchQuery(sourceTrack), track)) {
        log.deviation(
          {
            component: "Resolver",
            adapterId: adapter.id,
            errorCode: "MC-API-0004",
            operation: "cached_recording_identity",
            outcome: "cover_not_borrowed",
          },
          new Error("Cached catalogue metadata does not match the recording"),
        );
        return null;
      }
      return resolvedTrackLink(adapter, track, knownLink.confidence, knownLink.matchMethod);
    }
  }
  // Strategy 1: ISRC lookup (most reliable)
  if (adapter.capabilities.supportsIsrc && sourceTrack.isrc) {
    if (adapter.id === "youtube") {
      // YouTube doesn't support ISRC anyway, but just in case
      return resolveViaSearch(adapter, sourceTrack);
    }

    const track = await adapter.findByIsrc(sourceTrack.isrc);
    if (track) {
      return resolvedTrackLink(adapter, track, IDENTIFIER_MATCH_CONFIDENCE, "isrc");
    }
  }

  // Strategy 2: Text search (fallback)
  return resolveViaSearch(adapter, sourceTrack);
}

/**
 * Accepts structured text matches only when they retain the confirmed recording identity.
 * @param adapter - Provider being queried through its existing search operation.
 * @param sourceTrack - Original recording, never rewritten by lookup normalization.
 * @returns A compatible link or null for a completed clean miss.
 * @throws Provider failures and incompatible claimed positives, neither of which is a catalog miss.
 */
async function resolveViaSearch(adapter: ServiceAdapter, sourceTrack: NormalizedTrack): Promise<ResolvedLink | null> {
  const query = recordingSearchQuery(sourceTrack);
  const result: MatchResult = await adapter.searchTrack(query);

  if (!result.found) return null;
  if (!result.track || !isTrackSearchFallbackMatch(query, result.track)) {
    throw new UpstreamUnavailableError(adapter.id, "track search returned incompatible recording metadata");
  }

  return resolvedTrackLink(
    adapter,
    result.track,
    confidenceForMethod(result.matchMethod, result.confidence),
    result.matchMethod,
  );
}

/**
 * Retains enrichment metadata consistently across identifier, text and refresh matches.
 *
 * @param adapter - Provider that returned the recording.
 * @param track - Validated recording metadata, not a search-result page.
 * @param confidence - Score already assigned by the matching strategy.
 * @param matchMethod - Evidence behind that score; refreshes preserve it.
 * @returns The destination plus metadata consumed by persistence and cover policy.
 */
function resolvedTrackLink(
  adapter: ServiceAdapter,
  track: NormalizedTrack,
  confidence: number,
  matchMethod: MatchMethod,
): ResolvedLink {
  return {
    service: adapter.id,
    displayName: adapter.displayName,
    url: track.webUrl,
    confidence,
    matchMethod,
    externalId: track.sourceId,
    previewUrl: track.previewUrl,
    artworkUrl: pickRecordingArtworkUrl(undefined, [{ service: adapter.id, artworkUrl: track.artworkUrl }]),
    isrc: track.isrc,
    mbid: track.mbid,
    iswc: track.iswc,
  };
}

/**
 * Scrape OG meta tags from a music service page to extract title and artist.
 * Used as fallback when the source adapter has no API credentials.
 *
 * Supports formats:
 *   - English: "Title by Artist on Service"
 *   - German: "„Title" von Artist bei Service"
 *   - French: "Title par Artist sur Service"
 *   - Generic fallback: split on common separators
 */
async function scrapeTrackFromPage(
  url: string,
): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          // Bot UA gets server-rendered OG tags (SPA shells don't include them)
          "User-Agent": "facebookexternalhit/1.1",
        },
        redirect: "follow",
      },
      8000,
    );

    if (!response.ok) return null;

    const html = await response.text();

    // Extract og:title
    const ogTitleMatch = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html);
    if (!ogTitleMatch?.[1]) return null;

    const ogTitle = ogTitleMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/\u201E|\u201C|\u201D/g, ""); // Remove „ " " quotes

    // Extract og:image for artwork
    const ogImageMatch = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html);
    const artworkUrl = ogImageMatch?.[1] || undefined;

    // Try locale-aware patterns: "Title by Artist on Service", "Title von Artist bei Service"
    const patterns = [
      /^(.+?)\s+by\s+(.+?)\s+on\s+.+$/i, // English
      /^(.+?)\s+von\s+(.+?)\s+bei\s+.+$/i, // German
      /^(.+?)\s+par\s+(.+?)\s+sur\s+.+$/i, // French
      /^(.+?)\s+di\s+(.+?)\s+su\s+.+$/i, // Italian
      /^(.+?)\s+de\s+(.+?)\s+en\s+.+$/i, // Spanish
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(ogTitle);
      if (match?.[1] && match?.[2]) {
        return { title: match[1].trim(), artist: match[2].trim(), artworkUrl };
      }
    }

    // Fallback: use og:title as free-text query (strip " on/bei/sur ServiceName")
    const stripped = ogTitle
      .replace(
        /\s+(on|bei|sur|su|en)\s+(Apple Music|Spotify|Deezer|Tidal|YouTube|SoundCloud|Qobuz|Pandora|Napster|Audius).*$/i,
        "",
      )
      .trim();

    if (stripped && stripped !== ogTitle) {
      // "Title - Artist" or "Title by Artist" without service suffix
      const dashSplit = stripped.split(/\s+[-–—]\s+/);
      if (dashSplit.length >= 2) {
        return { title: dashSplit[0].trim(), artist: dashSplit[1].trim(), artworkUrl };
      }
    }

    // Last resort: use the cleaned title as both title and artist (free-text search)
    if (stripped && !stripped.toLowerCase().includes("web player")) {
      return { title: stripped, artist: stripped, artworkUrl };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback resolver for URLs where the source adapter has no API credentials.
 * Scrapes the page for OG metadata, then does a cross-service text search.
 */
async function resolveUrlViaScrape(url: string, sourceServiceId: ServiceId): Promise<ResolutionResult> {
  const scraped = await scrapeTrackFromPage(url);
  if (!scraped) {
    throw new ResolveError(
      "SERVICE_DOWN",
      `Cannot resolve ${sourceServiceId} URL: adapter not configured and page scrape failed`,
    );
  }

  log.debug("Resolver", `Scraped from page: "${scraped.title}" by ${scraped.artist}`);

  // Search across all active adapters
  const searchAdapters = await getActiveAdapters();
  const query = { title: scraped.title, artist: scraped.artist };

  let bestSourceTrack: NormalizedTrack | null = null;
  let bestAdapter: ServiceAdapter | null = null;
  let bestConfidence = 0;

  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack(query);
      if (result.found && result.track && result.confidence > bestConfidence) {
        bestSourceTrack = result.track;
        bestAdapter = adapter;
        bestConfidence = result.confidence;
      }
    } catch (error) {
      log.debug(
        "Resolver",
        `[${adapter.id}] scrape fallback search failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!bestSourceTrack || !bestAdapter) {
    throw new ResolveError("TRACK_NOT_FOUND", `Track not found: "${scraped.title}" by ${scraped.artist}`);
  }

  // The page image retains its provider even when catalogue metadata came from
  // another service. Both observations belong to the same verified cache identity.
  const observations: ResolvedLink[] = [
    {
      service: sourceServiceId,
      displayName: PLATFORM_CONFIG[sourceServiceId].label,
      url,
      confidence: 0.9,
      matchMethod: "search",
      artworkUrl: pickRecordingArtworkUrl(scraped.artworkUrl, [], sourceServiceId),
    },
    resolvedTrackLink(bestAdapter, bestSourceTrack, bestConfidence, "search"),
  ];
  if (bestSourceTrack.isrc) {
    const cached = await tryCache({ isrc: bestSourceTrack.isrc });
    if (cached) return fillMissingServices(cached, observations);
  }

  // Resolve across all other services
  const { links, lateLinks } = await resolveAcrossServices(bestSourceTrack, bestAdapter);

  links.unshift(...observations);
  return completeFreshResolution(bestSourceTrack, links, lateLinks);
}

// ─── Last.fm URL → text query ──────────────────────────────────────────────
//
// Last.fm URLs from genre-search have three shapes:
//   /music/Artist/_/Track   → "Artist - Track"
//   /music/Artist/Album     → "Artist - Album"
//   /music/Artist           → "Artist"
//
// Path segments are URL-encoded (`%20`, `+`). We decode them and return
// a plain-text query string that resolveTextSearch can handle.

const LASTFM_HOST_RE = /^(?:www\.)?last\.fm$/i;

function parseLastfmUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!LASTFM_HOST_RE.test(parsed.hostname)) return null;

  // /music/Artist/_/Track  or  /music/Artist/Album  or  /music/Artist
  const match = parsed.pathname.match(/^\/music\/([^/]+)(?:\/([^/]+)(?:\/([^/]+))?)?/);
  if (!match) return null;

  const artist = decodeURIComponent(match[1].replace(/\+/g, " "));
  const second = match[2] ? decodeURIComponent(match[2].replace(/\+/g, " ")) : null;
  const third = match[3] ? decodeURIComponent(match[3].replace(/\+/g, " ")) : null;

  // /music/Artist/_/Track → text search "Artist - Track"
  if (second === "_" && third) return `${artist} - ${third}`;
  // /music/Artist/Album → text search "Artist - Album"
  if (second && second !== "_") return `${artist} - ${second}`;
  // /music/Artist → text search "Artist"
  return artist;
}
