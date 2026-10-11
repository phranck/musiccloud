/**
 * Track/album matching primitives.
 *
 * When the resolver searches a secondary service ("this Spotify track also
 * exists on Deezer"), it gets back a list of candidates and has to decide
 * which (if any) really matches. That decision is a score in [0, 1]. This
 * file is the scoring rulebook.
 *
 * Design notes:
 *
 * 1. **ISRC/UPC beat everything.** The industry already has a unique
 *    identifier for a recording (ISRC) and a release (UPC). If both sides
 *    report the same one, the match is definitional: return 1.0 and skip
 *    fuzzy comparison entirely. Fuzzy scoring is only the fallback for
 *    services that do not expose the code or return a wrong one.
 *
 * 2. **Dice coefficient over bigrams for strings.** Dice is order-agnostic
 *    ("Lennon John" vs "John Lennon" scores high), handles short strings
 *    gracefully, and ships in ~10 lines. Levenshtein is sensitive to
 *    insertion/deletion positioning and would penalise reordered artists.
 *    External libs (fast-fuzzy, string-similarity) would add a dep for a
 *    function we can hand-write.
 *
 * 3. **Artist scoring is "best pairwise average".** For each source artist,
 *    pick the best-matching candidate artist and average those scores.
 *    That way "A, B" vs "B, A" scores 1.0, and "A feat. B" vs "A" scores
 *    ~0.5 instead of failing. Order-sensitive comparison would miss both.
 *
 * 4. **Track weights 0.4/0.4/0.2 (title/artist/duration).** Title and
 *    artist carry equal weight; duration is a weak confirmer because
 *    different masterings, radio edits, and explicit/clean variants drift
 *    by a few seconds even for the "same" track.
 *
 * 5. **Album weights 0.35/0.35/0.15/0.15 (title/artist/year/trackcount).**
 *    Release year alone is weak (re-releases share title+artist) but
 *    combined with track count it distinguishes "Deluxe Edition" from
 *    "Standard". Both remixed to 15% so title+artist still dominate.
 *
 * 6. **3000ms duration tolerance.** Empirical: matching masterings usually
 *    agree within 1s, plus ~2s of rounding between services' seconds-vs-ms
 *    precision. Tighter thresholds rejected too many genuine matches.
 *
 * 7. **YouTube-only title stripping.** Official uploads bake "(Official
 *    Music Video)", "(Audio)", "[Lyrics Video]", "(HD)" into the title.
 *    Other services return clean metadata, so applying these rules
 *    globally would corrupt titles that legitimately contain those words.
 */

import type { ServiceId } from "../../services/types";

export function normalizeTitle(title: string, service: ServiceId): string {
  if (service === "youtube") {
    return title
      .replace(/\s*[([](Official\s+)?(Music\s+)?Video[)\]]/gi, "")
      .replace(/\s*[([](Official\s+)?Audio[)\]]/gi, "")
      .replace(/\s*[([]Lyric(s)?\s*Video[)\]]/gi, "")
      .replace(/\s*[([]HD[)\]]/gi, "")
      .trim();
  }
  return title.trim();
}

export function normalizeArtists(raw: string | string[]): string[] {
  if (Array.isArray(raw)) return raw.map((a) => a.trim());
  return raw
    .split(/[,&]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

export function stringSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;

  // Simple Dice coefficient on bigrams
  const bigramsA = getBigrams(normA);
  const bigramsB = getBigrams(normB);

  let matches = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) {
      matches++;
    }
  }

  return (2 * matches) / (bigramsA.size + bigramsB.size);
}

function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

export function isDurationMatch(durationA: number, durationB: number): boolean {
  return Math.abs(durationA - durationB) <= 3000;
}

