/**
 * @file MusicBrainz adapter, the first canonical-identity source.
 *
 * MusicBrainz is community-curated metadata, not a streaming target.
 * The adapter exists to harvest cross-platform identifiers (MBID for
 * recordings/releases/artists, ISWC for compositions, ISNI for artists)
 * into the *_external_ids aggregation tables introduced by Phase A,
 * and to act as the eventual canonical primary key when the
 * static-vs-dynamic cache split lands.
 *
 * Auth: none (keyless WS/2 API).
 *
 * Rate limit: 1 req/s for unauthenticated callers, enforced via
 * acquireMusicBrainzSlot() in ./rate-limit.ts. Exceeding produces 503
 * with Retry-After. The gate is mandatory; bypass at your peril.
 *
 * User-Agent: required by MusicBrainz. Built from MUSICBRAINZ_CONTACT
 * env var (defaulting to a project-level placeholder when unset).
 *
 * Cover Art: served by Cover Art Archive (coverartarchive.org/...),
 * not MusicBrainz proper. The URL pattern is conventional - no extra
 * request, no 404 handling here. If the image is missing, the share
 * page's existing artwork-backfill logic in album-resolver.ts kicks
 * in and pulls cover art from another adapter.
 *
 * Failure versus no match: a lookup or search answers "nothing" only when
 * MusicBrainz answered with an empty result list, or with 404 for an ISRC no
 * recording carries. An error status (503 when the server is busy included), a
 * body that is not JSON and a body without the result list all throw, because
 * the resolver records a returned miss and skips the service for that track
 * for a month.
 */

import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
import { MATCH_MIN_CONFIDENCE } from "../../constants.js";
import type {
  AlbumMatchResult,
  AlbumSearchQuery,
  ArtistMatchResult,
  ArtistSearchQuery,
  MatchResult,
  NormalizedAlbum,
  NormalizedArtist,
  NormalizedTrack,
  SearchQuery,
  SearchResultWithCandidates,
} from "../../types.js";
import { isFreeTextSearch, scoreSearchCandidate } from "../_shared/confidence.js";
import { acquireMusicBrainzSlot } from "./rate-limit.js";

const API_BASE = "https://musicbrainz.org/ws/2";
const COVER_ART_BASE = "https://coverartarchive.org/release";
const TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 10;
const MAX_503_RETRIES = 1;
const DEFAULT_503_RETRY_AFTER_MS = 1100;
const MAX_503_RETRY_AFTER_MS = 5000;

const MBID_REGEX_PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const RECORDING_URL_REGEX = new RegExp(
  `(?:https?://)?(?:www\\.)?musicbrainz\\.org/recording/(${MBID_REGEX_PART})`,
  "i",
);
const RELEASE_URL_REGEX = new RegExp(
  `(?:https?://)?(?:www\\.)?musicbrainz\\.org/(?:release|release-group)/(${MBID_REGEX_PART})`,
  "i",
);
const ARTIST_URL_REGEX = new RegExp(`(?:https?://)?(?:www\\.)?musicbrainz\\.org/artist/(${MBID_REGEX_PART})`, "i");

function userAgent(): string {
  const contact = process.env.MUSICBRAINZ_CONTACT ?? "musiccloud@layered.work";
  return `musiccloud/1.0 ( ${contact} )`;
}

function parseRetryAfterMs(value: string | null): number {
  if (!value) return DEFAULT_503_RETRY_AFTER_MS;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_503_RETRY_AFTER_MS);
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), MAX_503_RETRY_AFTER_MS);
  }

  return DEFAULT_503_RETRY_AFTER_MS;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Requests a MusicBrainz web service path through the shared request gate,
 * with the contact `User-Agent` MusicBrainz requires, retrying one 503 after
 * the delay MusicBrainz asks for. Every MusicBrainz call in the backend goes
 * through here, so the gate holds across the adapter and the identity
 * enrichment alike.
 *
 * @param endpoint - The path below `/ws/2`, with its query string.
 * @returns The response as received, whatever its status.
 */
export async function mbFetch(endpoint: string): Promise<Response> {
  const url = `${API_BASE}${endpoint}`;

  for (let attempt = 0; ; attempt += 1) {
    await acquireMusicBrainzSlot();
    const response = await fetchWithTimeout(
      url,
      { headers: { "User-Agent": userAgent(), Accept: "application/json" } },
      TIMEOUT_MS,
    );

    if (response.status !== 503 || attempt >= MAX_503_RETRIES) {
      return response;
    }

    const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
    log.debug("MusicBrainz", "503 response, retrying:", endpoint, retryAfterMs);
    await sleep(retryAfterMs);
  }
}

