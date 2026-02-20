import type { FastifyInstance } from "fastify";
import type { ArtistInfoResponse } from "@musiccloud/shared";
import { getRepository } from "../db/index.js";
import {
  fetchArtistTopTracks,
  fetchArtistProfile,
  fetchArtistEvents,
} from "../services/artist-info.js";
import { log } from "../lib/infra/logger.js";

// TTLs in milliseconds
const TTL_TRACKS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_PROFILE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_EVENTS_MS = 24 * 60 * 60 * 1000; // 24 hours

export default async function artistInfoRoutes(app: FastifyInstance) {
  app.get("/api/v1/artist-info", async (request, reply) => {
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
    const sortedEvents =
      region
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

    const response: ArtistInfoResponse = {
      artistName: rawName,
      topTracks: enrichedTracks,
      profile,
      events: sortedEvents,
    };

    return reply.send(response);
  });
}
