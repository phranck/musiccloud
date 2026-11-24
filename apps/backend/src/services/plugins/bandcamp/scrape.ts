/**
 * @file Bandcamp page scraping: fetches a track or album page and turns it into
 * normalized data.
 *
 * ## JSON-LD first, OG fallback
 *
 * Track and album pages embed `application/ld+json` blocks
 * (`MusicRecording` / `MusicAlbum`). The scraper prefers those for their
 * structured artist, album, and track-listing data. If parsing fails (or the
 * `@type` is wrong on a rare page), it falls back to OG tags: the title format
 * on Bandcamp is `"Track, by Artist"`, which splits cleanly on `", by "`.
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
 * Every request goes through `bandcampTransport`, which runs `curl`. A request
 * that fails or meets the CDN's client challenge is reported as Bandcamp being
 * unavailable (status 503), never as "not found", because a "not found" makes
 * the resolver skip Bandcamp for that item for a long time.
 *
 * ## Labels that name their bands in the title
 *
 * `creditedRelease` in `label-credits.ts` recognises a label's account by its
 * discography and reads the band out of the title.
 */
import { Operation, ResourceKind, Service } from "@musiccloud/shared";
import { serviceHttpError } from "../../../lib/resolve/service-errors";
import type { AlbumTrackEntry, NormalizedAlbum, NormalizedTrack } from "../../types.js";
import { type IsoDurationFormat, MS_PER_SECOND, parseIsoDurationMs } from "../_shared/duration.js";
import { JSON_LD_ALBUM_TYPE, JSON_LD_RECORDING_TYPE, readJsonLd } from "../_shared/json-ld.js";
import { extractOgTags } from "../_shared/og.js";
import { type BandcampAccount, creditedRelease } from "./label-credits.js";
import { BANDCAMP_REQUEST_TIMEOUT_MS, bandcampTransport } from "./transport.js";

/**
 * The status a failed Bandcamp request is reported with. 503 says Bandcamp
 * did not answer, so `serviceHttpError` builds Bandcamp's generic failure code
 * rather than its "not found" code.
 */
const BANDCAMP_UNAVAILABLE_STATUS = 503;

/** The status Bandcamp answers for a page it does not have. */
const NOT_FOUND_STATUS = 404;

/** The `data-` attribute that holds a page's track and album listing as JSON. */
const TRALBUM_ATTRIBUTE = "data-tralbum";

/** The `data-` attribute that holds a page's embed data as JSON. */
const EMBED_ATTRIBUTE = "data-embed";

/** The `data-` attribute that holds the publishing account as JSON. */
const BAND_ATTRIBUTE = "data-band";

/** The artist name used when a page names none. */
const UNKNOWN_ARTIST = "Unknown Artist";

/** The separator of an OG title, `"Track, by Artist"`. */
const OG_TITLE_ARTIST_SEPARATOR = ", by ";

/** The `sourceService` value of every normalized Bandcamp track and album. */
const SOURCE_SERVICE = "bandcamp";

/** Bandcamp's period dialect: `P00H03M45S`, with no `T` after the `P`. */
const BANDCAMP_DURATION_FORMAT: IsoDurationFormat = { timeDesignator: false };

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

/**
 * Requests a Bandcamp page or the search endpoint through {@link bandcampTransport}.
 *
 * @param url - The Bandcamp address to request.
 * @param kind - What is being fetched, for the error code and message.
 * @param id - What the caller asked for: the page URL, or the search text.
 * @param op - The operation, `Operation.Fetch` for a page (the default) and
 *   `Operation.Search` for the search endpoint.
 * @returns Bandcamp's answer. An error status such as 404 is returned, not thrown.
 * @throws {ResolveError} Bandcamp's generic failure code, built from
 *   {@link BANDCAMP_UNAVAILABLE_STATUS}, when the request fails or meets the
 *   CDN's client challenge. The transport has logged the cause.
 */
