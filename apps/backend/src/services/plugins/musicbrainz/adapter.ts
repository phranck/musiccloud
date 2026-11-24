/**
 * @file MusicBrainz recording, release and artist metadata through WS/2.
 *
 * The adapter reports MBID/ISWC/ISNI observations. external-ids.ts and the
 * persistence layer own their aggregation; this module does not choose the
 * application's canonical primary key. Provider relevance can rank accepted
 * recordings but cannot override a shared recording-identity rejection.
 *
 * Every request goes through `mbFetch` in `./transport.ts`, which holds the
 * request gate, the contact `User-Agent` and the 503 retry.
 *
 * Cover Art: served by Cover Art Archive (coverartarchive.org/...),
 * not MusicBrainz proper. The URL pattern is conventional - no extra
 * request or asset-existence check here. Recording artwork eligibility and
 * bounded enrichment belong to artwork.ts and the resolvers. Share rendering
 * reads existing data and does not fetch or repair an absent cover.
 *
 * Failure versus no match: a lookup or search answers "nothing" only when
 * MusicBrainz answered with an empty result list, or with 404 for an ISRC no
 * recording carries. An error status (503 when the server is busy included), a
 * body that is not JSON and a body without the result list all throw, because
 * the resolver records a returned miss and skips the service for that track
 * for a month.
 */

import { getPlatformLabel, Operation, ResourceKind, Service } from "@musiccloud/shared";
import { UpstreamUnavailableError } from "../../../lib/infra/upstream-unavailable";
import { serviceHttpError, serviceNotFoundError } from "../../../lib/resolve/service-errors";
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
import { isFreeTextSearch, namesRecording, scoreSearchCandidate } from "../_shared/confidence.js";
import { searchMatchResult } from "../_shared/rank.js";
import { mbFetch, parseMusicBrainzJson } from "./transport.js";

const COVER_ART_BASE = "https://coverartarchive.org/release";
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
const ARTIST_URL_REGEX = new RegExp(`(?:https?://)?(?:www\\.)?musicbrainz\\.org/artist/(${MBID_REGEX_PART})`, "i");

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

/**
 * Combines relevance only after shared recording identity permits the candidate.
 * Provider ranking cannot revive a rejected performer or recording version.
 *
 * MusicBrainz scores its best text hits at `100`, which is above
 * `AUTO_SELECT_THRESHOLD`. Its score therefore counts only for a search that
 * names a recording. Free text and a search naming only a title or only an
 * artist keep the shared score, which lists candidates rather than resolving one.
 *
 * @param query - The search the candidate answers.
 * @param mbScore - MusicBrainz relevance in its percentage scale.
 * @param projectScore - Shared score, including an explicit identity rejection at zero.
 * @returns Zero for a rejected recording, the shared score for a search that
 *   names no recording, otherwise the stronger of the two scores.
 */
function combinedConfidence(query: SearchQuery, mbScore: number | undefined, projectScore: number): number {
  if (projectScore === 0 || !namesRecording(query)) return projectScore;
  return Math.max(musicBrainzScore(mbScore), projectScore);
}

/** The score MusicBrainz gives its strongest search hit, the top of its percentage scale. */
const MB_SCORE_SCALE = 100;

/**
 * Converts the relevance MusicBrainz reports with a search hit into the
 * project's confidence scale.
 *
 * @param mbScore - MusicBrainz relevance from `0` to `MB_SCORE_SCALE`, or
 *   `undefined` when the hit carries none.
 * @returns The relevance divided by `MB_SCORE_SCALE` and clamped to `0` through
 *   `1`, or `0` when MusicBrainz reported no score.
 */
function musicBrainzScore(mbScore: number | undefined): number {
  return typeof mbScore === "number" ? Math.max(0, Math.min(1, mbScore / MB_SCORE_SCALE)) : 0;
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
          query.title ? buildSearchClause("recording", query.title) : "",
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
      const confidence = combinedConfidence(query, rec.score, projectScore);
      return { track, confidence };
    });

    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    return { bestMatch: searchMatchResult("track", best.track, best.confidence), candidates: scored };
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

    return searchMatchResult("album", mapRelease(release), musicBrainzScore(release.score));
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

    return searchMatchResult("artist", mapArtist(artist), musicBrainzScore(artist.score));
  },
};
