/**
 * Artist Info service.
 *
 * Three data sources, all optional / gracefully degraded:
 *   1. Deezer public API   – top 3 tracks (with artwork)
 *   2. Spotify + Last.fm   – artist profile (genres, popularity, bio, scrobbles)
 *   3. Bandsintown + Ticketmaster – tour dates (merged + deduplicated)
 *
 * Every exported function returns empty data on error and never throws.
 */

import type { ArtistTopTrack, ArtistProfile, ArtistEvent } from "@musiccloud/shared";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { TokenManager } from "../lib/infra/token-manager.js";
import { log } from "../lib/infra/logger.js";

const DEEZER_BASE = "https://api.deezer.com";
const SPOTIFY_BASE = "https://api.spotify.com/v1";
const LASTFM_BASE = "https://ws.audioscrobbler.com/2.0";
const BANDSINTOWN_BASE = "https://rest.bandsintown.com";
const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

const spotifyToken = new TokenManager({
  serviceName: "Spotify",
  tokenUrl: "https://accounts.spotify.com/api/token",
  clientIdEnv: "SPOTIFY_CLIENT_ID",
  clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
});

// ─── Deezer Types ─────────────────────────────────────────────────────────────

interface DeezerArtistResult {
  id: number;
  name: string;
}
interface DeezerArtistSearch {
  data: DeezerArtistResult[];
}
interface DeezerTopTrack {
  title: string;
  duration: number; // seconds
  link: string;
  album: { title: string; cover_medium: string };
  artist: { name: string };
  contributors?: { name: string }[];
}
interface DeezerTopTracks {
  data: DeezerTopTrack[];
}

// ─── Spotify Types ────────────────────────────────────────────────────────────

interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}
interface SpotifyArtist {
  id: string;
  genres: string[];
  popularity: number;
  followers: { total: number };
  images: SpotifyImage[];
}
interface SpotifyArtistSearch {
  artists: { items: SpotifyArtist[] };
}

// ─── Last.fm Types ────────────────────────────────────────────────────────────

interface LastFmArtistInfo {
  artist?: {
    bio?: { summary?: string };
    stats?: { playcount?: string };
    similar?: { artist?: { name: string }[] };
  };
}

// ─── Bandsintown Types ────────────────────────────────────────────────────────

interface BandsintownEvent {
  datetime: string;
  venue: { name: string; city: string; country: string };
  offers?: { type: string; url: string }[];
}

// ─── Ticketmaster Types ───────────────────────────────────────────────────────

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * For collaboration names like "Sonic Gap & Panic Girl" or "Artist feat. Other",
 * returns only the primary (first) artist. Falls back to the original name if no
 * separator is found.
 */
function extractPrimaryArtist(name: string): string {
  const separators = [" & ", " feat. ", " feat ", " ft. ", " ft ", " x ", " X "];
  for (const sep of separators) {
    const idx = name.indexOf(sep);
    if (idx > 0) return name.slice(0, idx).trim();
  }
  return name;
}

async function deezerArtistTopTracks(artistName: string): Promise<ArtistTopTrack[]> {
  const searchRes = await fetchWithTimeout(
    `${DEEZER_BASE}/search/artist?q=${encodeURIComponent(artistName)}&limit=3`,
    {},
    5000,
  );
  if (!searchRes.ok) return [];

  const search = (await searchRes.json()) as DeezerArtistSearch;
  if (!search.data?.length) return [];

  const artistId = search.data[0].id;

  const topRes = await fetchWithTimeout(`${DEEZER_BASE}/artist/${artistId}/top?limit=3`, {}, 5000);
  if (!topRes.ok) return [];

  const top = (await topRes.json()) as DeezerTopTracks;
  return (top.data ?? []).map((t): ArtistTopTrack => ({
    title: t.title,
    artists: t.contributors?.length ? t.contributors.map((c) => c.name) : [t.artist.name],
    albumName: t.album.title ?? null,
    artworkUrl: t.album.cover_medium ?? null,
    durationMs: t.duration ? t.duration * 1000 : null,
    deezerUrl: t.link,
    shortId: null,
  }));
}

// ─── Popular Tracks (Deezer) ──────────────────────────────────────────────────

