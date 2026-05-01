/**
 * @file GET `/api/v1/share/:shortId` - share-page payload for SSR.
 *
 * Registered unauthenticated in `server.ts` because the Astro frontend
 * calls it during server-side rendering of every `/:shortId` page (the
 * user-facing share URL). The payload is shaped to feed the OG meta tags
 * on that page directly, so crawlers and message previews (iMessage,
 * Slack, Telegram) can render a rich preview without JavaScript.
 *
 * ## Three-tier lookup
 *
 * Short IDs live in a single namespace across three kinds of entity
 * (track, album, artist), so the handler tries each loader in turn and
 * returns the first hit. Order is track then album then artist, reflecting
 * observed frequency; changing the order is a pure performance tweak and
 * cannot change correctness as long as short IDs stay unique across the
 * three tables. A 404 means the ID does not exist in ANY of the three.
 *
 * ## Origin detection
 *
 * `x-forwarded-host` is read to reconstruct the user-facing origin when
 * the backend runs behind an ingress (Zerops). Without this, the OG URLs
 * embedded in the response would point at the internal backend host the
 * crawler can never reach. The header is not whitelisted here because
 * this endpoint is internal to our own frontend call path: trusting the
 * header is acceptable at the trust boundary the ingress already enforces.
 * Local dev leaves `origin` undefined and lets the loader fall back to
 * its own default.
 *
 * ## Hardcoded `confidence: 1`, `matchMethod: "cache"`
 *
 * These fields are required by `SharePageResponse` but meaningless on a
 * cache read: the links were already scored during the original resolve,
 * and a share page has no per-link confidence to show. They are set to
 * the sentinel values the schema treats as "trusted cache entry".
 */
import { ROUTE_TEMPLATES, type SharePageResponse } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { loadAlbumByShortId, loadArtistByShortId, loadByShortId } from "../lib/server/share-page.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";

export default async function shareRoutes(app: FastifyInstance) {
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
          "Returns the unified share-page payload for the given short ID. Looks up tracks, albums, and artists in a single namespace and returns the first match. Feeds SSR and OG meta tags on the frontend share page.",
        params: {
          type: "object",
          required: ["shortId"],
          properties: {
            shortId: {
              type: "string",
              minLength: 1,
              maxLength: 64,
              pattern: "^[A-Za-z0-9_-]+$",
              description: "Short ID minted by a previous resolve call.",
            },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description:
              "Type-discriminated share payload (track / album / artist) with OG meta, details, per-service links, and short URL.",
            $ref: "SharePage#",
          },
          400: {
            description: "`shortId` failed validation (empty, too long, or contains disallowed characters).",
            $ref: "ErrorResponse#",
          },
          404: {
            description: "No track, album, or artist exists for this short ID.",
            $ref: "ErrorResponse#",
          },
          429: { description: "Rate limit exceeded for this client IP (10/min).", $ref: "ErrorResponse#" },
        },
      },
    },
    async (request, reply) => {
      if (!isInternalRequest(request) && apiRateLimiter.isLimited(request.ip)) {
        return reply.status(429).send({
          error: "RATE_LIMITED",
          message: "Rate limit exceeded. Please try again in a minute.",
        });
      }

      const { shortId } = request.params;

      const origin = request.headers["x-forwarded-host"] ? `https://${request.headers["x-forwarded-host"]}` : undefined;

      // Short IDs are unique across all three entity tables, so we fire
      // every loader in parallel and pick whichever hits. This replaces a
      // serial waterfall (track → album → artist) that cost up to three
      // round-trips for artist-type IDs. Cost: up to two extra queries
      // that return null fast — cheap on indexed shortId lookups.
      const [trackData, albumData, artistData] = await Promise.all([
        loadByShortId(shortId, origin),
        loadAlbumByShortId(shortId, origin),
        loadArtistByShortId(shortId, origin),
      ]);

      if (trackData) {
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
            albumName: trackData.track.albumName ?? undefined,
            artworkUrl: trackData.track.artworkUrl ?? undefined,
            durationMs: trackData.track.durationMs ?? undefined,
            isrc: trackData.track.isrc ?? undefined,
            releaseDate: trackData.track.releaseDate ?? undefined,
            isExplicit: trackData.track.isExplicit ?? undefined,
            previewUrl: trackData.track.previewUrl ?? undefined,
            previewRefreshable: trackData.previewRefreshable || undefined,
          },
          links: trackData.links.map((l) => ({
            service: l.service,
            displayName: l.service,
            url: l.url,
            confidence: 1,
            matchMethod: "cache" as const,
          })),
          shortUrl: trackData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      if (albumData) {
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
            releaseDate: albumData.album.releaseDate ?? undefined,
            totalTracks: albumData.album.totalTracks ?? undefined,
            artworkUrl: albumData.album.artworkUrl ?? undefined,
            label: albumData.album.label ?? undefined,
            upc: albumData.album.upc ?? undefined,
            previewUrl: albumData.album.previewUrl ?? undefined,
          },
          links: albumData.links.map((l) => ({
            service: l.service,
            displayName: l.service,
            url: l.url,
            confidence: 1,
            matchMethod: "cache" as const,
          })),
          shortUrl: albumData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      if (artistData) {
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
          links: artistData.links.map((l) => ({
            service: l.service,
            displayName: l.service,
            url: l.url,
            confidence: 1,
            matchMethod: "cache" as const,
          })),
          shortUrl: artistData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      return reply.status(404).send({
        error: "TRACK_NOT_FOUND",
        message: "No track, album, or artist found for this short ID.",
      });
    },
  );
}
