/**
 * @file GET `/api/v1/share/:shortId` - share-page payload for SSR.
 *
 * Registered unauthenticated in `server.ts` because the Astro frontend
 * calls it during server-side rendering of every `/:shortId` page (the
 * user-facing share URL). The payload is shaped to feed the OG meta tags
 * on that page directly, so crawlers and message previews (iMessage,
 * Slack, Telegram) can render a rich preview without JavaScript.
 *
 * ## Four-way lookup
 *
 * Short IDs live in a single namespace across commercial tracks, albums and
 * artists plus the Creative Commons entities, so the handler runs all four
 * loaders at once and takes whichever hits. Uniqueness of the short id across
 * those tables is what makes that safe: at most one loader can answer. A 404
 * means the id exists in none of them.
 *
 * ## Origin detection
 *
 * The OG and share URLs are built on `getPublicOrigin()`, which reads
 * `PUBLIC_URL` from the environment. A share URL always lives on the public
 * site, whichever host answered the request, so the value follows from
 * configuration rather than from the request.
 *
 * It must not come from `X-Forwarded-Host`. This route is registered
 * unauthenticated and is part of the documented public API, so that header is
 * attacker input. It is also the wrong value: the ingress sets it to the host
 * actually addressed, which for a direct API call is `api.musiccloud.io`
 * rather than the public site.
 *
 * ## Apple Music storefront guard
 *
 * Apple Music catalogue links are storefront-scoped. A cached `/us/` URL can
 * be valid for a US Apple Music account but fail in the native app for an AT
 * account. The loaders receive the request storefront and omit Apple Music
 * links whose URL storefront does not match. Other cached service links remain
 * globally renderable.
 *
 * ## Cached API links
 *
 * `toCachedApiLinks` hydrates public labels from shared platform metadata
 * and sets `confidence: 1`, `matchMethod: "cache"`. Original resolver match
 * metadata is meaningful for fresh resolves, not for a trusted cache read.
 */
import {
  CORRELATION_ID_HEADER,
  CORRELATION_ID_MAX_LENGTH,
  CORRELATION_ID_PATTERN,
  ROUTE_TEMPLATES,
  type SharePageResponse,
} from "@musiccloud/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getRepository } from "../db/index.js";
import { shareCodeSchema } from "../docs/public-response-schema.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { resolveAppleMusicStorefrontFromHeaders } from "../lib/platform/apple-music-storefront.js";
import { getPublicOrigin } from "../lib/public-origin.js";
import { toCachedApiLinks } from "../lib/server/api-links.js";
import { loadCcByShortId } from "../lib/server/cc-share-page.js";
import { loadAlbumByShortId, loadArtistByShortId, loadByShortId } from "../lib/server/share-page.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { readCachedAlbumVinylLayout } from "../services/track-vinyl-layout.js";

type ShareEntity = "track" | "album" | "artist" | "cc";

interface ShareRequestTiming {
  startedAt: number;
  correlationId?: string;
  resultType: SharePageResponse["type"] | "none" | "error";
  entityLoadMs: Partial<Record<ShareEntity, number>>;
  optionalWorkMs?: number;
}

const shareRequestTimings = new WeakMap<FastifyRequest, ShareRequestTiming>();

