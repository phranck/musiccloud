/**
 * Last.fm composition source. Pulls bio + listener stats + similar
 * artists + filtered tags + top tracks; returns null when LASTFM_API_KEY
 * is unset or both info and tag lookups fail.
 *
 * `popularity` is mapped from Last.fm `stats.listeners` (non-negative
 * integer). Different scale than the old Spotify popularity score, but
 * the only signal available post-Feb-2026.
 */

import { fetchLastFmArtistInfo } from "../../plugins/lastfm/artist-info.js";
import { fetchLastFmTopTags } from "../../plugins/lastfm/artist-top-tags.js";
import { fetchLastFmTopTracks } from "../../plugins/lastfm/artist-top-tracks.js";
import type { ArtistPartial } from "../types.js";

export async function fetchLastFmArtistPartial(name: string): Promise<ArtistPartial | null> {
  const [info, tags, topTracks] = await Promise.all([
    fetchLastFmArtistInfo(name),
    fetchLastFmTopTags(name),
    fetchLastFmTopTracks(name, 3),
  ]);

  if (!info && tags.length === 0 && topTracks.length === 0) return null;

  return {
    __source: "lastfm",
    genres: tags,
    popularity: info?.listeners ?? null,
    followers: info?.listeners ?? null,
    scrobbles: info?.scrobbles ?? null,
    bioSummary: info?.bioSummary ?? null,
    similarArtists: info?.similarArtists ?? [],
    topTracks,
  };
}
