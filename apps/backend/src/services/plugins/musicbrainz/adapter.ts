/**
 * @file MusicBrainz adapter — first canonical-identity source.
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
 */

import { RESOURCE_KIND, SERVICE } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../../lib/infra/fetch";
import { log } from "../../../lib/infra/logger";
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
import { scoreSearchCandidate } from "../_shared/confidence.js";
import { acquireMusicBrainzSlot } from "./rate-limit.js";

const API_BASE = "https://musicbrainz.org/ws/2";
const COVER_ART_BASE = "https://coverartarchive.org/release";
const TIMEOUT_MS = 10_000;
const SEARCH_LIMIT = 10;

const MBID_REGEX_PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const RECORDING_URL_REGEX = new RegExp(
  `(?:https?://)?(?:www\\.)?musicbrainz\\.org/recording/(${MBID_REGEX_PART})`,
  "i",
);
const RELEASE_URL_REGEX = new RegExp(
  `(?:https?://)?(?:www\\.)?musicbrainz\\.org/(?:release|release-group)/(${MBID_REGEX_PART})`,
  "i",
);
const ARTIST_URL_REGEX = new RegExp(
  `(?:https?://)?(?:www\\.)?musicbrainz\\.org/artist/(${MBID_REGEX_PART})`,
  "i",
);

function userAgent(): string {
  const contact = process.env.MUSICBRAINZ_CONTACT ?? "musiccloud@layered.work";
  return `musiccloud/1.0 ( ${contact} )`;
}

async function mbFetch(endpoint: string): Promise<Response> {
  await acquireMusicBrainzSlot();
  return fetchWithTimeout(
    `${API_BASE}${endpoint}`,
    { headers: { "User-Agent": userAgent(), Accept: "application/json" } },
    TIMEOUT_MS,
  );
}

function escapeLucene(value: string): string {
  return value.replace(/["\\]/g, "").replace(/[+\-!(){}\[\]^~*?:/]/g, "\\$&");
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

interface MbRecordingSearchResponse {
  recordings?: MbRecording[];
  count?: number;
}

interface MbIsrcResponse {
  isrc?: string;
  recordings?: MbRecording[];
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

interface MbReleaseSearchResponse {
  releases?: MbReleaseDetail[];
  count?: number;
}

interface MbArtist {
  id: string;
  name: string;
  isnis?: string[];
  tags?: { name: string; count?: number }[];
  score?: number;
}

interface MbArtistSearchResponse {
  artists?: MbArtist[];
  count?: number;
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
  id: SERVICE.MUSICBRAINZ,
  displayName: "MusicBrainz",
  capabilities: {
    supportsIsrc: true,
    supportsPreview: false,
    supportsArtwork: true,
  },

  isAvailable(): boolean {
    return true;
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
      throw serviceNotFoundError(SERVICE.MUSICBRAINZ, RESOURCE_KIND.TRACK, trackId);
    }
    if (!response.ok) {
      throw serviceHttpError(SERVICE.MUSICBRAINZ, response.status, RESOURCE_KIND.TRACK, trackId);
    }

    const data = (await response.json()) as MbRecording;
    return mapRecording(data);
  },

  async findByIsrc(isrc: string): Promise<NormalizedTrack | null> {
    const response = await mbFetch(`/isrc/${encodeURIComponent(isrc)}?inc=artists+releases+work-rels&fmt=json`);

    if (!response.ok) {
      log.debug("MusicBrainz", "ISRC lookup failed:", response.status, isrc);
      return null;
    }

    const data = (await response.json()) as MbIsrcResponse;
    const recording = data.recordings?.[0];
    if (!recording) return null;

    const mapped = mapRecording(recording);
    return { ...mapped, isrc: mapped.isrc ?? isrc };
  },

  async searchTrack(query: SearchQuery): Promise<MatchResult> {
    const result = await this.searchTrackWithCandidates(query);
    return result.bestMatch;
  },

  async searchTrackWithCandidates(query: SearchQuery): Promise<SearchResultWithCandidates> {
    const isFreeText = query.title === query.artist;

    const queryString = isFreeText
      ? escapeLucene(query.title)
      : [
          buildSearchClause("recording", query.title),
          query.artist ? buildSearchClause("artist", query.artist) : "",
          query.album ? buildSearchClause("release", query.album) : "",
        ]
          .filter(Boolean)
          .join(" AND ");

    const response = await mbFetch(`/recording?query=${encodeURIComponent(queryString)}&limit=${SEARCH_LIMIT}&fmt=json`);

    if (!response.ok) {
      log.debug("MusicBrainz", "searchTrack failed:", response.status);
      return {
        bestMatch: { found: false, confidence: 0, matchMethod: "search" },
        candidates: [],
      };
    }

    const data = (await response.json()) as MbRecordingSearchResponse;
    const recordings = data.recordings ?? [];

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
    const response = await mbFetch(
      `/release/${encodeURIComponent(albumId)}?inc=artists+labels+recordings&fmt=json`,
    );

    if (response.status === 404) {
      throw serviceNotFoundError(SERVICE.MUSICBRAINZ, RESOURCE_KIND.ALBUM, albumId);
    }
    if (!response.ok) {
      throw serviceHttpError(SERVICE.MUSICBRAINZ, response.status, RESOURCE_KIND.ALBUM, albumId);
    }

    const data = (await response.json()) as MbReleaseDetail;
    return mapRelease(data);
  },

  async findAlbumByUpc(upc: string): Promise<NormalizedAlbum | null> {
    const queryString = `barcode:${escapeLucene(upc)}`;
    const response = await mbFetch(`/release?query=${encodeURIComponent(queryString)}&limit=1&fmt=json`);

    if (!response.ok) {
      log.debug("MusicBrainz", "UPC lookup failed:", response.status, upc);
      return null;
    }

    const data = (await response.json()) as MbReleaseSearchResponse;
    const release = data.releases?.[0];
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
      log.debug("MusicBrainz", "searchAlbum failed:", response.status);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as MbReleaseSearchResponse;
    const release = data.releases?.[0];
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
      throw serviceNotFoundError(SERVICE.MUSICBRAINZ, RESOURCE_KIND.ARTIST, artistId);
    }
    if (!response.ok) {
      throw serviceHttpError(SERVICE.MUSICBRAINZ, response.status, RESOURCE_KIND.ARTIST, artistId);
    }

    const data = (await response.json()) as MbArtist;
    return mapArtist(data);
  },

  async searchArtist(query: ArtistSearchQuery): Promise<ArtistMatchResult> {
    const queryString = buildSearchClause("artist", query.name);
    const response = await mbFetch(`/artist?query=${encodeURIComponent(queryString)}&limit=${SEARCH_LIMIT}&fmt=json`);

    if (!response.ok) {
      log.debug("MusicBrainz", "searchArtist failed:", response.status);
      return { found: false, confidence: 0, matchMethod: "search" };
    }

    const data = (await response.json()) as MbArtistSearchResponse;
    const artist = data.artists?.[0];
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
