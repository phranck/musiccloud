/**
 * Artist Info service.
 *
 * Profile + top-tracks come from the generic artist-composition layer:
 * each source (Spotify, Deezer, Last.fm) returns a tagged Partial of a
 * canonical record, the merge strategy picks per-field winners, and a
 * trivial mapper translates the canonical record into the public
 * ArtistProfile shape. Spotify is one source among several, so an outage on
 * any single source no longer blanks the response.
 *
 * Tour dates (Bandsintown + Ticketmaster) keep their own pipeline; that
 * is a different data domain (event listings, not artist identity).
 *
 * Every section fetch reports whether all of its sources answered. A source
 * that failed is not the same as a source that has nothing, and the cache
 * (`artist-info-cache.ts`) must not store the first as if it were the second.
 */

import type { ArtistEvent, ArtistProfile, ArtistProfileProvider, ArtistTopTrack } from "@musiccloud/shared";
import { createSingleFlight } from "../lib/concurrency.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { UpstreamUnavailableError } from "../lib/infra/upstream-unavailable.js";
import { sanitizeArtistProfile } from "./artist-bio-sanitizer.js";
import { mergeArtistPartials, pickSourceForField } from "./artist-composition/merge.js";
import { fetchDeezerArtistPartial } from "./artist-composition/sources/deezer-source.js";
import { fetchLastFmArtistPartial } from "./artist-composition/sources/lastfm-source.js";
import { fetchSpotifyArtistPartial } from "./artist-composition/sources/spotify-source.js";
import { ARTIST_MERGE_STRATEGY } from "./artist-composition/strategy.js";
import type { ArtistPartial, CanonicalArtist } from "./artist-composition/types.js";
import { cacheArtistImage } from "./artist-images.js";
import { searchDeezerTrackForArtist } from "./plugins/deezer/track-search.js";

const BANDSINTOWN_BASE = "https://rest.bandsintown.com";
const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

interface BandsintownEvent {
  datetime: string;
  venue: { name: string; city: string; country: string };
  offers?: { type: string; url: string }[];
}

interface TicketmasterEvent {
  dates: { start: { localDate: string } };
  _embedded?: {
    venues?: { name: string; city: { name: string }; country: { countryCode: string } }[];
  };
  url?: string;
}

interface TicketmasterResponse {
  _embedded?: { events?: TicketmasterEvent[] };
}

/**
 * What one artist-info section fetch produced.
 *
 * @property value - The section data, as complete as the sources allowed.
 * @property complete - False when a source failed rather than answered. The
 *   value may then lack data a later fetch would have, so it must not be
 *   remembered as the artist's real state.
 */
export interface ArtistInfoFetch<Value> {
  value: Value;
  complete: boolean;
}

/**
 * Waits for every source and reports which ones failed. A failed source
 * contributes `null` and is logged as a deviation.
 *
 * @param sources - Each source's name and its pending answer.
 * @param operation - The section being fetched, for the log.
 * @returns The answers in source order, and whether every source answered.
 */
async function settleSources<Value>(
  sources: ReadonlyArray<readonly [source: string, answer: Promise<Value>]>,
  operation: string,
): Promise<{ values: Array<Value | null>; complete: boolean }> {
  const settled = await Promise.allSettled(sources.map(([, answer]) => answer));
  let complete = true;
  const values = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    complete = false;
    log.deviation(
      {
        component: "ArtistInfo",
        errorCode: "MC-API-0004",
        operation,
        outcome: "section_incomplete",
        source: sources[index][0],
      },
      result.reason,
    );
    return null;
  });
  return { values, complete };
}

// ─── Profile + Top Tracks (generic composition) ──────────────────────────────

/**
 * Profile and top tracks both read the Deezer and Last.fm partials, and a cold
 * artist column fetches both sections at once. Sharing the running fetch per
 * artist name means each partial is requested once for that column, not twice.
 */
const deezerPartialOnce = createSingleFlight<string, ArtistPartial | null>();
const lastFmPartialOnce = createSingleFlight<string, ArtistPartial | null>();

function sharedDeezerPartial(name: string): Promise<ArtistPartial | null> {
  return deezerPartialOnce(name, () => fetchDeezerArtistPartial(name));
}

function sharedLastFmPartial(name: string): Promise<ArtistPartial | null> {
  return lastFmPartialOnce(name, () => fetchLastFmArtistPartial(name));
}

