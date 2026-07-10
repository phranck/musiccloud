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
import { ROUTE_TEMPLATES, type SharePageResponse } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { resolveAppleMusicStorefrontFromHeaders } from "../lib/platform/apple-music-storefront.js";
import { toCachedApiLinks } from "../lib/server/api-links.js";
import { loadCcByShortId } from "../lib/server/cc-share-page.js";
import { loadAlbumByShortId, loadArtistByShortId, loadByShortId } from "../lib/server/share-page.js";
import { buildCodeSamples } from "../schemas/openapi-code-samples.js";
import { createAlbumIdentityKey } from "../services/album-identity.js";

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

      const { shortId } = request.params;

      const origin = request.headers["x-forwarded-host"] ? `https://${request.headers["x-forwarded-host"]}` : undefined;
      const appleMusicStorefront = resolveAppleMusicStorefrontFromHeaders(request.headers);

      // Short IDs are unique across all three entity tables, so we fire
      // every loader in parallel and pick whichever hits. This replaces a
      // serial waterfall (track → album → artist) that cost up to three
      // round-trips for artist-type IDs. Cost: up to two extra queries
      // that return null fast — cheap on indexed shortId lookups.
      const [trackData, albumData, artistData, ccData] = await Promise.all([
        loadByShortId(shortId, origin, appleMusicStorefront),
        loadAlbumByShortId(shortId, origin, appleMusicStorefront),
        loadArtistByShortId(shortId, origin, appleMusicStorefront),
        loadCcByShortId(shortId, origin),
      ]);

      if (trackData) {
        let vinylLayout = null;
        const albumName = trackData.track.albumName ?? undefined;
        if (albumName) {
          try {
            const identityKey = createAlbumIdentityKey({ artists: trackData.artists, title: albumName });
            if (identityKey) {
              const repo = await getRepository();
              const cached = await repo.findAlbumByVinylLayoutIdentity(identityKey);
              if (cached) vinylLayout = (await repo.readAlbumVinylLayout(cached.albumId)) ?? null;
            }
          } catch {
            // Layout metadata is optional enhancement for an otherwise valid share page.
          }
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
            vinylLayout: albumData.album.vinylLayout,
          },
          links: toCachedApiLinks(albumData.links),
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
          links: toCachedApiLinks(artistData.links),
          shortUrl: artistData.og.ogUrl,
        };

        reply.header("Cache-Control", "private, max-age=3600");
        return reply.send(response);
      }

      // CC entities carry no cross-service links; the loader already shapes the
      // full cc-* SharePageResponse, so it is sent verbatim.
      if (ccData) {
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