export async function fetchArtistTopTracks(artistName: string): Promise<ArtistTopTrack[]> {
  try {
    const tracks = await deezerArtistTopTracks(artistName);
    if (tracks.length > 0) return tracks;

    // Fallback: try primary artist for collaboration names (e.g. "A & B" → "A")
    const primary = extractPrimaryArtist(artistName);
    if (primary !== artistName) {
      return await deezerArtistTopTracks(primary);
    }
    return [];
  } catch (err) {
    log.debug("ArtistInfo", "fetchArtistTopTracks error:", err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ─── Artist Profile (Spotify + Last.fm) ──────────────────────────────────────

export async function fetchArtistProfile(artistName: string): Promise<ArtistProfile | null> {
  // Spotify part
  let spotifyArtist: SpotifyArtist | null = null;

  if (spotifyToken.isConfigured()) {
    try {
      const token = await spotifyToken.getAccessToken();
      const res = await fetchWithTimeout(
        `${SPOTIFY_BASE}/search?q=${encodeURIComponent(artistName)}&type=artist&limit=1`,
        { headers: { Authorization: `Bearer ${token}` } },
        5000,
      );
      if (res.ok) {
        const data = (await res.json()) as SpotifyArtistSearch;
        spotifyArtist = data.artists?.items?.[0] ?? null;
      }
    } catch (err) {
      log.debug("ArtistInfo", "Spotify artist lookup error:", err instanceof Error ? err.message : String(err));
    }
  }

  if (!spotifyArtist) return null;

  const imageUrl = pickSpotifyImage(spotifyArtist.images);

  const profile: ArtistProfile = {
    spotifyId: spotifyArtist.id,
    imageUrl,
    genres: spotifyArtist.genres.slice(0, 3),
    popularity: spotifyArtist.popularity,
    followers: spotifyArtist.followers.total,
    bioSummary: null,
    scrobbles: null,
    similarArtists: [],
  };

  // Last.fm enrichment: try full name first, fall back to primary artist for collabs
  const lastFmKey = process.env.LASTFM_API_KEY;
  if (lastFmKey) {
    const namesToTry = [artistName];
    const primary = extractPrimaryArtist(artistName);
    if (primary !== artistName) namesToTry.push(primary);

    for (const name of namesToTry) {
      try {
        const lfRes = await fetchWithTimeout(
          `${LASTFM_BASE}/?method=artist.getInfo&artist=${encodeURIComponent(name)}&api_key=${encodeURIComponent(lastFmKey)}&format=json`,
          {},
          5000,
        );
        if (!lfRes.ok) continue;

        const lfData = (await lfRes.json()) as LastFmArtistInfo;
        const artist = lfData.artist;

        if (artist) {
          profile.bioSummary = extractBioSummary(artist.bio?.summary ?? null);
          profile.scrobbles = artist.stats?.playcount ? parseInt(artist.stats.playcount, 10) : null;
          profile.similarArtists = (artist.similar?.artist ?? []).slice(0, 3).map((a) => a.name);
          break; // got data, stop trying
        }
      } catch (err) {
        log.debug("ArtistInfo", "Last.fm artist info error:", err instanceof Error ? err.message : String(err));
      }
    }
  }

  return profile;
}

function pickSpotifyImage(images: SpotifyImage[]): string | null {
  if (!images.length) return null;
  // Sort ascending by width, pick first that is ≥100px; fallback to smallest
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((img) => (img.width ?? 0) >= 100) ?? sorted[0])?.url ?? null;
}

function extractBioSummary(raw: string | null): string | null {
  if (!raw) return null;
  // Last.fm bio contains HTML + a "Read more on Last.fm" anchor at the end
  const stripped = raw
    .replace(/<a[^>]*>.*?<\/a>/gi, "") // remove anchors
    .replace(/<[^>]+>/g, "") // strip remaining tags
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return null;
  return stripped.length > 280 ? stripped.slice(0, 277) + "…" : stripped;
}

// ─── Tour Dates (Bandsintown + Ticketmaster) ──────────────────────────────────

export async function fetchArtistEvents(artistName: string): Promise<ArtistEvent[]> {
  const [btEvents, tmEvents] = await Promise.all([
    fetchBandsintownEvents(artistName),
    fetchTicketmasterEvents(artistName),
  ]);

  // Merge + deduplicate by (date + city)
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

    return events.map((e): ArtistEvent => ({
      date: e.datetime.slice(0, 10),
      venueName: e.venue.name,
      city: e.venue.city,
      country: e.venue.country,
      ticketUrl: e.offers?.find((o) => o.type === "Tickets")?.url ?? null,
      source: "bandsintown",
    }));
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
