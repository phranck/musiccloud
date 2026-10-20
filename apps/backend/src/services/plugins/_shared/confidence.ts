/**
 * @file Shared interpretation and ranking of catalog search results.
 *
 * Free-text discovery trusts provider ranking because no recording identity is
 * known yet. Structured queries compare known metadata and reject a different
 * artist, performance version, or incompatible duration before assigning a score.
 * Featured-artist suffixes have bounded credit-free interpretations for lookup
 * and scoring only; neither query nor provider display metadata is rewritten.
 *
 * Query builders and scorers consume the same title and identity rules, so a
 * provider cannot accept a broadened query and then penalize its display credits.
 * Album scoring also includes the requested release year and track count.
 */
import {
  calculateAlbumConfidence,
  calculateArtistNameConfidence,
  calculateConfidence,
  stringSimilarity,
} from "../../../lib/resolve/normalize";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type { AlbumSearchQuery, NormalizedTrack, SearchQuery } from "../../types.js";
import { artistIdentityNames, artistNameForSearch } from "./artists.js";

/** Exact artist names and their leading-"The" equivalents qualify for a catalog match. */
const MIN_FALLBACK_ARTIST_CONFIDENCE = 0.9;
/** Compare the full credit and its leading performer, never a guest alone. */
const PRIMARY_ARTIST_NAME_COUNT = 2;
/** The existing scorer's widest duration tier, applied as a hard identity bound. */
const MAX_FALLBACK_DURATION_DIFFERENCE_MS = 10_000;
/** Recognized performance families inside explicitly separated title suffixes. */
const VERSION_QUALIFIER =
  /\b(live|remix|acoustic|instrumental|karaoke|cover|slowed|sped\s+up|radio\s+edit|drumless)\b/i;

/**
 * Reads bounded version suffixes, including named remixes, without scanning the base title.
 * @param title - Original display title, never rewritten or persisted here.
 * @returns A normalized version family, excluding featured-performer-only suffixes.
 */
function recordingVersionQualifier(title: string): string | undefined {
  for (const suffix of title.split(/[()[\]]|\s-\s/).slice(1)) {
    if (/^\s*(?:feat(?:uring)?\.?|ft\.?)\s+/i.test(suffix)) continue;
    const version = VERSION_QUALIFIER.exec(suffix)?.[1];
    if (version) return version.toLowerCase().replace(/\s+/g, " ");
  }
  return undefined;
}

/**
 * Whether two durations can belong to one recording.
 * A missing duration is no evidence either way. The bound is a hard identity limit that the matching guard and the
 * repair planners share, so a stored destination is judged by the rule that would reject it today.
 *
 * @param wantedMs - The requested recording's duration, when known.
 * @param actualMs - The candidate's duration, when known.
 * @returns False only when both are known and differ by more than 10 seconds.
 */
export function recordingDurationsAgree(wantedMs: number | undefined, actualMs: number | undefined): boolean {
  return !wantedMs || !actualMs || Math.abs(wantedMs - actualMs) <= MAX_FALLBACK_DURATION_DIFFERENCE_MS;
}

/**
 * Reads the free-text marker without confusing a known self-titled recording.
 *
 * @param query - Search metadata; a nonempty artist list identifies structured input.
 * @returns Whether title and artist contain the same text without known artists.
 */
export function isFreeTextSearch(query: Pick<SearchQuery, "title" | "artist" | "artists">): boolean {
  return query.title === query.artist && !query.artists?.length;
}

/**
 * Builds provider search text without duplicating an unstructured query.
 *
 * @param query - A title and artist, or the resolver's free-text marker.
 * @returns The original free text or artist followed by title.
 */
export function searchText(query: Pick<SearchQuery, "title" | "artist" | "artists">): string {
  return isFreeTextSearch(query) ? query.title : `${query.artist} ${query.title}`;
}

/**
 * Returns the original title and at most one credit-free search interpretation.
 *
 * @param title - Display title, which remains unchanged.
 * @returns One or two distinct nonempty titles, with the original first.
 */
