/**
 * @file Bandcamp adapter: scraping-based track + album resolves.
 *
 * Keyless (always available). Bandcamp has no public API. Each
 * artist gets their own subdomain (`{artist}.bandcamp.com`), so the
 * sourceId for tracks and albums is the full URL rather than a
 * numeric ID.
 *
 * Page scraping (JSON-LD, OG fallback, data attributes, durations) lives in
 * `scrape.ts`, the search endpoint and its ranking in `search.ts`, requests
 * through `curl` in `transport.ts`, and the band of a label's release in
 * `label-credits.ts`.
 *
 * ## `sourceId = full URL`
 *
 * Unlike most adapters, Bandcamp's sourceId is the full track/album
 * URL rather than an extracted ID fragment. This is because tracks
 * are only reachable via their full `{artist}.bandcamp.com/track/{slug}`
 * shape; no numeric-ID fallback exists. Downstream consumers should
 * treat the sourceId as opaque.
 */
import { getPlatformLabel, ResourceKind, Service } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger";
import { serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { bestSettledAlbum } from "../_shared/candidates.js";
import { searchText } from "../_shared/confidence.js";
import { fetchAlbumByUrl, fetchTrackByUrl } from "./scrape.js";
import { findBestBandcampMatch, searchBandcamp, searchBandcampAlbums } from "./search.js";

// Bandcamp URLs: {artist}.bandcamp.com/track/{slug}
const BANDCAMP_TRACK_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/track\/([a-z0-9-]+)/;
// Bandcamp album URLs: {artist}.bandcamp.com/album/{slug}
const BANDCAMP_ALBUM_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/album\/([a-z0-9-]+)/;

export const bandcampAdapter: ServiceAdapter = {
  id: "bandcamp",
  displayName: getPlatformLabel("bandcamp"),
  capabilities: {
    supportsIsrc: false,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = BANDCAMP_TRACK_REGEX.exec(url);
    if (!match) return null;
    // Return the full URL as the ID since Bandcamp uses subdomain-based URLs
    return url.split("?")[0];
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const track = await fetchTrackByUrl(trackId);
    if (!track) {
      throw serviceNotFoundError(Service.BandCamp, ResourceKind.Track, trackId);
    }
    return track;
  },

  async findByIsrc(_isrc: string): Promise<NormalizedTrack | null> {
    return null;
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const q = searchText(query);

    const results = await searchBandcamp(q);
    if (results.length === 0) log.debug("Bandcamp", "Search returned no results for:", q);
    else log.debug("Bandcamp", `Search returned ${results.length} results for: ${q}`);

    const match = await findBestBandcampMatch(query, results);
    if (!match.found) {
      log.debug("Bandcamp", `Best confidence ${match.confidence.toFixed(3)} below threshold ${MATCH_MIN_CONFIDENCE}`);
    }
    return match;
  },

  albumCapabilities: {
    supportsUpc: false,
    supportsAlbumSearch: true,
    supportsTrackListing: true,
  },

  detectAlbumUrl(url: string): string | null {
    const match = BANDCAMP_ALBUM_REGEX.exec(url);
    return match ? url.split("?")[0] : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const album = await fetchAlbumByUrl(albumId);
    if (!album) throw serviceNotFoundError(Service.BandCamp, ResourceKind.Album, albumId);
    return album;
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const q = `${query.artist} ${query.title}`;
    const results = await searchBandcampAlbums(q);
    if (results.length === 0) return { found: false, confidence: 0, matchMethod: "search" };

    const albumResults = await Promise.allSettled(results.map((r) => fetchAlbumByUrl(r.url)));
    return bestSettledAlbum(query, albumResults, Service.BandCamp);
  },
} satisfies ServiceAdapter & Record<string, unknown>;