export function calculateConfidence(
  source: { title: string; artists: string[]; durationMs?: number; isrc?: string },
  candidate: { title: string; artists: string[]; durationMs?: number; isrc?: string },
): number {
  if (source.isrc && candidate.isrc && source.isrc === candidate.isrc) {
    return 1.0;
  }

  let score = 0;

  score += stringSimilarity(source.title, candidate.title) * 0.4;

  // Compare all artists: best average of pairwise similarities
  if (source.artists.length > 0 && candidate.artists.length > 0) {
    let artistScore = 0;
    for (const srcArtist of source.artists) {
      let bestMatch = 0;
      for (const candArtist of candidate.artists) {
        bestMatch = Math.max(bestMatch, stringSimilarity(srcArtist, candArtist));
      }
      artistScore += bestMatch;
    }
    score += (artistScore / source.artists.length) * 0.4;
  }

  if (source.durationMs && candidate.durationMs) {
    const diff = Math.abs(source.durationMs - candidate.durationMs);
    if (diff <= 3000) score += 0.2;
    else if (diff <= 10000) score += 0.1;
  }

  return score;
}

export function calculateAlbumConfidence(
  source: { title: string; artists: string[]; totalTracks?: number; releaseDate?: string; upc?: string },
  candidate: { title: string; artists: string[]; totalTracks?: number; releaseDate?: string; upc?: string },
): number {
  // UPC match = perfect (like ISRC for tracks)
  if (source.upc && candidate.upc && source.upc === candidate.upc) {
    return 1.0;
  }

  let score = 0;

  // Title similarity (35%)
  score += stringSimilarity(source.title, candidate.title) * 0.35;

  // Artist similarity (35%)
  if (source.artists.length > 0 && candidate.artists.length > 0) {
    let artistScore = 0;
    for (const srcArtist of source.artists) {
      let bestMatch = 0;
      for (const candArtist of candidate.artists) {
        bestMatch = Math.max(bestMatch, stringSimilarity(srcArtist, candArtist));
      }
      artistScore += bestMatch;
    }
    score += (artistScore / source.artists.length) * 0.35;
  }

  // Release year match (15%)
  if (source.releaseDate && candidate.releaseDate) {
    const srcYear = source.releaseDate.slice(0, 4);
    const candYear = candidate.releaseDate.slice(0, 4);
    if (srcYear === candYear) score += 0.15;
    else if (Math.abs(Number(srcYear) - Number(candYear)) === 1) score += 0.07;
  }

  // Track count match (15%)
  if (source.totalTracks && candidate.totalTracks) {
    if (source.totalTracks === candidate.totalTracks) score += 0.15;
    else if (Math.abs(source.totalTracks - candidate.totalTracks) <= 2) score += 0.07;
  }

  return score;
}

/**
 * Scores how well an artist name a service returned matches the name searched
 * for, in [0, 1].
 *
 * Every adapter's artist search and the artist resolver use this one rule, so
 * a name a service finds is accepted or refused the same way everywhere. A
 * name scored through {@link calculateConfidence} instead can never pass the
 * match threshold, because that scorer counts artists only when both sides
 * carry an artist list, which leaves the title term alone at 0.4.
 *
 * The rungs, after lower-casing and trimming both names:
 *
 * - Equal: 0.95. Not 1.0, because two different real artists can share a name.
 * - Equal once a leading "The" is stripped from both: 0.9.
 * - `stringSimilarity` above 0.85: 0.85.
 * - Above 0.7, or one name containing the other: 0.75.
 * - Otherwise `similarity * 0.7`, so a weak fuzzy match never exceeds 0.7.
 *
 * @param queryName - The artist name that was searched for.
 * @param resultName - The artist name the service returned.
 * @returns The confidence that both name the same artist.
 */
export function calculateArtistNameConfidence(queryName: string, resultName: string): number {
  const queryLower = queryName.toLowerCase().trim();
  const resultLower = resultName.toLowerCase().trim();

  if (queryLower === resultLower) return 0.95;

  const stripThe = (name: string) => name.replace(/^the\s+/i, "").trim();
  if (stripThe(queryLower) === stripThe(resultLower)) return 0.9;

  const similarity = stringSimilarity(queryLower, resultLower);

  if (similarity > 0.85) return 0.85;
  if (similarity > 0.7) return 0.75;
  if (queryLower.includes(resultLower) || resultLower.includes(queryLower)) return 0.75;

  return similarity * 0.7;
}
