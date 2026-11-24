/**
 * @file Bandcamp adapter: scraping-based track + album resolves.
 *
 * Keyless (always available). Bandcamp has no public API. Each
 * artist gets their own subdomain (`{artist}.bandcamp.com`), so the
 * sourceId for tracks and albums is the full URL rather than a
 * numeric ID.
 *
 * ## JSON-LD first, OG fallback
 *
 * Track and album pages embed `application/ld+json` blocks
 * (`MusicRecording` / `MusicAlbum`). The adapter prefers those for
 * their structured artist, album, and track-listing data. If parsing
 * fails (or the `@type` is wrong on a rare page), it falls back to
 * OG tags: title format on Bandcamp is `"Track, by Artist"` which
 * splits cleanly on `", by "`.
 *
 * ## ISO 8601 with hours (`P00H03M45S`)
 *
 * Bandcamp's durations have an unusual form: `P00H03M45S` (no `T`
 * delimiter, always starts with `P`). `parseIsoDurationMs` reads it
 * with `BANDCAMP_DURATION_FORMAT`. Unparseable values yield `undefined`
 * so the UI can distinguish "missing" from "zero".
 *
 * ## Requests through `curl`
 *
 * Bandcamp's CDN answers Node's HTTP stack with a JavaScript client challenge
 * instead of content, so every request goes through `bandcampTransport` in
 * `transport.ts`, which runs `curl`. A request that still meets the challenge,
 * or fails, is reported as Bandcamp being unavailable (status 503), never as
 * "not found", because a "not found" makes the resolver skip Bandcamp for that
 * item for a long time.
 *
 * ## Labels that name their bands in the title
 *
 * Some labels publish their bands' releases on the label's own account as
 * `Band - Title`, and every structured field names the label as the artist.
 * `creditedRelease` in `label-credits.ts` recognises such an account by its
 * discography and reads the band out of the title.
 *
 * ## Search via Bandcamp's fuzzysearch endpoint
 *
 * The adapter searches through the JSON endpoint also used by Bandcamp
 * clients, normalizes its track/album URLs, then fetches candidate pages for
 * structured JSON-LD / embedded album track data before confidence scoring.
 *
 * ## `sourceId = full URL`
 *
 * Unlike most adapters, Bandcamp's sourceId is the full track/album
 * URL rather than an extracted ID fragment. This is because tracks
 * are only reachable via their full `{artist}.bandcamp.com/track/{slug}`
 * shape; no numeric-ID fallback exists. Downstream consumers should
 * treat the sourceId as opaque.
 */
import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  AlbumTrackEntry,
  MatchResult,
  NormalizedAlbum,
  NormalizedTrack,
  SearchQuery,
  ServiceAdapter,
} from "../../types.js";
import { bestSettledAlbum, throwIfSearchIncomplete } from "../_shared/candidates.js";
import { scoreSearchCandidate, searchText } from "../_shared/confidence.js";
import { type IsoDurationFormat, MS_PER_SECOND, parseIsoDurationMs } from "../_shared/duration.js";
import { JSON_LD_ALBUM_TYPE, JSON_LD_RECORDING_TYPE, readJsonLd } from "../_shared/json-ld.js";
import { extractOgTags } from "../_shared/og.js";
import { requireProviderCollection } from "../_shared/provider-response.js";
import { pickBestTrack, searchMatchResult, trackScoreLogger } from "../_shared/rank.js";
import { type BandcampAccount, creditedRelease } from "./label-credits.js";
import { bandcampTransport } from "./transport.js";

/** How long one Bandcamp request may take, 8 s, because an album page is about 300 KB. */
const BANDCAMP_REQUEST_TIMEOUT_MS = 8000;

/**
 * The status a failed Bandcamp request is reported with. 503 says Bandcamp
 * did not answer, so `serviceHttpError` builds Bandcamp's generic failure code
 * rather than its "not found" code.
 */
const BANDCAMP_UNAVAILABLE_STATUS = 503;

// Bandcamp URLs: {artist}.bandcamp.com/track/{slug}
const BANDCAMP_TRACK_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/track\/([a-z0-9-]+)/;
// Bandcamp album URLs: {artist}.bandcamp.com/album/{slug}
const BANDCAMP_ALBUM_REGEX = /^https?:\/\/([a-z0-9-]+)\.bandcamp\.com\/album\/([a-z0-9-]+)/;

