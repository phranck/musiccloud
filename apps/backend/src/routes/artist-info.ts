/**
 * @file GET `/api/v1/artist-info?name=&region=` - aggregated artist card data.
 *
 * Registered unauthenticated in `server.ts`. Consumed by the artist card
 * React island on share pages and the artist detail pages.
 *
 * Upstream data (Deezer top tracks, Last.fm + Spotify profile, Bandsintown
 * + Ticketmaster events) is gathered in `services/artist-info.ts`; this
 * route is the caching and enrichment layer around it.
 *
 * ## Per-section TTLs
 *
 * The three data sections refresh on independent schedules because their
 * upstream sources change at very different rates:
 *
 * | Section     | TTL  | Rationale                                         |
 * | ----------- | ---- | ------------------------------------------------- |
 * | `topTracks` |  7 d | Chart positions move on weekly cycles             |
 * | `profile`   |  7 d | Bio / genres / similar-artist set is stable       |
 * | `events`    | 24 h | Tour dates can add, reschedule, or cancel daily   |
 *
 * Having one TTL per section means a daily event refresh does not burn
 * the Spotify / Last.fm rate budget that the weekly profile refresh sits
 * on. When any section is stale, only that section is refetched; the
 * fresh sections are reused from cache.
 *
 * ## Cache key normalization
 *
 * The artist name is lowercased for the cache key (`"Radiohead"` and
 * `"radiohead"` must hit the same entry). The untouched `rawName` is still
 * sent to the upstream APIs because some of them are case-sensitive in
 * search. `region` is uppercased and truncated to 2 chars to coerce free
 * user input (e.g. `"Germany"`, `"de"`) into a clean ISO country code.
 *
 * ## Region-local events first
 *
 * Events are sorted by a two-key comparator: primary key "matches user's
 * region" (local first), secondary key "date ascending". This surfaces
 * the concerts a user can actually attend without dropping faraway shows
 * from the list.
 *
 * ## Similar-artist top-track enrichment
 *
 * For each of the top 3 similar artists (UI cap) we fetch their top track
 * in parallel. Each lookup is wrapped in its own `try/catch` that returns
 * `{ track: null }` on failure, so one upstream hiccup cannot collapse the
 * whole response. The limit of 3 matches what the similar-artists carousel
 * renders.
 *
 * ## shortId enrichment (not cached)
 *
 * Every track (both `topTracks` and the similar-artists tracks) gets a
 * `shortId` attached when we can map its Deezer URL to one of our own
 * resolved tracks. This is deliberately NOT cached alongside the
 * Last.fm/Deezer payload: a user may have resolved the artist's track
 * after the cache entry was written, and the card should show the
 * short-link immediately once the resolve exists.
 */
import { type ArtistInfoResponse, ENDPOINTS, type SimilarArtistTrack } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { fetchArtistEvents, fetchArtistProfile, fetchArtistTopTracks } from "../services/artist-info.js";

const TTL_TRACKS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_PROFILE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_EVENTS_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function artistInfoRoutes(app: FastifyInstance) {
  app.get(ENDPOINTS.v1.artistInfo, async (request, reply) => {
    const query = request.query as { name?: string; region?: string };

    const rawName = query.name?.trim();
    if (!rawName) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "Query param 'name' is required." });
    }
    if (rawName.length > 200) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "'name' must be 200 characters or fewer." });
    }

    const artistName = rawName.toLowerCase();
    const region = (query.region ?? "").toUpperCase().slice(0, 2);

    const repo = await getRepository();
    const cached = await repo.findArtistCache(artistName);
    const now = Date.now();

    let topTracks = cached?.topTracks ?? [];
    let profile = cached?.profile ?? null;
    let events = cached?.events ?? [];

    const needsTracks = !cached || now - cached.tracksUpdatedAt > TTL_TRACKS_MS;
    const needsProfile = !cached || now - cached.profileUpdatedAt > TTL_PROFILE_MS;
    const needsEvents = !cached || now - cached.eventsUpdatedAt > TTL_EVENTS_MS;

    // Only the stale sections are refetched, and they run in parallel.
    // `saveArtistCache` takes a partial so each section writes
    // independently without clobbering the other two.
    const fetches: Promise<void>[] = [];

    if (needsTracks) {
      fetches.push(
        fetchArtistTopTracks(rawName).then(async (tracks) => {
          topTracks = tracks;
          await repo.saveArtistCache({ artistName, topTracks: tracks });
        }),
      );
    }

    if (needsProfile) {
      fetches.push(
        fetchArtistProfile(rawName).then(async (p) => {
          profile = p;
          await repo.saveArtistCache({ artistName, profile: p });
        }),
      );
    }

    if (needsEvents) {
      fetches.push(
        fetchArtistEvents(rawName).then(async (ev) => {
          events = ev;
          await repo.saveArtistCache({ artistName, events: ev });
        }),
      );
    }

    if (fetches.length > 0) {
      log.debug("ArtistInfo", `Fetching fresh data for "${rawName}" (region: ${region || "none"})`);
      await Promise.all(fetches);
    } else {
      log.debug("ArtistInfo", `Cache hit for "${rawName}"`);
    }

    // Two-key sort. `aLocal - bLocal` is the primary comparator: local
    // events get `-1`, remote stay `0`, so locals bubble to the top. The
    // `|| a.date.localeCompare(b.date)` tie-breaker then orders each
    // group by date ascending (ISO date strings sort correctly as text).
    const sortedEvents = region
      ? [...events].sort((a, b) => {
          const aLocal = a.country.toUpperCase() === region ? -1 : 0;
          const bLocal = b.country.toUpperCase() === region ? -1 : 0;
          return aLocal - bLocal || a.date.localeCompare(b.date);
        })
      : events;

    const enrichedTracks = await Promise.all(
      topTracks.map(async (track) => {
        const shortId = await repo.findShortIdByTrackUrl(track.deezerUrl);
        return { ...track, shortId };
      }),
    );

    const similarNames = (profile?.similarArtists ?? []).slice(0, 3);
    const similarArtistTracks: SimilarArtistTrack[] = await Promise.all(
      similarNames.map(async (name) => {
        try {
          const normalizedName = name.toLowerCase();
          const similarCached = await repo.findArtistCache(normalizedName);
          let tracks = similarCached?.topTracks ?? [];
          if (!similarCached || now - similarCached.tracksUpdatedAt > TTL_TRACKS_MS) {
            tracks = await fetchArtistTopTracks(name);
            await repo.saveArtistCache({ artistName: normalizedName, topTracks: tracks });
          }
          const topTrack = tracks[0] ?? null;
          if (topTrack) {
            const shortId = await repo.findShortIdByTrackUrl(topTrack.deezerUrl);
            return { artistName: name, track: { ...topTrack, shortId } };
          }
          return { artistName: name, track: null };
        } catch {
          return { artistName: name, track: null };
        }
      }),
    );

    const response: ArtistInfoResponse = {
      artistName: rawName,
      topTracks: enrichedTracks,
      profile,
      events: sortedEvents,
      similarArtistTracks,
    };

    return reply.send(response);
  });
}
