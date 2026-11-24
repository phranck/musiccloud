/**
 * @file Bandcamp search: the fuzzysearch endpoint and the ranking of its hits.
 *
 * The search goes through the JSON endpoint also used by Bandcamp clients,
 * normalizes its track and album URLs, then fetches the candidate pages (see
 * `scrape.ts`) for their structured data before confidence scoring.
 */
import { Operation, ResourceKind, Service } from "@musiccloud/shared";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import type { MatchResult, NormalizedTrack, SearchQuery } from "../../types.js";
import { throwIfSearchIncomplete } from "../_shared/candidates.js";
import { scoreSearchCandidate } from "../_shared/confidence.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { pickBestTrack, searchMatchResult, trackScoreLogger } from "../_shared/rank.js";
import { bandcampFetch, fetchTrackByUrl, fetchTracksByAlbumUrl } from "./scrape.js";

/** The most search hits one search keeps. */
const MAX_SEARCH_RESULTS = 10;

/** The most album hits `searchBandcampAlbums` returns. */
const MAX_ALBUM_RESULTS = 5;

/** The `type` of a track hit in Bandcamp's fuzzysearch answer. */
const TRACK_HIT_TYPE = "t";

/** The `type` of an album hit in Bandcamp's fuzzysearch answer. */
const ALBUM_HIT_TYPE = "a";

/** The request that searches Bandcamp. The query text is appended URL-encoded. */
const SEARCH_URL_PREFIX = "https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=";

/** The query parameters after the search text. */
const SEARCH_URL_SUFFIX = "&param_with_locations=true";

/** What `requireProviderCollection` calls the lookup in its error. */
const SEARCH_COLLECTION_LABEL = "catalog search";

/** A hit of the Bandcamp search. */
export type BandcampSearchResult = {
  kind: "track" | "album";
  url: string;
  name: string;
  artist: string;
  albumName?: string;
};

interface BandcampFuzzySearchResponse {
  results?: Array<{
    type?: string;
    url?: string;
    name?: string;
    band_name?: string;
    album_name?: string;
  }>;
}

/**
 * Extracts the page URL from a search hit's URL field.
 *
 * @param rawUrl - The URL field of a hit, which may carry tracking parameters or several URLs.
 * @param kind - Whether the hit is a track or an album.
 * @returns The last matching `{artist}.bandcamp.com/track/...` or `/album/...`
 *   URL, cut before any query string, or `null` when there is none.
 */
function normalizeBandcampResultUrl(rawUrl: string | undefined, kind: "track" | "album"): string | null {
  if (!rawUrl) return null;
  const matches =
    kind === "track"
      ? [...rawUrl.matchAll(/https?:\/\/[a-z0-9-]+\.bandcamp\.com\/track\/[^"\s?&#]+/g)]
      : [...rawUrl.matchAll(/https?:\/\/[a-z0-9-]+\.bandcamp\.com\/album\/[^"\s?&#]+/g)];
  return matches.at(-1)?.[0] ?? null;
}

/**
 * Searches Bandcamp's fuzzysearch endpoint.
 *
 * @param query - The search text.
 * @returns Up to {@link MAX_SEARCH_RESULTS} distinct track and album hits in
 *   the order Bandcamp returned them.
 * @throws {ResolveError} When the request fails, Bandcamp answers an error
 *   status, or the body is not a result list.
 */
export async function searchBandcamp(query: string): Promise<BandcampSearchResult[]> {
  const searchUrl = `${SEARCH_URL_PREFIX}${encodeURIComponent(query)}${SEARCH_URL_SUFFIX}`;
  const response = await bandcampFetch(searchUrl, ResourceKind.Track, query, Operation.Search);
  // A search without results answers 200 with an empty list, so an error
  // status or a body that is not JSON is a failure rather than an answer.
  if (!response.ok) {
    throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Track, query, Operation.Search);
  }

  const payload = (await response.json()) as BandcampFuzzySearchResponse;
  const results: BandcampSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const item of requireProviderCollection(payload.results, Service.BandCamp, SEARCH_COLLECTION_LABEL)) {
    if (item.type !== TRACK_HIT_TYPE && item.type !== ALBUM_HIT_TYPE) continue;

    const kind = item.type === TRACK_HIT_TYPE ? "track" : "album";
    const url = normalizeBandcampResultUrl(item.url, kind);
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    results.push({
      kind,
      url,
      name: item.name?.trim() ?? "",
      artist: item.band_name?.trim() ?? "",
      albumName: item.album_name?.trim() || undefined,
    });

    if (results.length >= MAX_SEARCH_RESULTS) break;
  }

  return results;
}

/**
 * Searches Bandcamp for albums.
 *
 * @param query - The search text.
 * @returns Up to {@link MAX_ALBUM_RESULTS} album hits with their page URL, name and artist.
 * @throws {ResolveError} As {@link searchBandcamp} does.
 */
export async function searchBandcampAlbums(
  query: string,
): Promise<Array<{ url: string; name: string; artist: string }>> {
  const results = await searchBandcamp(query);
  return results
    .filter((result) => result.kind === "album")
    .map((result) => ({ url: result.url, name: result.name, artist: result.artist }))
    .slice(0, MAX_ALBUM_RESULTS);
}

/**
 * Fetches the tracks behind one search hit.
 *
 * @param result - A search hit.
 * @returns Every track of an album hit, the one track of a track hit, or an
 *   empty list when the page is gone.
 */
async function fetchTracksForSearchResult(result: BandcampSearchResult): Promise<NormalizedTrack[]> {
  if (result.kind === "album") return fetchTracksByAlbumUrl(result.url);

  const track = await fetchTrackByUrl(result.url);
  return track ? [track] : [];
}

/** Writes the per-track score debug line of a Bandcamp search. */
const logBandcampTrackScore = trackScoreLogger("Bandcamp");

/**
 * Fetches the tracks behind each search hit and keeps the best one.
 *
 * A track hit contributes its own page, an album hit every track of its album.
 * Every track scores with the position of the search hit it came from, so all
 * tracks of one album share that position.
 *
 * @param query - The track searched for.
 * @param results - Bandcamp's search hits in the order it returned them.
 * @returns The best track under `MATCH_MIN_CONFIDENCE`, or a miss with the
 *   best score reached.
 * @throws When a page failed to load and the result is a miss, because that
 *   miss would not be complete.
 */
export async function findBestBandcampMatch(query: SearchQuery, results: BandcampSearchResult[]): Promise<MatchResult> {
  const candidateResults = await Promise.allSettled(results.map((r) => fetchTracksForSearchResult(r)));
  const tracks = candidateResults.flatMap((result, index) =>
    result.status === "fulfilled" ? result.value.map((track) => ({ track, index })) : [],
  );
  const { best, confidence } = pickBestTrack(
    tracks,
    (track, index) => scoreSearchCandidate(query, track, index),
    logBandcampTrackScore,
  );

  const match = searchMatchResult("track", best, confidence);
  throwIfSearchIncomplete(candidateResults, match.found, Service.BandCamp);
  return match;
}
