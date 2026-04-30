// Merges per-source ArtistPartials into a CanonicalArtist using the declarative
// strategy. A field is taken from the highest-priority source that supplies a
// non-empty value; null, undefined, and empty arrays are treated as "missing"
// so the next source in the list gets a chance.

import type { ArtistPartial, ArtistSource, CanonicalArtist } from "./types.js";

const ARRAY_FIELD_DEFAULTS: Partial<Record<keyof CanonicalArtist, unknown[]>> = {
  genres: [],
  similarArtists: [],
  topTracks: [],
};

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

export function mergeArtistPartials(
  partials: Array<ArtistPartial | null>,
  strategy: Record<keyof CanonicalArtist, ArtistSource[]>,
  artistName: string,
): CanonicalArtist {
  const bySource = new Map<ArtistSource, ArtistPartial>();
  for (const partial of partials) {
    if (partial !== null) bySource.set(partial.__source, partial);
  }

  const pick = <K extends keyof CanonicalArtist>(field: K): CanonicalArtist[K] | null => {
    for (const source of strategy[field]) {
      const partial = bySource.get(source);
      if (!partial) continue;
      const value = partial[field];
      if (!isMissing(value)) return value as CanonicalArtist[K];
    }
    return null;
  };

  const arrayDefault = <K extends keyof CanonicalArtist>(field: K): CanonicalArtist[K] =>
    (ARRAY_FIELD_DEFAULTS[field] ?? null) as CanonicalArtist[K];

  return {
    name: artistName,
    imageUrl: pick("imageUrl"),
    genres: pick("genres") ?? (arrayDefault("genres") as string[]),
    popularity: pick("popularity"),
    followers: pick("followers"),
    scrobbles: pick("scrobbles"),
    bioSummary: pick("bioSummary"),
    similarArtists: pick("similarArtists") ?? (arrayDefault("similarArtists") as string[]),
    topTracks: pick("topTracks") ?? (arrayDefault("topTracks") as CanonicalArtist["topTracks"]),
  };
}

// Companion to mergeArtistPartials: returns which source supplied a given
// field, applying the same strategy + missing-detection rules. Useful for
// provenance writes (e.g., "tag the cached image with the source that
// produced it") without round-tripping through merge again.
export function pickSourceForField(
  partials: Array<ArtistPartial | null>,
  strategy: Record<keyof CanonicalArtist, ArtistSource[]>,
  field: keyof CanonicalArtist,
): ArtistSource | null {
  const bySource = new Map<ArtistSource, ArtistPartial>();
  for (const partial of partials) {
    if (partial !== null) bySource.set(partial.__source, partial);
  }
  for (const source of strategy[field]) {
    const value = bySource.get(source)?.[field];
    if (!isMissing(value)) return source;
  }
  return null;
}
