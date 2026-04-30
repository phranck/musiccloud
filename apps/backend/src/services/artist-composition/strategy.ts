// Per-field source preference order. Reading top to bottom: image first try
// Deezer, then Spotify; genres first Spotify (cleaner), then Last.fm; etc.
// Spotify is no longer a hard dependency for any field except as a fallback.
//
// To add a new source: extend ArtistSource in types.ts, add the source name
// to the relevant arrays here. No merge.ts change needed.

import type { ArtistSource, CanonicalArtist } from "./types.js";

export const ARTIST_MERGE_STRATEGY: Record<keyof CanonicalArtist, ArtistSource[]> = {
  name: [],
  imageUrl: ["deezer", "spotify"],
  genres: ["spotify", "lastfm"],
  popularity: ["lastfm"],
  followers: ["deezer", "lastfm"],
  scrobbles: ["lastfm"],
  bioSummary: ["lastfm"],
  similarArtists: ["lastfm"],
  topTracks: ["deezer", "lastfm"],
};
