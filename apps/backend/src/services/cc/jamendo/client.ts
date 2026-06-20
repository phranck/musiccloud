/**
 * Jamendo API v3.0 client for the Creative-Commons path.
 *
 * Standalone module, deliberately not registered in the commercial
 * `services/plugins/registry.ts`. Wraps the Jamendo REST endpoints, enforces
 * the required `client_id`, and maps raw responses to CC domain objects.
 */

import type {
  CcTrack,
  JamendoEnvelope,
  JamendoTrackRaw,
} from "./types.js";

const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

/**
 * Search/filter parameters accepted by the track endpoints. Mirrors the subset
 * of Jamendo `GET /tracks` params the CC path uses; values are stringified and
 * URL-encoded by {@link jamendoFetch}.
 */
export interface CcTrackQuery {
  search?: string;
  name?: string;
  artist_name?: string;
  album_name?: string;
  tags?: string;
  fuzzytags?: string;
  limit?: number;
  offset?: number;
}

/**
 * Reads the configured Jamendo client id, throwing when it is absent so callers
 * fail loudly instead of silently hitting an unauthenticated endpoint.
 *
 * @returns The non-empty `JAMENDO_CLIENT_ID`.
 * @throws Error when `JAMENDO_CLIENT_ID` is unset or empty.
 */
function requireClientId(): string {
  const id = process.env.JAMENDO_CLIENT_ID;
  if (!id) {
    throw new Error("JAMENDO_CLIENT_ID is not set");
  }
  return id;
}

/**
 * Low-level GET against a Jamendo endpoint. Adds `client_id`, `format=json`
 * and every provided param, then validates the response envelope.
 *
 * @typeParam T - Element type of the `results` array.
 * @param path - Endpoint path below the API base, e.g. `/tracks`.
 * @param params - Query params; `undefined`/empty values are skipped.
 * @returns The parsed `results` array.
 * @throws Error on transport failure, non-OK HTTP, or `status === "failed"`.
 */
export async function jamendoFetch<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T[]> {
  const url = new URL(`${JAMENDO_BASE}${path}`);
  url.searchParams.set("client_id", requireClientId());
  url.searchParams.set("format", "json");
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Jamendo request failed: HTTP ${response.status}`);
  }
  const body = (await response.json()) as JamendoEnvelope<T>;
  if (body.headers.status !== "success") {
    throw new Error(`Jamendo API error: ${body.headers.error_message ?? body.headers.code}`);
  }
  return body.results;
}

/**
 * Maps a raw Jamendo track to the CC domain shape.
 * Converts duration seconds → ms and prefers the track image over the album
 * image for artwork.
 *
 * @param raw - Raw Jamendo track object.
 * @returns The mapped {@link CcTrack}.
 */
export function mapJamendoTrack(raw: JamendoTrackRaw): CcTrack {
  return {
    jamendoId: raw.id,
    title: raw.name,
    artistName: raw.artist_name,
    jamendoArtistId: raw.artist_id,
    albumName: raw.album_name || undefined,
    jamendoAlbumId: raw.album_id || undefined,
    artworkUrl: raw.image || raw.album_image || undefined,
    durationMs: raw.duration ? raw.duration * 1000 : undefined,
    releaseDate: raw.releasedate || undefined,
    licenseCcurl: raw.license_ccurl || undefined,
    streamUrl: raw.audio,
    downloadUrl: raw.audiodownload || undefined,
    downloadAllowed: Boolean(raw.audiodownload_allowed),
    waveform: raw.waveform || undefined,
    shareUrl: raw.shareurl || undefined,
  };
}

/**
 * Searches CC tracks via `GET /tracks`. Accepts free-text (`search`) or the
 * structured fields (`name`/`artist_name`/`album_name`) the hero parser yields.
 *
 * @param query - Search/filter params.
 * @returns Mapped CC tracks (possibly empty).
 * @throws Error on missing client id or API failure (see {@link jamendoFetch}).
 */
export async function searchCcTracks(query: CcTrackQuery): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", {
    search: query.search,
    name: query.name,
    artist_name: query.artist_name,
    album_name: query.album_name,
    tags: query.tags,
    fuzzytags: query.fuzzytags,
    limit: query.limit,
    offset: query.offset,
  });
  return raw.map(mapJamendoTrack);
}

/**
 * Fetches a single CC track by its Jamendo id.
 *
 * @param jamendoId - Jamendo track id.
 * @returns The mapped track, or null when none matches.
 * @throws Error on missing client id or API failure.
 */
export async function getCcTrack(jamendoId: string): Promise<CcTrack | null> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks", { id: jamendoId, limit: 1 });
  const first = raw[0];
  return first ? mapJamendoTrack(first) : null;
}

/**
 * Fetches tracks similar to a seed track via `GET /tracks/similar`.
 * Jamendo returns these ordered by descending similarity.
 *
 * @param seedJamendoId - Jamendo id of the seed track.
 * @param limit - Maximum number of similar tracks (default 12).
 * @returns Mapped similar tracks (possibly empty).
 * @throws Error on missing client id or API failure.
 */
export async function getSimilarCcTracks(seedJamendoId: string, limit = 12): Promise<CcTrack[]> {
  const raw = await jamendoFetch<JamendoTrackRaw>("/tracks/similar", { id: seedJamendoId, limit });
  return raw.map(mapJamendoTrack);
}