export async function bandcampFetch(
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

/**
 * Decodes the HTML entities Bandcamp writes into a `data-` attribute value.
 *
 * @param value - The raw attribute value.
 * @returns The value with quotes, ampersands and angle brackets restored.
 */
function decodeHtmlAttribute(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/**
 * Reads one JSON-valued `data-` attribute of a page.
 *
 * @param html - A Bandcamp page.
 * @param attribute - The attribute name, such as {@link TRALBUM_ATTRIBUTE}.
 * @returns The decoded and parsed value, typed as the caller's shape, or
 *   `null` when the page has no such attribute or its value is not JSON.
 */
function parseDataAttribute<T>(html: string, attribute: string): T | null {
  const match = new RegExp(`${attribute}="([^"]+)"`).exec(html);
  if (!match?.[1]) return null;

  try {
    return JSON.parse(decodeHtmlAttribute(match[1])) as T;
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
  const data = parseDataAttribute<{ id?: unknown; name?: unknown }>(html, BAND_ATTRIBUTE);
  return typeof data?.id === "number" && typeof data.name === "string" ? { id: data.id, name: data.name } : null;
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

/**
 * Builds the page URL of one track of an album.
 *
 * @param albumUrl - The album page URL.
 * @param titleLink - The track's link as the album page lists it, relative or absolute.
 * @returns The track's URL without a query string, or the album URL when the track lists no link.
 */
function trackUrlFromAlbum(albumUrl: string, titleLink: string | undefined): string {
  if (!titleLink) return albumUrl.split("?")[0];
  return new URL(titleLink, albumUrl).toString().split("?")[0];
}

/**
 * Fetches a track page and normalizes it.
 *
 * @param trackUrl - The track page URL, which is also the track's `sourceId`.
 * @returns The track from the page's JSON-LD block, or from its OG tags when
 *   the block is missing, or `null` when Bandcamp answers 404 or the page has neither.
 * @throws {ResolveError} When the request fails or Bandcamp answers an error status other than 404.
 */
export async function fetchTrackByUrl(trackUrl: string): Promise<NormalizedTrack | null> {
  const response = await bandcampFetch(trackUrl, ResourceKind.Track, trackUrl);
  // A page Bandcamp does not have answers 404, which is an answer. Any other
  // error status is a failure.
  if (response.status === NOT_FOUND_STATUS) return null;
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Track, trackUrl);

  const html = await response.text();
  const embedData = parseDataAttribute<BandcampEmbedData>(html, EMBED_ATTRIBUTE);
  const tralbumData = parseDataAttribute<BandcampTralbumData>(html, TRALBUM_ATTRIBUTE);

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
      sourceService: SOURCE_SERVICE,
      sourceId: trackUrl,
      title: jsonLd.name,
      artists: [credit?.artist ?? artist ?? UNKNOWN_ARTIST],
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
    const parts = og.title.split(OG_TITLE_ARTIST_SEPARATOR);
    const title = parts[0] ?? og.title;
    const artist = parts[1] ?? UNKNOWN_ARTIST;

    return {
      sourceService: SOURCE_SERVICE,
      sourceId: trackUrl,
      title,
      artists: [artist],
      artworkUrl: og.image,
      webUrl: og.url ?? trackUrl,
    };
  }

  return null;
}

/**
 * Fetches an album page and normalizes each of its tracks.
 *
 * @param albumUrl - The album page URL.
 * @returns The tracks in album order, each with the page URL of its own as
 *   `sourceId`, or an empty list when Bandcamp answers 404 or the page has no album block.
 * @throws {ResolveError} When the request fails or Bandcamp answers an error status other than 404.
 */
export async function fetchTracksByAlbumUrl(albumUrl: string): Promise<NormalizedTrack[]> {
  const response = await bandcampFetch(albumUrl, ResourceKind.Album, albumUrl);
  if (response.status === NOT_FOUND_STATUS) return [];
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Album, albumUrl);

  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return [];

  const tralbum = parseDataAttribute<BandcampTralbumData>(html, TRALBUM_ATTRIBUTE);
  const credit = await creditedRelease(jsonLd.name, jsonLd.byArtist?.name, parseBandAccount(html));
  const artist = credit?.artist ?? jsonLd.byArtist?.name ?? UNKNOWN_ARTIST;
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
      sourceService: SOURCE_SERVICE,
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

/**
 * Fetches an album page and normalizes it as an album.
 *
 * @param albumUrl - The album page URL.
 * @returns The album with its track listing, or `null` when Bandcamp answers
 *   404 or the page has no album block.
 * @throws {ResolveError} When the request fails or Bandcamp answers an error status other than 404.
 */
export async function fetchAlbumByUrl(albumUrl: string): Promise<NormalizedAlbum | null> {
  const response = await bandcampFetch(albumUrl, ResourceKind.Album, albumUrl);
  if (response.status === NOT_FOUND_STATUS) return null;
  if (!response.ok) throw serviceHttpError(Service.BandCamp, response.status, ResourceKind.Album, albumUrl);
  const html = await response.text();
  const jsonLd = parseAlbumJsonLd(html);
  if (!jsonLd) return null;

  const credit = await creditedRelease(jsonLd.name, jsonLd.byArtist?.name, parseBandAccount(html));
  const artist = credit?.artist ?? jsonLd.byArtist?.name ?? UNKNOWN_ARTIST;
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
    sourceService: SOURCE_SERVICE,
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
