/**
 * @file Serves a track resolve from the database and completes the cached
 * recording: the three cache lookups, the gap fill across missing services,
 * the recorded service misses and the preview refresh check.
 *
 * A cache hit identifies the recording, not a complete destination set, so
 * every hit passes through {@link fillMissingServices}.
 */
import { getRepository } from "../../db/index.js";
import { log } from "../../lib/infra/logger.js";
import { pickPreferredPreview } from "../../lib/preview-url.js";
import { RECORDING_ARTWORK_LOOKUP_SERVICES } from "../artwork.js";
import { SERVICE_MISS_TTL_MS } from "../constants.js";
import { RESOLVE_RESPONSE_DEADLINE_MS, settleWithinDeadline } from "../fan-out-deadline.js";
import { filterDisabledLinks, getActiveAdapters } from "../index.js";
import { keepRecordingArtwork } from "../recording-artwork.js";
import { fromCachedLinks, isStoredPreviewFresh, uniqueAdaptersByService } from "../resolved-links.js";
import type { ServiceLinkLookup } from "../service-link-lookup.js";
import type { ServiceAdapter } from "../types.js";
import { normalizeTrackLinks } from "./completion.js";
import { indicesStillRunning, resolveOnServiceWithTimeout } from "./fan-out.js";
import { persistTrackLinks } from "./persist-links.js";
import type { ResolutionResult, ResolvedLink } from "./types.js";

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
 *
 * @param lookup - The keys to try, in the order above; absent keys are skipped.
 * @returns The cached recording with its stored links and share id, or null.
 */
export async function tryCache(lookup: {
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

    const links: ResolvedLink[] = fromCachedLinks(cached.links);
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
export async function fillMissingServices(
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
  const adaptersToFetch = uniqueAdaptersByService([
    ...missingAdapters,
    ...(deezerAdapter ? [deezerAdapter] : []),
    ...artworkAdapters,
  ]);

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
 *
 * @param cached - The cached recording; without a track id only its own preview counts.
 * @returns Whether a preview refresh is needed. A failed read counts as needed.
 */
async function isPreviewRefreshNeeded(cached: ResolutionResult): Promise<boolean> {
  if (!cached.trackId) return !cached.sourceTrack.previewUrl;
  try {
    const repo = await getRepository();
    const previews = await repo.findTrackPreviews(cached.trackId);
    return !isStoredPreviewFresh(previews);
  } catch (error) {
    log.debug(
      "Resolver",
      `Preview-refresh check failed, defaulting to refresh: ${error instanceof Error ? error.message : error}`,
    );
    return true;
  }
}