interface BandcampAlbumJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  datePublished?: string;
  byArtist?: { name?: string };
  numTracks?: number;
  track?: {
    itemListElement?: Array<{
      position: number;
      item?: { "@type"?: string; name?: string; duration?: string };
    }>;
  };
}

interface BandcampJsonLd {
  "@type"?: string;
  name?: string;
  url?: string;
  image?: string;
  duration?: string; // ISO 8601: "P00H03M45S"
  datePublished?: string;
  byArtist?: { name?: string };
  inAlbum?: { name?: string; albumRelease?: Array<{ "@type"?: string }> };
  recordingOf?: { name?: string };
}

interface BandcampFuzzySearchResponse {
  results?: Array<{
    type?: string;
    url?: string;
    name?: string;
    band_name?: string;
    album_name?: string;
  }>;
}

interface BandcampTralbumData {
  current?: {
    artist?: string | null;
  };
  trackinfo?: Array<{
    title?: string;
    title_link?: string;
    artist?: string | null;
    duration?: number;
    track_num?: number;
  }>;
}

interface BandcampEmbedData {
  artist?: string;
  album_embed_data?: {
    artist?: string;
    album_title?: string;
  };
}

/** Bandcamp's period dialect: `P00H03M45S`, with no `T` after the `P`. */
const BANDCAMP_DURATION_FORMAT: IsoDurationFormat = { timeDesignator: false };

/**
 * Requests a Bandcamp page or the search endpoint through {@link bandcampTransport}.
 *
 * @param url - The Bandcamp address to request.
 * @param kind - What is being fetched, for the error code and message.
 * @param id - What the caller asked for: the page URL, or the search text.
 * @param op - The operation, `Operation.Fetch` for a page and
 *   `Operation.Search` for the search endpoint.
 * @returns Bandcamp's answer. An error status such as 404 is returned, not thrown.
 * @throws {ResolveError} Bandcamp's generic failure code, built from
 *   {@link BANDCAMP_UNAVAILABLE_STATUS}, when the request fails or meets the
 *   CDN's client challenge. The transport has logged the cause.
 */
async function bandcampFetch(
  url: string,
  kind: ResourceKind,
  id: string,
  op: Operation = Operation.Fetch,
): Promise<Response> {
  try {
    return await bandcampTransport.request(url, BANDCAMP_REQUEST_TIMEOUT_MS);
  } catch {
    throw serviceHttpError(Service.BandCamp, BANDCAMP_UNAVAILABLE_STATUS, kind, id, op);
  }
}

async function fetchTrackByUrl(trackUrl: string): Promise<NormalizedTrack | null> {
  const response = await bandcampFetch(trackUrl, ResourceKind.Track, trackUrl);
  // A page Bandcamp does not have answers 404, which is an answer. Any other
  // error status is a failure.
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Track, trackUrl);

  const html = await response.text();
  const embedData = parseEmbedData(html);
  const tralbumData = parseTralbumData(html);

  // Try JSON-LD first
  const jsonLd = readJsonLd<BandcampJsonLd>(html, JSON_LD_RECORDING_TYPE);
  if (jsonLd?.name) {
    const artist =
      embedData?.artist ?? embedData?.album_embed_data?.artist ?? tralbumData?.current?.artist ?? jsonLd.byArtist?.name;
    const albumName = jsonLd.inAlbum?.name ?? embedData?.album_embed_data?.album_title;
    // A label that names its bands only in album titles gives the label as the
    // track's artist, so the band comes from the album's title.
    const credit = await creditedRelease(albumName, artist, parseBandAccount(html));
    return {
      sourceService: "bandcamp",
      sourceId: trackUrl,
      title: jsonLd.name,
      artists: [credit?.artist ?? artist ?? "Unknown Artist"],
      albumName: credit?.title ?? albumName,
      durationMs: jsonLd.duration ? parseIsoDurationMs(jsonLd.duration, BANDCAMP_DURATION_FORMAT) : undefined,
      artworkUrl: jsonLd.image,
      releaseDate: jsonLd.datePublished,
      webUrl: jsonLd.url ?? trackUrl,
    };
  }

  // Fallback to OG tags
  const og = extractOgTags(html);
  if (og.title) {
    // OG title format: "Track, by Artist"
    const parts = og.title.split(", by ");
    const title = parts[0] ?? og.title;
    const artist = parts[1] ?? "Unknown Artist";

    return {
      sourceService: "bandcamp",
      sourceId: trackUrl,
      title,
      artists: [artist],
      artworkUrl: og.image,
      webUrl: og.url ?? trackUrl,
    };
  }

  return null;
}

