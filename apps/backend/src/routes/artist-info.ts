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
 * | `profile`   | 183 d| Bio / genres / similar-artist set is stable       |
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
import { readEventLoopLagMs } from "../lib/infra/event-loop-lag.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { stripYouTubeTopicSuffix } from "../lib/youtube-topic.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { sanitizeArtistProfile } from "../services/artist-bio-sanitizer.js";
import { fetchArtistEvents, fetchArtistProfile, fetchArtistTopTracks } from "../services/artist-info.js";

const TTL_TRACKS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const TTL_PROFILE_DAYS = Math.round(365 / 2);
const TTL_PROFILE_MS = TTL_PROFILE_DAYS * 24 * 60 * 60 * 1000; // 183 days
const TTL_EVENTS_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Above this total handler time a structured `request.log.info` breadcrumb is
 * emitted segmenting where the time went (alias / cache read / upstream fetches
 * / enrichment) plus the recent event-loop lag. It fires only on the slow tail
 * (a few percent of requests) so prod log volume stays low while making the
 * cause of a multi-second spike attributable instead of invisible.
 */
const SLOW_PATH_LOG_THRESHOLD_MS = 1500;

export default async function artistInfoRoutes(app: FastifyInstance) {
  app.get(
    ENDPOINTS.v1.artistInfo,
    {
      schema: {
        tags: ["Artist"],
        summary: "Aggregated artist info (top tracks, profile, events)",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/artist-info",
          query: { name: "a-ha", region: "NO" },
        }),
        description:
          "Combines Deezer top tracks, Spotify/Last.fm profile, and Bandsintown/Ticketmaster tour dates into a single card payload. Sections refresh on independent TTLs. When `region` is set, matching events bubble to the top of the events list.",
        querystring: {
          type: "object",
          required: ["name"],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description:
                "Artist name (free text). Used both as the cache key (lowercased) and as the upstream search input.",
            },
            region: {
              type: "string",
              description:
                "ISO country code (2-letter, case-insensitive). When present, events in this country are sorted first.",
            },
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 32,
              description:
                "Optional musiccloud share short ID. Used only as lookup context for ambiguous artist names.",
            },
            artistEntityId: {
              type: "string",
              minLength: 1,
              maxLength: 80,
              description: "Optional normalized artist entity ID. Reserved for context-aware artist-info lookups.",
            },
            refresh: {
              type: "string",
              enum: ["profile"],
              description: "Explicitly refresh a stable cache section. Currently only `profile` is supported.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "Aggregated artist details: Deezer top tracks, Spotify/Last.fm profile (nullable when Spotify isn't configured), upcoming events, and optional similar-artist top tracks.",
            $ref: "ArtistInfo#",
          },
          400: { description: "Missing or empty `name` query parameter.", $ref: "ErrorResponse#" },
          429: {
            description: "Rate limit exceeded for this client IP (10 requests per 60 seconds).",
            $ref: "ErrorResponse#",
          },
        },
      },
    },
    async (request, reply) => {
      if (!isInternalRequest(request)) {
        const rateLimit = apiRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
      }

      const query = request.query as {
        name: string;
        region?: string;
        shortId?: string;
        artistEntityId?: string;
        refresh?: "profile";
      };

      // Strip the YouTube auto-channel "- Topic" suffix before any lookup
      // so cached rows written before the YouTube-adapter fix (which now
      // strips at resolve time) still produce clean cache keys and clean
      // upstream search queries. See `lib/youtube-topic.ts` for context.
      const rawName = stripYouTubeTopicSuffix(query.name.trim());
      if (!rawName) {
        return reply.status(400).send({ error: "INVALID_REQUEST", message: "Query param 'name' is required." });
      }

      const region = (query.region ?? "").toUpperCase().slice(0, 2);

      // Phase timing for the slow-path breadcrumb below. `now` (captured right
      // after the cache read) doubles as the after-cache mark.
      const startedAt = Date.now();
      const repo = await getRepository();
      const contextAlias = query.shortId ? await repo.findArtistInfoAliasByShortId(query.shortId, rawName) : null;
      const afterAliasAt = Date.now();
      const lookupName = contextAlias ?? rawName;
      const artistName = lookupName.toLowerCase();
      const cached = await repo.findArtistCache(artistName);
      const now = Date.now();

      let topTracks = cached?.topTracks ?? [];
      let profile = sanitizeArtistProfile(cached?.profile ?? null);
      let events = cached?.events ?? [];

      const needsTracks = !cached || now - cached.tracksUpdatedAt > TTL_TRACKS_MS;
      const needsProfile = query.refresh === "profile" || !cached || now - cached.profileUpdatedAt > TTL_PROFILE_MS;
      const needsEvents = !cached || now - cached.eventsUpdatedAt > TTL_EVENTS_MS;

      // Only the stale sections are refetched, and they run in parallel.
      // `saveArtistCache` takes a partial so each section writes
      // independently without clobbering the other two.
      const fetches: Promise<void>[] = [];

      if (needsTracks) {
        fetches.push(
          fetchArtistTopTracks(lookupName).then(async (tracks) => {
            topTracks = tracks;
            await repo.saveArtistCache({ artistName, topTracks: tracks });
          }),
        );
      }

      if (needsProfile) {
        fetches.push(
          fetchArtistProfile(lookupName).then(async (p) => {
            profile = sanitizeArtistProfile(p);
            await repo.saveArtistCache({ artistName, profile });
          }),
        );
      }

      if (needsEvents) {
        fetches.push(
          fetchArtistEvents(lookupName).then(async (ev) => {
            events = ev;
            await repo.saveArtistCache({ artistName, events: ev });
          }),
        );
      }

      if (fetches.length > 0) {
        log.debug("ArtistInfo", `Fetching fresh data for "${lookupName}" (region: ${region || "none"})`);
        await Promise.all(fetches);
      } else {
        log.debug("ArtistInfo", `Cache hit for "${lookupName}"`);
      }
      const afterFetchesAt = Date.now();

      // Defensive filter: cached entries written before the upstream-mapper
      // fixes (Bandsintown could emit events without venueName/city/country)
      // may still contain incomplete records. Drop them so the response
      // schema validation never trips on stale cache.
      const completeEvents = events.filter((e) => e?.date && e.venueName && e.city && e.country);

      // Two-key sort. `aLocal - bLocal` is the primary comparator: local
      // events get `-1`, remote stay `0`, so locals bubble to the top. The
      // `|| a.date.localeCompare(b.date)` tie-breaker then orders each
      // group by date ascending (ISO date strings sort correctly as text).
      const sortedEvents = region
        ? [...completeEvents].sort((a, b) => {
            const aLocal = a.country.toUpperCase() === region ? -1 : 0;
            const bLocal = b.country.toUpperCase() === region ? -1 : 0;
            return aLocal - bLocal || a.date.localeCompare(b.date);
          })
        : completeEvents;

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

      const afterEnrichAt = Date.now();

      const response: ArtistInfoResponse = {
        artistName: lookupName,
        topTracks: enrichedTracks,
        profile,
        events: sortedEvents,
        similarArtistTracks,
      };

      // Slow-path breadcrumb: only the multi-second tail is logged, segmented so
      // a spike is attributable to upstream refetch (`fetchesMs` + cold flags),
      // DB round-trips (`enrichMs`), or event-loop starvation (`eventLoopLagMaxMs`
      // high while the others are low) rather than being an opaque number.
      const totalMs = Date.now() - startedAt;
      if (totalMs > SLOW_PATH_LOG_THRESHOLD_MS) {
        const lag = readEventLoopLagMs();
        request.log.info(
          {
            artist: artistName,
            totalMs,
            aliasMs: afterAliasAt - startedAt,
            cacheReadMs: now - afterAliasAt,
            fetchesMs: afterFetchesAt - now,
            enrichMs: afterEnrichAt - afterFetchesAt,
            coldTracks: needsTracks,
            coldProfile: needsProfile,
            coldEvents: needsEvents,
            eventLoopLagMeanMs: Math.round(lag.mean),
            eventLoopLagMaxMs: Math.round(lag.max),
          },
          "artist-info slow path",
        );
      }

      return reply.send(response);
    },
  );
}