export function trackSearchTitles(title: string): string[] {
  const original = title.trim();
  const clean = original.replace(/\s+(?:[([]\s*)?(?:feat(?:uring)?\.?|ft\.?)\s+.+$/i, "").trim();
  return [...new Set([original, clean].filter(Boolean))];
}

/**
 * Retains full artist credits alongside explicit collaboration and provider-reported alias terms.
 * @param artists - Original metadata array, which is never mutated.
 * @param service - Optional provenance for provider-specific bilingual labels.
 * @returns Comparison-only full credits and their bounded interpretations.
 */
function comparisonArtistNames(artists: readonly string[], service?: NormalizedTrack["sourceService"]): string[] {
  return artists.flatMap((artist) => {
    const lookup = artistNameForSearch(artist, service);
    return lookup === artist ? artistIdentityNames(artist) : [artist, ...artistIdentityNames(lookup)];
  });
}

/**
 * Rejects search candidates that do not identify the requested recording.
 *
 * Provider ranking is not identity evidence for known metadata. The same guard
 * protects broadened queries, candidate scores, and cached enrichment. A genuine
 * free-text search has no known artist list and keeps its ranking semantics.
 *
 * @param query - Original structured metadata, not a broadened lookup string.
 * @param candidate - Provider recording with its original display metadata.
 * @returns Whether artist, title, duration and performance version are compatible.
 */
export function isTrackSearchFallbackMatch(query: SearchQuery, candidate: NormalizedTrack): boolean {
  if (isFreeTextSearch(query) && !query.artists?.length) return true;
  const wantedArtists = artistIdentityNames(query.artist).slice(0, PRIMARY_ARTIST_NAME_COUNT);
  const actualArtists = comparisonArtistNames(candidate.artists, candidate.sourceService);
  const sameArtist = wantedArtists.some((wanted) =>
    actualArtists.some((actual) => calculateArtistNameConfidence(wanted, actual) >= MIN_FALLBACK_ARTIST_CONFIDENCE),
  );
  const sameTitle = trackSearchTitles(query.title).some((wanted) =>
    trackSearchTitles(candidate.title).some((actual) => stringSimilarity(wanted, actual) >= MATCH_MIN_CONFIDENCE),
  );
  const wantedVersion = recordingVersionQualifier(query.title);
  const actualVersion = recordingVersionQualifier(candidate.title);
  const sameDuration = recordingDurationsAgree(query.durationMs, candidate.durationMs);
  return sameArtist && sameTitle && wantedVersion === actualVersion && sameDuration;
}

/**
 * Chooses an interpretation for one source credit without counting aliases as extra performers.
 * @param credit - Original single credit, including any explicit featuring or collaboration marker.
 * @param candidates - Comparison terms reported by the candidate recording.
 * @returns The best full or leading-performer name, retaining the source artist count.
 */
function queryArtistComparisonName(credit: string, candidates: readonly string[]): string {
  let best = credit;
  let bestScore = 0;
  for (const name of artistIdentityNames(credit).slice(0, PRIMARY_ARTIST_NAME_COUNT)) {
    const score = Math.max(0, ...candidates.map((candidate) => stringSimilarity(name, candidate)));
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Scores a provider result without treating display credits as a different song.
 *
 * Structured matching uses the existing confidence weights over the same bounded
 * title interpretations that query builders use. Identity guards run first so a
 * cover or live performance cannot outrank the requested studio recording. Free
 * text retains the provider-position decay and its existing floor.
 *
 * @param query - Original search metadata, never mutated.
 * @param track - Candidate retaining its display title and artist credits.
 * @param index - Zero-based provider rank, used only for free-text discovery.
 * @returns Confidence in [0, 1], or zero for an incompatible recording.
 */
export function scoreSearchCandidate(query: SearchQuery, track: NormalizedTrack, index: number): number {
  if (!isTrackSearchFallbackMatch(query, track)) return 0;
  if (isFreeTextSearch(query)) return Math.max(0.4, 0.85 - index * 0.05);
  const candidateArtistNames = comparisonArtistNames(track.artists, track.sourceService);
  const queryArtistNames = (query.artists?.length ? query.artists : [query.artist]).map((artist) =>
    queryArtistComparisonName(artist, candidateArtistNames),
  );
  return Math.max(
    ...trackSearchTitles(query.title).flatMap((wanted) =>
      trackSearchTitles(track.title).map((actual) =>
        calculateConfidence(
          {
            title: wanted,
            artists: queryArtistNames,
            durationMs: query.durationMs,
          },
          { title: actual, artists: candidateArtistNames, durationMs: track.durationMs },
        ),
      ),
    ),
  );
}

/**
 * A provider album with the optional edition evidence consumed by ranking.
 *
 * @property releaseDate - A complete date or a year; only the first four characters count.
 * @property totalTracks - Track count, when the provider reports it.
 */
export interface AlbumCandidate {
  /** Provider provenance, used only for verified artist-label interpretations. */
  sourceService?: NormalizedTrack["sourceService"];
  title: string;
  artists: string[];
  releaseDate?: string;
  totalTracks?: number;
}

/**
 * Scores an album using every edition term supplied by the caller.
 *
 * @param query - Requested title, artist, year and track count.
 * @param album - Provider album with any available edition evidence.
 * @returns Existing weighted confidence in [0, 1].
 */
export function scoreAlbumCandidate(query: AlbumSearchQuery, album: AlbumCandidate): number {
  return calculateAlbumConfidence(
    { title: query.title, artists: [query.artist], releaseDate: query.year, totalTracks: query.totalTracks },
    {
      title: album.title,
      artists: comparisonArtistNames(album.artists, album.sourceService),
      releaseDate: album.releaseDate,
      totalTracks: album.totalTracks,
    },
  );
}
