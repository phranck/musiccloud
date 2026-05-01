/**
 * Artist Info service.
 *
 * Profile + top-tracks come from the generic artist-composition layer:
 * each source (Spotify, Deezer, Last.fm) returns a tagged Partial of a
 * canonical record, the merge strategy picks per-field winners, and a
 * trivial mapper translates the canonical record into the public
 * ArtistProfile shape. Spotify is one source among several — outage on
 * any single source no longer blanks the response.
 *
 * Tour dates (Bandsintown + Ticketmaster) keep their own pipeline; that
 * is a different data domain (event listings, not artist identity).
 */

import type { ArtistEvent, ArtistProfile, ArtistTopTrack } from "@musiccloud/shared";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
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

// ─── Profile + Top Tracks (generic composition) ──────────────────────────────

async function gatherArtistPartials(name: string): Promise<Array<ArtistPartial | null>> {
  return Promise.all([
    fetchSpotifyArtistPartial(name).catch(() => null),
    fetchDeezerArtistPartial(name).catch(() => null),
    fetchLastFmArtistPartial(name).catch(() => null),
  ]);
}

function mapCanonicalToArtistProfile(canonical: CanonicalArtist): ArtistProfile {
  return {
    imageUrl: canonical.imageUrl,
    genres: canonical.genres.slice(0, 3),
    popularity: canonical.popularity,
    followers: canonical.followers,
    bioSummary: canonical.bioSummary,
    scrobbles: canonical.scrobbles,
    similarArtists: canonical.similarArtists.slice(0, 3),
  };
}

export async function fetchArtistProfile(artistName: string): Promise<ArtistProfile | null> {
  try {
    const partials = await gatherArtistPartials(artistName);
    if (partials.every((p) => p === null)) return null;

    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);

    if (merged.imageUrl) {
      const source = pickSourceForField(partials, ARTIST_MERGE_STRATEGY, "imageUrl");
      if (source) {
        cacheArtistImage(artistName, merged.imageUrl, source).catch(() => {});
      }
    }

    return mapCanonicalToArtistProfile(merged);
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistProfile error:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function fetchArtistTopTracks(artistName: string): Promise<ArtistTopTrack[]> {
  try {
    const partials = await Promise.all([
      fetchDeezerArtistPartial(artistName).catch(() => null),
      fetchLastFmArtistPartial(artistName).catch(() => null),
    ]);
    const merged = mergeArtistPartials(partials, ARTIST_MERGE_STRATEGY, artistName);

    // Last.fm-fallback tracks have artworkUrl=null (Last.fm API does not
    // expose cover URLs). Try a per-track Deezer search to recover cover,
    // album, duration, and Deezer URL. Tracks that already have artwork
    // (Deezer source) and tracks with no Deezer match pass through unchanged.
    const enriched = await Promise.all(
      merged.topTracks.map(async (track) => {
        if (track.artworkUrl !== null) return track;
        const enrichment = await searchDeezerTrackForArtist(track.title, track.artists[0] ?? artistName);
        return enrichment ? { ...track, ...enrichment } : track;
      }),
    );
    return enriched;
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistTopTracks error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ─── Tour Dates (Bandsintown + Ticketmaster) ──────────────────────────────────

export async function fetchArtistEvents(artistName: string): Promise<ArtistEvent[]> {
  const [btEvents, tmEvents] = await Promise.all([
    fetchBandsintownEvents(artistName),
    fetchTicketmasterEvents(artistName),
  ]);

  const seen = new Set<string>();
  const merged: ArtistEvent[] = [];

  for (const event of [...btEvents, ...tmEvents]) {
    const key = `${event.date}:${event.city.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(event);
    }
  }

  return merged.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5);
}

async function fetchBandsintownEvents(artistName: string): Promise<ArtistEvent[]> {
  const appId = process.env.BANDSINTOWN_APP_ID;
  if (!appId) return [];

  try {
    const res = await fetchWithTimeout(
      `${BANDSINTOWN_BASE}/artists/${encodeURIComponent(artistName)}/events?app_id=${encodeURIComponent(appId)}&date=upcoming`,
      {},
      5000,
    );
    if (!res.ok) return [];

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
  } catch (err) {
    log.debug("ArtistInfo", "Bandsintown events error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

async function fetchTicketmasterEvents(artistName: string): Promise<ArtistEvent[]> {
  const apiKey = process.env.TICKETMASTER_CONSUMER_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetchWithTimeout(
      `${TICKETMASTER_BASE}/events.json?keyword=${encodeURIComponent(artistName)}&classificationName=music&apikey=${encodeURIComponent(apiKey)}&size=10&sort=date,asc`,
      {},
      5000,
    );
    if (!res.ok) return [];

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
  } catch (err) {
    log.debug("ArtistInfo", "Ticketmaster events error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}