type BandcampSearchResult = { kind: "track" | "album"; url: string; name: string; artist: string; albumName?: string };

function normalizeBandcampResultUrl(rawUrl: string | undefined, kind: "track" | "album"): string | null {
  if (!rawUrl) return null;
  const matches =
    kind === "track"
      ? [...rawUrl.matchAll(/https?:\/\/[a-z0-9-]+\.bandcamp\.com\/track\/[^"\s?&#]+/g)]
      : [...rawUrl.matchAll(/https?:\/\/[a-z0-9-]+\.bandcamp\.com\/album\/[^"\s?&#]+/g)];
  return matches.at(-1)?.[0] ?? null;
}

async function searchBandcamp(query: string): Promise<BandcampSearchResult[]> {
  const searchUrl = `https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=${encodeURIComponent(query)}&param_with_locations=true`;
  const response = await bandcampFetch(searchUrl, ResourceKind.Track, query, Operation.Search);
  // A search without results answers 200 with an empty list, so an error
  // status or a body that is not JSON is a failure rather than an answer.
  if (!response.ok) {
    throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Track, query, Operation.Search);
  }

  const payload = (await response.json()) as BandcampFuzzySearchResponse;
  const results: BandcampSearchResult[] = [];
  const seenUrls = new Set<string>();

  for (const item of requireProviderCollection(payload.results, Service.BandCamp, "catalog search")) {
    if (item.type !== "t" && item.type !== "a") continue;

    const kind = item.type === "t" ? "track" : "album";
    const url = normalizeBandcampResultUrl(item.url, kind);
    if (!url || seenUrls.has(url)) continue;

    seenUrls.add(url);
    results.push({
      kind,
      url,
      name: item.name?.trim() ?? "",
      artist: item.band_name?.trim() ?? "",
      albumName: item.album_name?.trim() || undefined,
    });

    if (results.length >= 10) break;
  }

  return results;
}

function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseTralbumData(html: string): BandcampTralbumData | null {
  const match = /data-tralbum="([^"]+)"/.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(decodeHtmlAttribute(match[1])) as BandcampTralbumData;
  } catch {
    return null;
  }
}

function parseEmbedData(html: string): BandcampEmbedData | null {
  const match = /data-embed="([^"]+)"/.exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(decodeHtmlAttribute(match[1])) as BandcampEmbedData;
  } catch {
    return null;
  }
}

/**
 * Reads the account that publishes a page from its `data-band` attribute.
 *
 * @param html - A Bandcamp track or album page.
 * @returns The account's id and name, or `null` when the page has no usable `data-band`.
 */
function parseBandAccount(html: string): BandcampAccount | null {
  const match = /data-band="([^"]+)"/.exec(html);
  if (!match?.[1]) return null;
  try {
    const data = JSON.parse(decodeHtmlAttribute(match[1])) as { id?: unknown; name?: unknown };
    return typeof data.id === "number" && typeof data.name === "string" ? { id: data.id, name: data.name } : null;
  } catch {
    return null;
  }
}

function trackUrlFromAlbum(albumUrl: string, titleLink: string | undefined): string {
  if (!titleLink) return albumUrl.split("?")[0];
  return new URL(titleLink, albumUrl).toString().split("?")[0];
}

async function fetchTracksByAlbumUrl(albumUrl: string): Promise<NormalizedTrack[]> {
  const response = await bandcampFetch(albumUrl, ResourceKind.Album, albumUrl);
  if (response.status === 404) return [];
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Album, albumUrl);

  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return [];

  const tralbum = parseTralbumData(html);
  const credit = await creditedRelease(jsonLd.name, jsonLd.byArtist?.name, parseBandAccount(html));
  const artist = credit?.artist ?? jsonLd.byArtist?.name ?? "Unknown Artist";
  const albumName = credit?.title ?? jsonLd.name;
  const jsonLdTracks = jsonLd.track?.itemListElement ?? [];
  const maxLength = Math.max(jsonLdTracks.length, tralbum?.trackinfo?.length ?? 0);
  const tracks: NormalizedTrack[] = [];

  for (let index = 0; index < maxLength; index++) {
    const jsonTrack = jsonLdTracks[index];
    const tralbumTrack = tralbum?.trackinfo?.[index];
    const title = tralbumTrack?.title ?? jsonTrack?.item?.name;
    if (!title) continue;

    const webUrl = trackUrlFromAlbum(albumUrl, tralbumTrack?.title_link);
    tracks.push({
      sourceService: "bandcamp",
      sourceId: webUrl,
      title,
      artists: [tralbumTrack?.artist ?? artist],
      albumName,
      durationMs:
        tralbumTrack?.duration !== undefined
          ? Math.round(tralbumTrack.duration * MS_PER_SECOND)
          : jsonTrack?.item?.duration
            ? parseIsoDurationMs(jsonTrack.item.duration, BANDCAMP_DURATION_FORMAT)
            : undefined,
      artworkUrl: jsonLd.image,
      releaseDate: jsonLd.datePublished,
      webUrl,
    });
  }

  return tracks;
}

