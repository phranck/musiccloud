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
/**
 * Score of the provider's first free-text result. Each later position loses
 * {@link PROVIDER_RANK_STEP} down to {@link PROVIDER_RANK_FLOOR}. It stays below
 * `AUTO_SELECT_THRESHOLD`, so free text always lists candidates.
 */
const FREE_TEXT_TOP_CONFIDENCE = 0.85;
/**
 * Score of every free-text result whose title or artist is exactly the text
 * typed. It sits above {@link FREE_TEXT_TOP_CONFIDENCE}, so such a result ranks
 * ahead of a spelling the provider corrected the text to, and below
 * `AUTO_SELECT_THRESHOLD`, so it is still offered rather than resolved. Equal
 * scores keep the provider's order, because the adapters sort stably.
 */
const FREE_TEXT_EXACT_CONFIDENCE = 0.88;
/**
 * Score of the provider's first result for a structured search that names a
 * title or an artist but not both. It stays below `MATCH_MIN_CONFIDENCE`, so
 * such a search lists candidates and never identifies one recording on its own,
 * whether in the disambiguation list or in a cross-service match.
 */
const PARTIAL_QUERY_TOP_CONFIDENCE = 0.55;
/** Score lost per provider position for a ranking that trusts the provider. */
const PROVIDER_RANK_STEP = 0.05;
/** Lowest score a ranking that trusts the provider gives, equal to `CANDIDATE_MIN_CONFIDENCE`. */
const PROVIDER_RANK_FLOOR = 0.4;
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
 * Reads a structured search that names a title or an artist but not both.
 *
 * @param query - Search metadata; a field left out is an empty or blank string.
 * @returns `true` when exactly one of title and artist is blank, `false` for free
 *   text, for a search naming both, and for one naming neither.
 */
function isPartialSearch(query: Pick<SearchQuery, "title" | "artist" | "artists">): boolean {
  if (isFreeTextSearch(query)) return false;
  return !query.title.trim() !== !query.artist.trim();
}

/**
 * Scores a result by the provider's position alone.
 *
 * @param top - Score of the first position, `FREE_TEXT_TOP_CONFIDENCE` or `PARTIAL_QUERY_TOP_CONFIDENCE`.
 * @param index - Zero-based provider position.
 * @returns `top` less `PROVIDER_RANK_STEP` per position, never below `PROVIDER_RANK_FLOOR`.
 */
function providerRankConfidence(top: number, index: number): number {
  return Math.max(PROVIDER_RANK_FLOOR, top - index * PROVIDER_RANK_STEP);
}

/**
 * Says whether a result's title or one of its artists is exactly the free text typed.
 *
 * A title counts with and without a featured-artist suffix, and an artist counts
 * by the same exact-name rule the identity guard applies.
 *
 * @param text - The free text as typed.
 * @param track - Candidate with its display title and artist credits.
 * @returns `true` when the title or an artist equals `text`, ignoring case and surrounding space.
 */
function namesTypedText(text: string, track: NormalizedTrack): boolean {
  const typed = text.trim().toLowerCase();
  if (trackSearchTitles(track.title).some((title) => title.toLowerCase() === typed)) return true;
  return comparisonArtistNames(track.artists, track.sourceService).some(
    (artist) => calculateArtistNameConfidence(text, artist) >= MIN_FALLBACK_ARTIST_CONFIDENCE,
  );
}

/**
 * Builds provider search text without duplicating an unstructured query.
 *
 * @param query - A title and artist, or the resolver's free-text marker.
 * @returns The original free text, or the artist followed by the title with a field the query leaves out omitted.
 */
export function searchText(query: Pick<SearchQuery, "title" | "artist" | "artists">): string {
  return isFreeTextSearch(query) ? query.title : `${query.artist} ${query.title}`.trim();
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
 * A structured search that names only a title or only an artist is compared on
 * that field alone, and a query that names neither matches nothing.
 *
 * @param query - Original structured metadata, not a broadened lookup string.
 * @param candidate - Provider recording with its original display metadata.
 * @returns Whether artist, title, duration and performance version are compatible.
 */
export function isTrackSearchFallbackMatch(query: SearchQuery, candidate: NormalizedTrack): boolean {
  if (isFreeTextSearch(query) && !query.artists?.length) return true;
  const wantedArtists = artistIdentityNames(query.artist).slice(0, PRIMARY_ARTIST_NAME_COUNT);
  const wantedTitles = trackSearchTitles(query.title);
  if (wantedArtists.length === 0 && wantedTitles.length === 0) return false;
  const actualArtists = comparisonArtistNames(candidate.artists, candidate.sourceService);
  const sameArtist =
    wantedArtists.length === 0 ||
    wantedArtists.some((wanted) =>
      actualArtists.some((actual) => calculateArtistNameConfidence(wanted, actual) >= MIN_FALLBACK_ARTIST_CONFIDENCE),
    );
  const sameTitle =
    wantedTitles.length === 0 ||
    wantedTitles.some((wanted) =>
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
 * cover or live performance cannot outrank the requested studio recording.
 *
 * Free text and a structured search naming only a title or only an artist know
 * no recording, so both trust the provider's order. Free text ranks a result
 * whose title or artist is exactly the text typed ahead of the rest, because a
 * provider answers `Yello` with songs called "Hello" first. A partial search
 * stays below `MATCH_MIN_CONFIDENCE`.
 *
 * @param query - Original search metadata, never mutated.
 * @param track - Candidate retaining its display title and artist credits.
 * @param index - Zero-based provider rank, used for free text and partial searches only.
 * @returns Confidence in [0, 1], or zero for an incompatible recording.
 */
export function scoreSearchCandidate(query: SearchQuery, track: NormalizedTrack, index: number): number {
  if (!isTrackSearchFallbackMatch(query, track)) return 0;
  if (isFreeTextSearch(query)) {
    return namesTypedText(query.title, track)
      ? FREE_TEXT_EXACT_CONFIDENCE
      : providerRankConfidence(FREE_TEXT_TOP_CONFIDENCE, index);
  }
  if (isPartialSearch(query)) return providerRankConfidence(PARTIAL_QUERY_TOP_CONFIDENCE, index);
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
