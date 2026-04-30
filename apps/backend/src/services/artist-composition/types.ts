// Generic composition layer for artist data aggregated from multiple sources.
// Each source returns a Partial<CanonicalArtist> tagged with __source; the
// merge function applies a declarative per-field strategy to pick a value.
//
// Why a separate canonical shape (instead of @musiccloud/shared ArtistProfile):
// the composition layer needs fields that are not exposed in the public API
// shape (e.g., scrobbles for ranking heuristics) and must be source-agnostic.
// A trivial mapper translates CanonicalArtist -> ArtistProfile at the edge.

import type { ArtistTopTrack } from "@musiccloud/shared";

export type ArtistSource = "spotify" | "deezer" | "lastfm" | "musicbrainz";

export interface CanonicalArtist {
  name: string;
  imageUrl: string | null;
  genres: string[];
  popularity: number | null;
  followers: number | null;
  scrobbles: number | null;
  bioSummary: string | null;
  similarArtists: string[];
  topTracks: ArtistTopTrack[];
}

export type ArtistPartial = Partial<CanonicalArtist> & {
  __source: ArtistSource;
};
