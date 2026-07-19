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
 * Legacy name lookups use a lowercased cache key (`"Radiohead"` and
 * `"radiohead"` must hit the same entry). Explicit normalized artist-entity
 * requests use an entity cache namespace instead, so identically named people
 * or groups cannot share enrichment data. The selected stored display name is
 * sent to upstream APIs. `region` is uppercased and truncated to 2 chars to
 * coerce free user input (e.g. `"Germany"`, `"de"`) into a clean ISO country
 * code.
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
 * For each of the top 5 similar artists (UI cap) we fetch their top track
 * in parallel. Each lookup is wrapped in its own `try/catch` that returns
 * `{ track: null }` on failure, so one upstream hiccup cannot collapse the
 * whole response. The limit of 5 supplies the shared card's four-and-a-half-row
 * viewport with a scroll cue.
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
import { createApiErrorResponse } from "../lib/infra/api-errors.js";
import { readEventLoopLagMs } from "../lib/infra/event-loop-lag.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { stripYouTubeTopicSuffix } from "../lib/youtube-topic.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { sanitizeArtistProfile } from "../services/artist-bio-sanitizer.js";
import { ArtistInfoSection, artistInfoRefreshCoordinator } from "../services/artist-info-cache.js";

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
          "Returns commercial artist details in one stable object: up to `5` top tracks, an assembled profile or `null`, up to `5` upcoming events, and up to `5` related-artist track lookups. Every top-level key is included; unavailable lists are empty. When `region` is supplied, matching events are sorted first.",
        querystring: {
          type: "object",
          anyOf: [{ required: ["name"] }, { required: ["artistEntityId"] }],
          properties: {
            name: {
              type: "string",
              minLength: 1,
              maxLength: 200,
              description:
                "Compatibility artist display name to look up when `artistEntityId` is not available. Leading and trailing whitespace is ignored, and a trailing YouTube auto-channel suffix ` - Topic` is removed before matching. Use the spelling returned in track or artist metadata when available.",
            },
            artistEntityId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
              description:
                "Normalized musiccloud artist entity ID from an `artistCredits[].artistEntityId` field in a successful track or album response. When supplied, this exact entity selects the persisted canonical artist name, its isolated enrichment cache, and the upstream lookup. It takes precedence over both `name` and `shortId`. Unknown entity IDs return `404`.",
            },
            region: {
              type: "string",
              description:
                "Country preference for event ordering. Supply a two-letter ISO `3166-1 alpha-2` code such as `NO`; matching is case-insensitive. Only the first two characters are used. Matching events are placed first and each group is ordered by `date`.\n\n**Default**: no country is prioritized and events remain in ascending date order.",
            },
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 32,
              description:
                "Optional musiccloud track share code. Take the last path segment of `shortUrl` from a successful track response from `POST /api/v1/resolve` or `GET /api/v1/resolve`. Without `artistEntityId`, a stored alternate artist can replace `name` for this lookup. With `artistEntityId`, this compatibility alias is ignored.\n\n**Default**: the supplied `name` is used directly, with no persisted-resolution context.",
            },
            refresh: {
              type: "string",
              enum: ["profile"],
              description:
                "Set to `profile` to fetch profile metadata again before responding, even when the stored profile snapshot is younger than `183` days. This does not force a refresh of top tracks or events: those sections are fetched again only when their stored snapshots are at least `7` days and `24` hours old, respectively.\n\n**Default**: profile metadata is fetched when no stored snapshot exists or its snapshot is at least `183` days old.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "`ArtistInfo` containing up to `5` selected top tracks, a nullable profile, up to `5` upcoming events, and related-artist track lookups.",
            $ref: "ArtistInfo#",
          },
          400: {
            description: "Missing or malformed artist identity query parameter.",
            $ref: "ErrorResponse#",
          },
          404: {
            description: "The supplied normalized artist entity does not exist or has no usable stored name.",
            $ref: "ErrorResponse#",
          },
          429: {
            description: "This client IP exceeded `10` requests in a rolling `60`-second window.",
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
      reply.header("Cache-Control", "private, max-age=60");

      const query = request.query as {
        name?: string;
        artistEntityId?: string;
        region?: string;
        shortId?: string;
        refresh?: "profile";
      };

      // Strip the YouTube auto-channel "- Topic" suffix before any lookup
      // so cached rows written before the YouTube-adapter fix (which now
      // strips at resolve time) still produce clean cache keys and clean
      // upstream search queries. See `lib/youtube-topic.ts` for context.
      const rawName = query.name ? stripYouTubeTopicSuffix(query.name.trim()) : "";
      const artistEntityId = query.artistEntityId?.trim();
      if (!rawName && !artistEntityId) {
        return reply.status(400).send(createApiErrorResponse("MC-REQ-0001"));
      }

      const region = (query.region ?? "").toUpperCase().slice(0, 2);

      // Phase timing for the slow-path breadcrumb below. `now` (captured right
      // after the cache read) doubles as the after-cache mark.
      const startedAt = Date.now();
      const repo = await getRepository();
      const entity = artistEntityId ? await repo.findArtistInfoEntity(artistEntityId) : null;
      if (artistEntityId && !entity) {
        return reply.status(404).send(createApiErrorResponse("MC-RES-0003"));
      }
      const contextAlias =
        !entity && query.shortId ? await repo.findArtistInfoAliasByShortId(query.shortId, rawName) : null;
      const afterAliasAt = Date.now();
      const lookupName = entity?.artistName ?? contextAlias ?? rawName;
      const cacheIdentity = entity
        ? { kind: "entity" as const, artistEntityId: entity.artistEntityId }
        : { kind: "name" as const, artistName: lookupName.toLowerCase() };
      const cached = await repo.findArtistCache(cacheIdentity);
      const now = Date.now();

      let topTracks = cached?.topTracks ?? [];
      let profile = sanitizeArtistProfile(cached?.profile ?? null);
      let events = cached?.events ?? [];
      const explicitProfileRefresh = query.refresh === "profile";
      const refreshInput = {
        repo,
        identity: cacheIdentity,
        artistName: lookupName,
        requestId: request.id,
        startedAt: now,
      };
      const hasTracks = Boolean(cached && cached.tracksUpdatedAt > 0);
      const hasProfile = Boolean(cached && cached.profileUpdatedAt > 0);
      const hasEvents = Boolean(cached && cached.eventsUpdatedAt > 0);
      const staleTracks = hasTracks && now - cached!.tracksUpdatedAt > TTL_TRACKS_MS;
      const staleProfile = hasProfile && now - cached!.profileUpdatedAt > TTL_PROFILE_MS;
      const staleEvents = hasEvents && now - cached!.eventsUpdatedAt > TTL_EVENTS_MS;
      const synchronousRefreshes: Promise<void>[] = [];

      if (explicitProfileRefresh || !hasProfile) {
        synchronousRefreshes.push(
          artistInfoRefreshCoordinator.refresh(ArtistInfoSection.Profile, refreshInput).then((value) => {
            profile = sanitizeArtistProfile(value as typeof profile);
          }),
        );
      } else if (staleProfile) {
        void artistInfoRefreshCoordinator.schedule(ArtistInfoSection.Profile, refreshInput);
      }

      if (!explicitProfileRefresh) {
        if (!hasTracks) {
          synchronousRefreshes.push(
            artistInfoRefreshCoordinator.refresh(ArtistInfoSection.TopTracks, refreshInput).then((value) => {
              topTracks = value as typeof topTracks;
            }),
          );
        } else if (staleTracks) {
          void artistInfoRefreshCoordinator.schedule(ArtistInfoSection.TopTracks, refreshInput);
        }

        if (!hasEvents) {
          synchronousRefreshes.push(
            artistInfoRefreshCoordinator.refresh(ArtistInfoSection.Events, refreshInput).then((value) => {
              events = value as typeof events;
            }),
          );
        } else if (staleEvents) {
          void artistInfoRefreshCoordinator.schedule(ArtistInfoSection.Events, refreshInput);
        }
      }

      if (synchronousRefreshes.length > 0) {
        log.debug("ArtistInfo", `Fetching required data for "${lookupName}" (region: ${region || "none"})`);
        await Promise.all(synchronousRefreshes);
      } else {
        log.debug("ArtistInfo", `Serving cached data for "${lookupName}"`);
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

      const similarNames = (profile?.similarArtists ?? []).slice(0, 5);
      const similarArtistTracks: SimilarArtistTrack[] = await Promise.all(
        similarNames.map(async (name) => {
          try {
            const normalizedName = name.toLowerCase();
            const similarCacheIdentity = { kind: "name" as const, artistName: normalizedName };
            const similarCached = await repo.findArtistCache(similarCacheIdentity);
            let tracks = similarCached?.topTracks ?? [];
            const hasSimilarTracks = Boolean(similarCached && similarCached.tracksUpdatedAt > 0);
            const staleSimilarTracks = hasSimilarTracks && now - similarCached!.tracksUpdatedAt > TTL_TRACKS_MS;
            const similarRefreshInput = {
              repo,
              identity: similarCacheIdentity,
              artistName: name,
              requestId: request.id,
              startedAt: now,
            };
            if (!explicitProfileRefresh && !hasSimilarTracks) {
              tracks = (await artistInfoRefreshCoordinator.refresh(
                ArtistInfoSection.TopTracks,
                similarRefreshInput,
              )) as typeof tracks;
            } else if (!explicitProfileRefresh && staleSimilarTracks) {
              void artistInfoRefreshCoordinator.schedule(ArtistInfoSection.TopTracks, similarRefreshInput);
            }
            const topTrack = tracks[0] ?? null;
            return { artistName: name, track: topTrack };
          } catch {
            return { artistName: name, track: null };
          }
        }),
      );

      const shortIdsByTrackUrl = await repo.findShortIdsByTrackUrls([
        ...topTracks.map((track) => track.deezerUrl),
        ...similarArtistTracks.flatMap((item) => (item.track ? [item.track.deezerUrl] : [])),
      ]);
      const enrichedTracks = topTracks.map((track) => ({
        ...track,
        shortId: shortIdsByTrackUrl.get(track.deezerUrl) ?? null,
      }));
      const enrichedSimilarArtistTracks = similarArtistTracks.map((item) => ({
        ...item,
        track: item.track ? { ...item.track, shortId: shortIdsByTrackUrl.get(item.track.deezerUrl) ?? null } : null,
      }));

      const afterEnrichAt = Date.now();

      const response: ArtistInfoResponse = {
        artistName: lookupName,
        topTracks: enrichedTracks,
        profile,
        events: sortedEvents,
        similarArtistTracks: enrichedSimilarArtistTracks,
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
            artist: lookupName,
            totalMs,
            aliasMs: afterAliasAt - startedAt,
            cacheReadMs: now - afterAliasAt,
            fetchesMs: afterFetchesAt - now,
            enrichMs: afterEnrichAt - afterFetchesAt,
            coldTracks: !hasTracks,
            coldProfile: !hasProfile,
            coldEvents: !hasEvents,
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