function mapCanonicalToArtistProfile(canonical: CanonicalArtist): ArtistProfile {
  return {
    imageUrl: canonical.imageUrl,
    genres: canonical.genres.slice(0, 3),
    popularity: canonical.popularity,
    followers: canonical.followers,
    bioSummary: canonical.bioSummary,
    scrobbles: canonical.scrobbles,
    similarArtists: canonical.similarArtists.slice(0, 5),
  };
}

export interface ArtistProfileSnapshot {
  profile: ArtistProfile;
  providers: ArtistProfileProvider[];
}

const PROFILE_FIELDS = [
  "imageUrl",
  "genres",
  "popularity",
  "followers",
  "bioSummary",
  "scrobbles",
  "similarArtists",
] as const satisfies ReadonlyArray<keyof CanonicalArtist>;

const PROFILE_PROVIDER_ORDER: ArtistProfileProvider[] = ["spotify", "deezer", "lastfm"];

export function composeArtistProfileSnapshot(
  partials: Array<ArtistPartial | null>,
  artistName: string,
): ArtistProfileSnapshot | null {
  if (partials.every((partial) => partial === null)) return null;

  const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);
  const composedProfile = mapCanonicalToArtistProfile(merged);
  const profile = sanitizeArtistProfile(composedProfile) ?? composedProfile;
  const selectedProviders = new Set(
    PROFILE_FIELDS.filter((field) => isUsableProfileValue(profile[field]))
      .map((field) => pickSourceForField(partials, ARTIST_MERGE_STRATEGY, field))
      .filter(
        (source): source is ArtistProfileProvider => source === "spotify" || source === "deezer" || source === "lastfm",
      ),
  );
  if (selectedProviders.size === 0) return null;

  return {
    profile,
    providers: PROFILE_PROVIDER_ORDER.filter((provider) => selectedProviders.has(provider)),
  };
}

function isUsableProfileValue(value: ArtistProfile[keyof ArtistProfile]): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Composes an artist's profile from Spotify, Deezer and Last.fm.
 *
 * @param artistName - The artist name sent to every source.
 * @returns The snapshot, `null` when no source knows the artist, and whether
 *   every source answered.
 */
export async function fetchArtistProfileSnapshot(
  artistName: string,
): Promise<ArtistInfoFetch<ArtistProfileSnapshot | null>> {
  try {
    const { values: partials, complete } = await settleSources(
      [
        ["spotify", fetchSpotifyArtistPartial(artistName)],
        ["deezer", sharedDeezerPartial(artistName)],
        ["lastfm", sharedLastFmPartial(artistName)],
      ],
      "artist_profile_fetch",
    );
    const snapshot = composeArtistProfileSnapshot(partials, artistName);

    if (snapshot?.profile.imageUrl) {
      const source = pickSourceForField(partials, ARTIST_MERGE_STRATEGY, "imageUrl");
      if (source) {
        cacheArtistImage(artistName, snapshot.profile.imageUrl, source).catch((error) =>
          log.deviation(
            {
              component: "ArtistInfo",
              errorCode: "MC-DB-0004",
              operation: "artist_image_cache_write",
              outcome: "profile_without_cache_update",
              source,
            },
            error,
          ),
        );
      }
    }

    return { value: snapshot, complete };
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistProfileSnapshot error:", err instanceof Error ? err.message : String(err));
    return { value: null, complete: false };
  }
}

export async function fetchArtistProfile(artistName: string): Promise<ArtistProfile | null> {
  return (await fetchArtistProfileSnapshot(artistName)).value?.profile ?? null;
}

/**
 * Reads an artist's top tracks from Deezer, falling back to Last.fm, and looks
 * Last.fm tracks up on Deezer for their cover.
 *
 * @param artistName - The artist name sent to every source.
 * @returns The tracks, and whether every source and every cover lookup answered.
 */