async function fetchTracksForSearchResult(result: BandcampSearchResult): Promise<NormalizedTrack[]> {
  if (result.kind === "album") return fetchTracksByAlbumUrl(result.url);

  const track = await fetchTrackByUrl(result.url);
  return track ? [track] : [];
}

/** Writes the per-track score debug line of a Bandcamp search. */
const logBandcampTrackScore = trackScoreLogger("Bandcamp");

/**
 * Fetches the tracks behind each search hit and keeps the best one.
 *
 * A track hit contributes its own page, an album hit every track of its album.
 * Every track scores with the position of the search hit it came from, so all
 * tracks of one album share that position.
 *
 * @param query - The track searched for.
 * @param results - Bandcamp's search hits in the order it returned them.
 * @returns The best track under `MATCH_MIN_CONFIDENCE`, or a miss with the
 *   best score reached.
 * @throws When a page failed to load and the result is a miss, because that
 *   miss would not be complete.
 */
async function findBestBandcampMatch(query: SearchQuery, results: BandcampSearchResult[]): Promise<MatchResult> {
  const candidateResults = await Promise.allSettled(results.map((r) => fetchTracksForSearchResult(r)));
  const tracks = candidateResults.flatMap((result, index) =>
    result.status === "fulfilled" ? result.value.map((track) => ({ track, index })) : [],
  );
  const { best, confidence } = pickBestTrack(
    tracks,
    (track, index) => scoreSearchCandidate(query, track, index),
    logBandcampTrackScore,
  );

  const match = searchMatchResult("track", best, confidence);
  throwIfSearchIncomplete(candidateResults, match.found, Service.BandCamp);
  return match;
}

/**
 * Reads an album page's `MusicAlbum` block.
 *
 * @param html - A Bandcamp album page.
 * @returns The block, or `null` when the page has none, it is not an album
 *   block, or it carries no name.
 */
function parseAlbumJsonLd(html: string): BandcampAlbumJsonLd | null {
  const data = readJsonLd<BandcampAlbumJsonLd>(html, JSON_LD_ALBUM_TYPE);
  return data?.name ? data : null;
}

async function fetchAlbumByUrl(albumUrl: string): Promise<NormalizedAlbum | null> {
  const response = await bandcampFetch(albumUrl, ResourceKind.Album, albumUrl);
  if (response.status === 404) return null;
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Album, albumUrl);
  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return null;

  const credit = await creditedRelease(jsonLd.name, jsonLd.byArtist?.name, parseBandAccount(html));
  const artist = credit?.artist ?? jsonLd.byArtist?.name ?? "Unknown Artist";
  const tracks: AlbumTrackEntry[] = [];
  for (const item of jsonLd.track?.itemListElement ?? []) {
    if (item.item?.name) {
      tracks.push({
        title: item.item.name,
        trackNumber: item.position,
        durationMs: item.item.duration ? parseIsoDurationMs(item.item.duration, BANDCAMP_DURATION_FORMAT) : undefined,
      });
    }
  }

  return {
    sourceService: "bandcamp",
    sourceId: albumUrl.split("?")[0],
    title: credit?.title ?? jsonLd.name!,
    artists: [artist],
    releaseDate: jsonLd.datePublished,
    totalTracks: jsonLd.numTracks ?? (tracks.length > 0 ? tracks.length : undefined),
    artworkUrl: jsonLd.image,
    webUrl: jsonLd.url ?? albumUrl,
    tracks: tracks.length > 0 ? tracks : undefined,
  };
}

async function searchBandcampAlbums(query: string): Promise<Array<{ url: string; name: string; artist: string }>> {
  const results = await searchBandcamp(query);
  return results
    .filter((result) => result.kind === "album")
    .map((result) => ({ url: result.url, name: result.name, artist: result.artist }))
    .slice(0, 5);
}

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
