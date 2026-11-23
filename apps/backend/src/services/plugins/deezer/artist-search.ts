/**
 * Shared wrapper around Deezer `search/artist`. The adapter's artist search,
 * the Artist Info composition source and the artist image lookup all read
 * their artist through here, so each picks the same artist for a name.
 */

import { Service } from "@musiccloud/shared";
import { type RankedArtistNameMatch, rankByArtistName } from "../../../lib/resolve/normalize";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { deezerGet } from "./deezer-response.js";

/**
 * How many hits one Deezer artist search reads. Deezer ranks by its own
 * relevance, which can put a different artist with a similar name first, so
 * the name match is chosen from several hits.
 */
export const DEEZER_ARTIST_SEARCH_LIMIT = 5;

/**
 * One artist object from Deezer's `search/artist` answer.
 *
 * @property id - Deezer's artist id, used for `/artist/{id}` lookups.
 * @property name - The artist name as Deezer spells it.
 * @property picture_xl - The largest picture URL, absent or a silhouette when Deezer has none.
 * @property picture_big - The second largest picture URL.
 * @property picture_medium - The medium picture URL.
 * @property link - The artist's page on deezer.com.
 */
export interface DeezerArtistSearchHit {
  id: number;
  name: string;
  picture_xl?: string;
  picture_big?: string;
  picture_medium?: string;
  link?: string;
}

/** Deezer's `search/artist` answer, of which only the hit list is read. */
interface DeezerArtistSearchResponse {
  data?: DeezerArtistSearchHit[];
}

/**
 * Searches Deezer for an artist name and ranks the hits by name.
 *
 * @param name - The artist name to search for.
 * @returns The hit whose name is closest to `name`, the first one on a tie, or
 *   `null` when Deezer lists no artist at all.
 * @throws {UpstreamUnavailableError} when Deezer did not answer or answered
 *   without its artist collection, so a caller can tell an outage apart from an
 *   unknown artist.
 */
export async function rankDeezerArtistSearch(
  name: string,
): Promise<RankedArtistNameMatch<DeezerArtistSearchHit> | null> {
  const data = await deezerGet<DeezerArtistSearchResponse>(
    `/search/artist?q=${encodeURIComponent(name)}&limit=${DEEZER_ARTIST_SEARCH_LIMIT}`,
    "artist search",
  );
  const hits = data === null ? [] : requireProviderCollection(data.data, Service.Deezer, "artist search");
  return rankByArtistName(name, hits, (hit) => hit.name);
}

/**
 * Finds the Deezer artist of a name.
 *
 * Only a hit whose name matches at `MATCH_MIN_CONFIDENCE` or above counts.
 * Deezer answers `FON` first for `Fön`, and taking that hit would show another
 * artist's picture, fans and songs.
 *
 * @param name - The artist name to search for.
 * @returns The matching hit, or `null` when Deezer knows no artist of that name.
 * @throws {UpstreamUnavailableError} when Deezer did not answer, so a caller
 *   can tell an outage apart from an unknown artist.
 */
export async function searchDeezerArtist(name: string): Promise<DeezerArtistSearchHit | null> {
  const best = await rankDeezerArtistSearch(name);
  return best !== null && best.confidence >= MATCH_MIN_CONFIDENCE ? best.item : null;
}
