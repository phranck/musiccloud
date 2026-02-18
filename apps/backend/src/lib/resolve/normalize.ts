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