function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export default async function shareRoutes(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    shareRequestTimings.set(request, {
      startedAt: performance.now(),
      resultType: "none",
      entityLoadMs: {},
    });
  });

  app.addHook("onResponse", async (request, reply) => {
    const timing = shareRequestTimings.get(request);
    if (!timing) return;
    request.log.info(
      {
        component: "Share",
        operation: "share_request",
        requestId: request.id,
        correlationId: timing.correlationId,
        resultType: reply.statusCode >= 500 && timing.resultType === "none" ? "error" : timing.resultType,
        statusCode: reply.statusCode,
        route: request.routeOptions.url ?? ROUTE_TEMPLATES.v1.share,
        shortId: (request.params as { shortId: string }).shortId,
        entityLoadMs: timing.entityLoadMs,
        optionalWorkMs: timing.optionalWorkMs ?? 0,
        totalMs: elapsedMs(timing.startedAt),
      },
      "Share request timing",
    );
    shareRequestTimings.delete(request);
  });

  app.get<{ Params: { shortId: string } }>(
    ROUTE_TEMPLATES.v1.share,
    {
      schema: {
        tags: ["Share"],
        summary: "Fetch a previously-resolved share",
        "x-codeSamples": buildCodeSamples({
          method: "GET",
          path: "/api/v1/share/aBc123x",
        }),
        description:
          "Returns one of six exact share variants selected by `type`: commercial `track`, `album`, or `artist`, and Creative Commons `cc-track`, `cc-album`, or `cc-artist`. Commercial variants contain the matching entity plus `links`. `cc-track` contains only `track`, `og`, and `shortUrl`; `cc-album` and `cc-artist` additionally contain `artistInfo`. Creative Commons variants never contain `links`. Read `type` before accessing the variant-specific entity key.",
        params: {
          type: "object",
          required: ["shortId"],
          properties: {
            shortId: shareCodeSchema(
              "Public musiccloud share code: take the last path segment of `shortUrl` from a successful `POST /api/v1/resolve`, `GET /api/v1/resolve`, or `POST /api/v1/cc/resolve` response.",
            ),
          },
          additionalProperties: false,
        },
        headers: {
          type: "object",
          properties: {
            [CORRELATION_ID_HEADER]: {
              type: "string",
              maxLength: CORRELATION_ID_MAX_LENGTH,
              pattern: CORRELATION_ID_PATTERN.source,
              description: "Optional opaque token used only to correlate frontend and backend timing logs.",
            },
          },
        },
        response: {
          200: {
            description:
              "`SharePage`, discriminated by `type` into the exact commercial or Creative-Commons resource shape.",
            headers: {
              "Cache-Control": {
                type: "string",
                description:
                  "`private, max-age=3600` for every variant. A share is served from persisted data, so it does not change between two reads of the same code.",
              },
            },
            $ref: "SharePage#",
          },
          400: {
            description:
              "`shortId` or the optional correlation header failed validation (empty, too long, or contains disallowed characters).",
            $ref: "ErrorResponse#",
          },
          404: {
            description: "No commercial or Creative-Commons track, album, or artist exists for this share code.",
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
      const timing = shareRequestTimings.get(request)!;
      const correlationHeader = request.headers[CORRELATION_ID_HEADER];
      timing.correlationId = typeof correlationHeader === "string" ? correlationHeader : undefined;

      if (!isInternalRequest(request)) {
        const rateLimit = apiRateLimiter.check(request.ip);
        if (rateLimit.limited) {
          return sendRateLimitError(reply, rateLimit);
        }
      }

      const { shortId } = request.params;

      const origin = getPublicOrigin();
      const appleMusicStorefront = resolveAppleMusicStorefrontFromHeaders(request.headers);

      // Short IDs are unique across all three entity tables, so we fire
      // every loader in parallel and pick whichever hits. This replaces a
      // serial waterfall (track → album → artist) that cost up to three
      // round-trips for artist-type IDs. Cost: up to two extra queries
      // that return null fast — cheap on indexed shortId lookups.
      const timeEntity = async <T>(entity: ShareEntity, load: () => Promise<T>): Promise<T> => {
        const startedAt = performance.now();
        try {
          return await load();
        } finally {
          timing.entityLoadMs[entity] = elapsedMs(startedAt);
        }
      };
      const [trackResult, albumResult, artistResult, ccResult] = await Promise.allSettled([
        timeEntity("track", () => loadByShortId(shortId, origin, appleMusicStorefront)),
        timeEntity("album", () => loadAlbumByShortId(shortId, origin, appleMusicStorefront)),
        timeEntity("artist", () => loadArtistByShortId(shortId, origin, appleMusicStorefront)),
        timeEntity("cc", () => loadCcByShortId(shortId, origin)),
      ]);
      const unwrap = <T>(result: PromiseSettledResult<T>): T => {
        if (result.status === "rejected") throw result.reason;
        return result.value;
      };
      const trackData = unwrap(trackResult);
      const albumData = unwrap(albumResult);
      const artistData = unwrap(artistResult);
      const ccData = unwrap(ccResult);

      if (trackData) {
        timing.resultType = "track";
        let vinylLayout = null;
        const albumName = trackData.track.albumName ?? undefined;
        const optionalStartedAt = performance.now();
        try {
          if (albumName) {
            try {
              vinylLayout = await readCachedAlbumVinylLayout(await getRepository(), {
                artists: trackData.artists,
                title: albumName,
              });
            } catch (error) {
              // Layout metadata is optional enhancement for an otherwise valid share page,
              // but the deviation remains correlated with this request in production logs.
              request.log.warn(
                {
                  err: error,
                  errorCode: "MC-SYS-0001",
                  operation: "share_vinyl_layout_read",
                  outcome: "layout_omitted",
                  shortId,
                },
                "optional share vinyl layout failed",
              );
            }
          }
        } finally {
          timing.optionalWorkMs = elapsedMs(optionalStartedAt);
        }
        const response: SharePageResponse = {
          type: "track",
          og: {
            title: trackData.og.ogTitle,
            description: trackData.og.ogDescription,
            image: trackData.og.ogImageUrl,
            url: trackData.og.ogUrl,
          },
          track: {
            title: trackData.track.title,
            artists: trackData.artists,
            artistCredits: trackData.artistCredits,
            albumName: trackData.track.albumName ?? undefined,
            artworkUrl: trackData.track.artworkUrl ?? undefined,
            durationMs: trackData.track.durationMs ?? undefined,
            isrc: trackData.track.isrc ?? undefined,
            releaseDate: trackData.track.releaseDate ?? undefined,
            isExplicit: trackData.track.isExplicit ?? undefined,
            previewUrl: trackData.track.previewUrl ?? undefined,
            previewRefreshable: trackData.previewRefreshable || undefined,
            vinylLayout,
          },
          links: toCachedApiLinks(trackData.links),
          shortUrl: trackData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      if (albumData) {
        timing.resultType = "album";
        const response: SharePageResponse = {
          type: "album",
          og: {
            title: albumData.og.ogTitle,
            description: albumData.og.ogDescription,
            image: albumData.og.ogImageUrl,
            url: albumData.og.ogUrl,
          },
          album: {
            title: albumData.album.title,
            artists: albumData.artists,
            artistCredits: albumData.artistCredits,
            releaseDate: albumData.album.releaseDate ?? undefined,
            totalTracks: albumData.album.totalTracks ?? undefined,
            artworkUrl: albumData.album.artworkUrl ?? undefined,
            label: albumData.album.label ?? undefined,
            upc: albumData.album.upc ?? undefined,
            previewUrl: albumData.album.previewUrl ?? undefined,
            previewRefreshable: albumData.previewRefreshable || undefined,
            vinylLayout: albumData.album.vinylLayout,
          },
          links: toCachedApiLinks(albumData.links),
          shortUrl: albumData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      if (artistData) {
        timing.resultType = "artist";
        const response: SharePageResponse = {
          type: "artist",
          og: {
            title: artistData.og.ogTitle,
            description: artistData.og.ogDescription,
            image: artistData.og.ogImageUrl,
            url: artistData.og.ogUrl,
          },
          artist: {
            name: artistData.artist.name,
            imageUrl: artistData.artist.imageUrl ?? undefined,
            genres: artistData.artist.genres,
          },
          links: toCachedApiLinks(artistData.links),
          shortUrl: artistData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      // CC entities carry no cross-service links; the loader already shapes the
      // full cc-* SharePageResponse, so it is sent verbatim. Every CC variant
      // answers from persisted data, so it caches like the commercial ones.
      if (ccData) {
        timing.resultType = ccData.type;
        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(ccData);
      }

      return reply.status(404).send({
        error: "TRACK_NOT_FOUND",
        message: "No track, album, artist, or CC entity found for this short ID.",
      });
    },
  );
}
