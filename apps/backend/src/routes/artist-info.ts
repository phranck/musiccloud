import { type ArtistInfoResponse, ENDPOINTS, type SimilarArtistTrack } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { fetchArtistEvents, fetchArtistProfile, fetchArtistTopTracks } from "../services/artist-info.js";

// TTLs in milliseconds
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

    const artistName = rawName.toLowerCase(); // normalized cache key
    const region = (query.region ?? "").toUpperCase().slice(0, 2); // e.g. "DE"

    const repo = await getRepository();
    const cached = await repo.findArtistCache(artistName);
    const now = Date.now();

    let topTracks = cached?.topTracks ?? [];
    let profile = cached?.profile ?? null;
    let events = cached?.events ?? [];

    const needsTracks = !cached || now - cached.tracksUpdatedAt > TTL_TRACKS_MS;
    const needsProfile = !cached || now - cached.profileUpdatedAt > TTL_PROFILE_MS;
    const needsEvents = !cached || now - cached.eventsUpdatedAt > TTL_EVENTS_MS;

    // Fetch stale sections in parallel
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

    // Sort events: events in user's region first (if region provided)
    const sortedEvents = region
      ? [...events].sort((a, b) => {
          const aLocal = a.country.toUpperCase() === region ? -1 : 0;
          const bLocal = b.country.toUpperCase() === region ? -1 : 0;
          return aLocal - bLocal || a.date.localeCompare(b.date);
        })
      : events;

    // Enrich top tracks with shortIds from our own DB (not cached, always fresh)
    const enrichedTracks = await Promise.all(
      topTracks.map(async (track) => {
        const shortId = await repo.findShortIdByTrackUrl(track.deezerUrl);
        return { ...track, shortId };
      }),
    );

    // Fetch top track for each similar artist (max 3) in parallel
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