/**
 * Reads a MusicBrainz response body as JSON.
 *
 * @param response - A successful response.
 * @param context - What was requested, for the debug log.
 * @returns The parsed body, or `null` when it is not valid JSON.
 */
export async function parseMusicBrainzJson<T>(response: Response, context: string): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    log.debug("MusicBrainz", "Malformed JSON response:", context, error instanceof Error ? error.message : error);
    return null;
  }
}

function escapeLucene(value: string): string {
  return value.replace(/["\\]/g, "").replace(/[+\-!(){}[\]^~*?:/]/g, "\\$&");
}

function buildSearchClause(field: string, value: string): string {
  return `${field}:"${escapeLucene(value)}"`;
}

interface MbArtistCredit {
  name: string;
  artist: { id: string; name: string };
}

interface MbReleaseRef {
  id: string;
  title: string;
  date?: string;
}

interface MbWorkRel {
  type: string;
  work?: { id: string; iswcs?: string[] };
}

interface MbRecording {
  id: string;
  title: string;
  length?: number;
  isrcs?: string[];
  "artist-credit"?: MbArtistCredit[];
  releases?: MbReleaseRef[];
  relations?: MbWorkRel[];
  score?: number;
}

interface MbReleaseDetail {
  id: string;
  title: string;
  date?: string;
  barcode?: string;
  "artist-credit"?: MbArtistCredit[];
  "label-info"?: { label?: { name: string }; "catalog-number"?: string }[];
  media?: { tracks?: unknown[] }[];
  score?: number;
}

interface MbReleaseGroupDetail {
  id: string;
  title: string;
  "first-release-date"?: string;
  "artist-credit"?: MbArtistCredit[];
  releases?: MbReleaseRef[];
}

interface MbArtist {
  id: string;
  name: string;
  isnis?: string[];
  tags?: { name: string; count?: number }[];
  score?: number;
}

/** The keys under which MusicBrainz answers the result list of a search or an ISRC lookup. */
type MbResultList = "recordings" | "releases" | "artists";

/**
 * Reads the result list of a MusicBrainz answer that came back with status 200.
 *
 * MusicBrainz always carries the list, so a search without matches is an empty
 * list. A body without the list is not that answer.
 *
 * @param response - A successful response.
 * @param listKey - The key of the list in the answer.
 * @param context - What was requested, for the error message.
 * @returns The list, empty when nothing matched.
 * @throws {UpstreamUnavailableError} When the body is not JSON or has no such list.
 */
async function readResultList<T>(response: Response, listKey: MbResultList, context: string): Promise<T[]> {
  const data = await parseMusicBrainzJson<Partial<Record<MbResultList, unknown>>>(response, context);
  if (data === null || typeof data !== "object") {
    throw new UpstreamUnavailableError(Service.MusicBrainz, `${context} answered a body that is not JSON`);
  }

  const list = data[listKey];
  if (!Array.isArray(list)) {
    throw new UpstreamUnavailableError(Service.MusicBrainz, `${context} answered without the ${listKey} list`);
  }
  return list as T[];
}

function recordingArtistNames(rec: MbRecording): string[] {
  const credits = rec["artist-credit"] ?? [];
  if (credits.length === 0) return [];
  return credits.map((c) => c.name);
}

function recordingReleaseInfo(rec: MbRecording): { albumName?: string; releaseDate?: string; releaseMbid?: string } {
  const release = rec.releases?.[0];
  if (!release) return {};
  return { albumName: release.title, releaseDate: release.date, releaseMbid: release.id };
}

function recordingIswc(rec: MbRecording): string | undefined {
  const work = rec.relations?.find((r) => r.type === "performance" && r.work);
  return work?.work?.iswcs?.[0];
}

function mapRecording(rec: MbRecording): NormalizedTrack {
  const { albumName, releaseDate, releaseMbid } = recordingReleaseInfo(rec);
  return {
    sourceService: "musicbrainz",
    sourceId: rec.id,
    title: rec.title,
    artists: recordingArtistNames(rec),
    albumName,
    releaseDate,
    durationMs: rec.length,
    isrc: rec.isrcs?.[0],
    mbid: rec.id,
    iswc: recordingIswc(rec),
    artworkUrl: releaseMbid ? `${COVER_ART_BASE}/${releaseMbid}/front-500.jpg` : undefined,
    webUrl: `https://musicbrainz.org/recording/${rec.id}`,
  };
}

function releaseLabel(release: MbReleaseDetail): string | undefined {
  const li = release["label-info"]?.find((entry) => entry.label?.name);
  return li?.label?.name;
}

function mapRelease(release: MbReleaseDetail): NormalizedAlbum {
  return {
    sourceService: "musicbrainz",
    sourceId: release.id,
    title: release.title,
    artists: (release["artist-credit"] ?? []).map((c) => c.name),
    releaseDate: release.date,
    totalTracks: release.media?.reduce((sum, m) => sum + (m.tracks?.length ?? 0), 0),
    artworkUrl: `${COVER_ART_BASE}/${release.id}/front-500.jpg`,
    label: releaseLabel(release),
    upc: release.barcode,
    mbid: release.id,
    webUrl: `https://musicbrainz.org/release/${release.id}`,
  };
}

function mapReleaseGroup(releaseGroup: MbReleaseGroupDetail): NormalizedAlbum {
  const release = releaseGroup.releases?.[0];
  const releaseId = release?.id ?? releaseGroup.id;
  return {
    sourceService: "musicbrainz",
    sourceId: releaseId,
    title: release?.title ?? releaseGroup.title,
    artists: (releaseGroup["artist-credit"] ?? []).map((c) => c.name),
    releaseDate: release?.date ?? releaseGroup["first-release-date"],
    artworkUrl: `${COVER_ART_BASE}/${releaseId}/front-500.jpg`,
    mbid: releaseId,
    webUrl: release
      ? `https://musicbrainz.org/release/${releaseId}`
      : `https://musicbrainz.org/release-group/${releaseGroup.id}`,
  };
}

function mapArtist(artist: MbArtist): NormalizedArtist {
  return {
    sourceService: "musicbrainz",
    sourceId: artist.id,
    name: artist.name,
    genres: artist.tags
      ?.slice()
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 3)
      .map((t) => t.name),
    webUrl: `https://musicbrainz.org/artist/${artist.id}`,
    mbid: artist.id,
    isni: artist.isnis?.[0],
  };
}

function combinedConfidence(mbScore: number | undefined, projectScore: number): number {
  const normalisedMb = typeof mbScore === "number" ? Math.max(0, Math.min(1, mbScore / 100)) : 0;
  return Math.max(normalisedMb, projectScore);
}

export const musicbrainzAdapter = {
  id: Service.MusicBrainz,
  displayName: getPlatformLabel(Service.MusicBrainz),
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  detectUrl(url: string): string | null {
    const match = RECORDING_URL_REGEX.exec(url);
    return match ? match[1].toLowerCase() : null;
  },

  async getTrack(trackId: string): Promise<NormalizedTrack> {
    const response = await mbFetch(
      `/recording/${encodeURIComponent(trackId)}?inc=artists+releases+isrcs+work-rels&fmt=json`,
    );

    if (response.status === 404) {
      throw serviceNotFoundError(Service.MusicBrainz, ResourceKind.Track, trackId);
    }
    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Track, trackId);
    }

    const data = await parseMusicBrainzJson<MbRecording>(response, `recording/${trackId}`);
    if (!data) {
      throw serviceHttpError(Service.MusicBrainz, 502, ResourceKind.Track, trackId);
    }
    return mapRecording(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await mbFetch(`/isrc/${encodeURIComponent(isrc)}?inc=artists+releases+work-rels&fmt=json`);

    // MusicBrainz answers 404 for an ISRC that no recording carries, which is an
    // answer. Any other error status is a failure.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Track, isrc, Operation.IsrcLookup);
    }

    const recording = (await readResultList<MbRecording>(response, "recordings", `isrc/${isrc}`))[0];
    if (!recording) return null;

    const mapped = mapRecording(recording);
    return { ...mapped, isrc: mapped.isrc ?? isrc };
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const result = await this.searchTrackWithCandidates(query);
    return result.bestMatch;
  },

  async searchTrackWithCandidates(query: SearchQuery): Promise<SearchResultWithCandidates> {
    const isFreeText = isFreeTextSearch(query);

    const queryString = isFreeText
      ? escapeLucene(query.title)
      : [
          buildSearchClause("recording", query.title),
          query.artist ? buildSearchClause("artist", query.artist) : "",
          query.album ? buildSearchClause("release", query.album) : "",
        ]
          .filter(Boolean)
          .join(" AND ");

    const response = await mbFetch(
      `/recording?query=${encodeURIComponent(queryString)}&limit=${SEARCH_LIMIT}&fmt=json`,
    );

    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Track, queryString, Operation.Search);
    }

    const recordings = await readResultList<MbRecording>(response, "recordings", "recording search");

    if (recordings.length === 0) {
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const scored = recordings.map((rec, i) => {
      const track = mapRecording(rec);
      const projectScore = scoreSearchCandidate(query, track, i);
      const confidence = combinedConfidence(rec.score, projectScore);
      return { track, confidence };
    });

    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    const bestMatch: MatchResult =
      best.confidence >= MATCH_MIN_CONFIDENCE
        ? { found: true, track: best.track, confidence: best.confidence, matchMethod: "search" }
        : { found: false, confidence: best.confidence, matchMethod: "search" };

    return { bestMatch, candidates: scored };
  },

  albumCapabilities: {
    supportsUpc: true,
    supportsAlbumSearch: true,
    supportsTrackListing: false,
  },

  detectAlbumUrl(url: string): string | null {
    const match = RELEASE_URL_REGEX.exec(url);
    return match ? match[1].toLowerCase() : null;
  },

  async getAlbum(albumId: string): Promise<NormalizedAlbum> {
    const response = await mbFetch(`/release/${encodeURIComponent(albumId)}?inc=artists+labels+recordings&fmt=json`);

    if (response.status === 404) {
      const releaseGroupResponse = await mbFetch(
        `/release-group/${encodeURIComponent(albumId)}?inc=artists+releases&fmt=json`,
      );
      if (releaseGroupResponse.ok) {
        const releaseGroup = await parseMusicBrainzJson<MbReleaseGroupDetail>(
          releaseGroupResponse,
          `release-group/${albumId}`,
        );
        if (releaseGroup) return mapReleaseGroup(releaseGroup);
      }
      if (releaseGroupResponse.status !== 404 && !releaseGroupResponse.ok) {
        throw serviceHttpError(Service.MusicBrainz, releaseGroupResponse.status, ResourceKind.Album, albumId);
      }
      throw serviceNotFoundError(Service.MusicBrainz, ResourceKind.Album, albumId);
    }
    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Album, albumId);
    }

    const data = await parseMusicBrainzJson<MbReleaseDetail>(response, `release/${albumId}`);
    if (!data) {
      throw serviceHttpError(Service.MusicBrainz, 502, ResourceKind.Album, albumId);
    }
    return mapRelease(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const queryString = `barcode:${escapeLucene(upc)}`;
    const response = await mbFetch(`/release?query=${encodeURIComponent(queryString)}&limit=1&fmt=json`);

    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Album, upc, Operation.UpcLookup);
    }

    const release = (await readResultList<MbReleaseDetail>(response, "releases", `release barcode/${upc}`))[0];
    if (!release) return null;

    return mapRelease(release);
  },

  async searchAlbum(query: AlbumSearchQuery): Promise<AlbumMatchResult> {
    const queryString = [
      buildSearchClause("release", query.title),
      query.artist ? buildSearchClause("artist", query.artist) : "",
      query.year ? `date:${escapeLucene(query.year)}` : "",
    ]
      .filter(Boolean)
      .join(" AND ");

    const response = await mbFetch(`/release?query=${encodeURIComponent(queryString)}&limit=${SEARCH_LIMIT}&fmt=json`);

    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Album, queryString, Operation.Search);
    }

    const release = (await readResultList<MbReleaseDetail>(response, "releases", "release search"))[0];
    if (!release) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const album = mapRelease(release);
    const confidence = typeof release.score === "number" ? Math.max(0, Math.min(1, release.score / 100)) : 0;

    if (confidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence, matchMethod: "search" };
    }

    return { found: true, album, confidence, matchMethod: "search" };
  },

  artistCapabilities: {
    supportsArtistSearch: true,
  },

  detectArtistUrl(url: string): string | null {
    const match = ARTIST_URL_REGEX.exec(url);
    return match ? match[1].toLowerCase() : null;
  },

  async getArtist(artistId: string): Promise<NormalizedArtist> {
    const response = await mbFetch(`/artist/${encodeURIComponent(artistId)}?inc=tags&fmt=json`);

    if (response.status === 404) {
      throw serviceNotFoundError(Service.MusicBrainz, ResourceKind.Artist, artistId);
    }
    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Artist, artistId);
    }

    const data = await parseMusicBrainzJson<MbArtist>(response, `artist/${artistId}`);
    if (!data) {
      throw serviceHttpError(Service.MusicBrainz, 502, ResourceKind.Artist, artistId);
    }
    return mapArtist(data);
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const queryString = buildSearchClause("artist", query.name);
    const response = await mbFetch(`/artist?query=${encodeURIComponent(queryString)}&limit=${SEARCH_LIMIT}&fmt=json`);

    if (!response.ok) {
      throw serviceHttpError(Service.MusicBrainz, response.status, ResourceKind.Artist, query.name, Operation.Search);
    }

    const artist = (await readResultList<MbArtist>(response, "artists", "artist search"))[0];
    if (!artist) {
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const mapped = mapArtist(artist);
    const confidence = typeof artist.score === "number" ? Math.max(0, Math.min(1, artist.score / 100)) : 0;

    if (confidence < MATCH_MIN_CONFIDENCE) {
      return { found: false, confidence, matchMethod: "search" };
    }

    return { found: true, artist: mapped, confidence, matchMethod: "search" };
  },
};