export async function fetchArtistTopTracks(artistName: string): Promise<ArtistInfoFetch<ArtistTopTrack[]>> {
  try {
    const { values: partials, complete: sourcesComplete } = await settleSources(
      [
        ["deezer", sharedDeezerPartial(artistName)],
        ["lastfm", sharedLastFmPartial(artistName)],
      ],
      "artist_top_tracks_fetch",
    );
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);

    // Last.fm-fallback tracks have artworkUrl=null (Last.fm API does not
    // expose cover URLs). Try a per-track Deezer search to recover cover,
    // album, duration, and Deezer URL. Tracks that already have artwork
    // (Deezer source) and tracks with no Deezer match pass through unchanged.
    let enrichmentComplete = true;
    const enriched = await Promise.all(
      merged.topTracks.map(async (track) => {
        if (track.artworkUrl !== null) return track;
        try {
          const enrichment = await searchDeezerTrackForArtist(track.title, track.artists[0] ?? artistName);
          return enrichment ? { ...track, ...enrichment } : track;
        } catch (error) {
          enrichmentComplete = false;
          log.deviation(
            {
              component: "ArtistInfo",
              errorCode: "MC-API-0004",
              operation: "artist_top_track_cover_lookup",
              outcome: "track_without_cover",
              source: "deezer",
            },
            error,
          );
          return track;
        }
      }),
    );
    return { value: enriched, complete: sourcesComplete && enrichmentComplete };
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistTopTracks error:", err instanceof Error ? err.message : String(err));
    return { value: [], complete: false };
  }
}

// ─── Tour Dates (Bandsintown + Ticketmaster) ──────────────────────────────────

/**
 * Reads an artist's upcoming concerts from Bandsintown and Ticketmaster.
 *
 * @param artistName - The artist name sent to both sources.
 * @returns Up to five events by date, and whether both sources answered.
 */
export async function fetchArtistEvents(artistName: string): Promise<ArtistInfoFetch<ArtistEvent[]>> {
  const {
    values: [btEvents, tmEvents],
    complete,
  } = await settleSources(
    [
      ["bandsintown", fetchBandsintownEvents(artistName)],
      ["ticketmaster", fetchTicketmasterEvents(artistName)],
    ],
    "artist_events_fetch",
  );

  const seen = new Set<string>();
  const merged: ArtistEvent[] = [];

  for (const event of [...(btEvents ?? []), ...(tmEvents ?? [])]) {
    const key = `${event.date}:${event.city.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }

  return { value: merged.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5), complete };
}

/**
 * @throws {UpstreamUnavailableError} when Bandsintown did not answer.
 */
async function fetchBandsintownEvents(artistName: string): Promise<ArtistEvent[]> {
  const appId = process.env.BANDSINTOWN_APP_ID;
  if (!appId) return [];

  const res = await fetchWithTimeout(
    `${BANDSINTOWN_BASE}/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`,
    {},
    5000,
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new UpstreamUnavailableError("bandsintown", `events answered HTTP ${res.status}`);

  const events = (await res.json()) as BandsintownEvent[];
  if (!Array.isArray(events)) return [];

  return events
    .map((e): ArtistEvent | null => {
      const venue = e.venue;
      if (!venue || !venue.name || !venue.city || !venue.country) return null;
      return {
        date: e.datetime.slice(0, 10),
        venueName: venue.name,
        city: venue.city,
        country: venue.country,
        ticketUrl: e.offers?.find((o) => o.type === "Tickets")?.url ?? null,
        source: "bandsintown",
      };
    })
    .filter((e): e is ArtistEvent => e !== null);
}

/**
 * @throws {UpstreamUnavailableError} when Ticketmaster did not answer.
 */
async function fetchTicketmasterEvents(artistName: string): Promise<ArtistEvent[]> {
  const apiKey = process.env.TICKETMASTER_CONSUMER_KEY;
  if (!apiKey) return [];

  const res = await fetchWithTimeout(
    `${TICKETMASTER_BASE}/events.json?keyword=${encodeURIComponent(artistName)}&classificationName=music&apikey=${encodeURIComponent(apiKey)}&size=10&sort=date,asc`,
    {},
    5000,
  );
  if (res.status === 404) return [];
  if (!res.ok) throw new UpstreamUnavailableError("ticketmaster", `events answered HTTP ${res.status}`);

  const data = (await res.json()) as TicketmasterResponse;
  const events = data._embedded?.events ?? [];

  return events
    .map((e): ArtistEvent | null => {
      const venue = e._embedded?.venues?.[0];
      if (!venue || !venue.city?.name || !venue.country?.countryCode) return null;
      return {
        date: e.dates.start.localDate,
        venueName: venue.name,
        city: venue.city.name,
        country: venue.country.countryCode,
        ticketUrl: e.url ?? null,
        source: "ticketmaster",
      };
    })
    .filter((e): e is ArtistEvent => e !== null);
}
