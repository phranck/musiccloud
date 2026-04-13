import type {
  ResolveDisambiguationResponse,
  ResolveErrorResponse,
  UnifiedResolveSuccessResponse,
} from "@musiccloud/shared";
import { ENDPOINTS, formatUserMessage, getErrorEntry } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { getRepository } from "../db/index.js";
import { log } from "../lib/infra/logger.js";
import { apiRateLimiter } from "../lib/infra/rate-limiter.js";
import { isAlbumUrl, isArtistUrl, isUrl, stripTrackingParams } from "../lib/platform/url.js";
import { isExpiredDeezerPreviewUrl } from "../lib/preview-url.js";
import { ResolveError } from "../lib/resolve/errors.js";
import { deezerAdapter } from "../services/adapters/deezer.js";
import type { AlbumResolutionResult } from "../services/album-resolver.js";
import { resolveAlbumUrl } from "../services/album-resolver.js";
import type { ArtistResolutionResult } from "../services/artist-resolver.js";
import { resolveArtistUrl } from "../services/artist-resolver.js";
import type { ResolutionResult } from "../services/resolver.js";
import {
  expandShortLink,
  resolveQuery,
  resolveSelectedCandidate,
  resolveTextSearchWithDisambiguation,
} from "../services/resolver.js";

const ALLOWED_ORIGINS = [
  "https://musiccloud.io",
  "http://localhost:3000",
  "http://localhost:4321",
  "http://localhost:4322",
];

export default async function resolveRoutes(app: FastifyInstance) {
  app.post(ENDPOINTS.v1.resolve, async (request, reply) => {
    // Rate limiting
    const clientIp = request.ip;
    if (apiRateLimiter.isLimited(clientIp)) {
      return reply.status(429).send(jsonError("RATE_LIMITED"));
    }

    // Parse body
    const body = request.body as { query?: string; selectedCandidate?: string } | null;
    if (!body) {
      return reply.status(400).send(jsonError("INVALID_URL", "Request body must be valid JSON with a 'query' field."));
    }

    const query = body.query?.trim();
    const selectedCandidate = body.selectedCandidate?.trim();

    if (!query && !selectedCandidate) {
      return reply.status(400).send(jsonError("INVALID_URL", "The 'query' or 'selectedCandidate' field is required."));
    }

    if (query && query.length > 500) {
      return reply.status(400).send(jsonError("INVALID_URL", "Query must be 500 characters or fewer."));
    }

    if (selectedCandidate && selectedCandidate.length > 200) {
      return reply.status(400).send(jsonError("INVALID_URL", "Invalid candidate selection."));
    }

    try {
      const origin = getOrigin(request.headers.origin);

      // Flow 1: User selected a candidate from disambiguation list (tracks only)
      if (selectedCandidate) {
        const result = await resolveSelectedCandidate(selectedCandidate);
        return reply.send(await persistTrackAndRespond(result, origin));
      }

      // Flow 2: URL input - expand short links first, then detect content type
      if (isUrl(query!)) {
        const expanded = await expandShortLink(stripTrackingParams(query!));
        const cleanUrl = stripTrackingParams(expanded);

        if (isAlbumUrl(cleanUrl)) {
          const result = await resolveAlbumUrl(cleanUrl);
          return reply.send(await persistAlbumAndRespond(result, origin));
        }
        if (isArtistUrl(cleanUrl)) {
          const result = await resolveArtistUrl(cleanUrl);
          return reply.send(await persistArtistAndRespond(result, origin));
        }
        const result = await resolveQuery(query!);
        return reply.send(await persistTrackAndRespond(result, origin));
      }

      // Flow 3: Text search with disambiguation (tracks only)
      const textResult = await resolveTextSearchWithDisambiguation(query!);

      if (textResult.kind === "resolved" && textResult.result) {
        return reply.send(await persistTrackAndRespond(textResult.result, origin));
      }

      // Return disambiguation candidates (no DB persistence yet)
      const disambiguationBody: ResolveDisambiguationResponse = {
        status: "disambiguation",
        candidates: textResult.candidates ?? [],
      };
      return reply.send(disambiguationBody);
    } catch (error) {
      if (error instanceof ResolveError) {
        return reply
          .status(getErrorEntry(error.code).httpStatus)
          .send(jsonError(error.code, error.message || undefined, error.context));
      }

      log.error("Resolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
      if (process.env.NODE_ENV !== "production" && error instanceof Error) {
        log.error("Resolve", "Stack:", error.stack);
      }
      return reply.status(500).send(jsonError("NETWORK_ERROR"));
    }
  });
}

function getOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}

/**
 * Build the on-wire error payload. `code` may be an MC code or a legacy code
 * — {@link getErrorEntry} resolves either; the response always carries the
 * canonical MC code and a user-facing message with the code appended as a
 * grep-friendly suffix.
 */
function jsonError(
  code: string,
  overrideMessage?: string,
  context?: Record<string, string | number>,
): ResolveErrorResponse {
  const entry = getErrorEntry(code);
  return {
    error: entry.code,
    message: formatUserMessage(entry.code, context, overrideMessage),
  };
}

async function persistTrackAndRespond(
  result: ResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  const { trackId, shortId } = await repo.persistTrackWithLinks({
    sourceTrack: {
      ...result.sourceTrack,
      sourceUrl: result.sourceTrack.webUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  // If the original input was a short link, save it as an alias for fast future lookups
  if (result.inputUrl) {
    try {
      await repo.addTrackUrlAlias(result.inputUrl, trackId);
    } catch {
      // Non-fatal – alias saving failure must not break the response
    }
  }

  // Refresh missing or expired Deezer preview URLs before returning the share
  // payload so clients do not receive dead signed preview links.
  let previewUrl = result.sourceTrack.previewUrl ?? undefined;
  if (
    (!previewUrl || isExpiredDeezerPreviewUrl(previewUrl)) &&
    result.sourceTrack.isrc &&
    deezerAdapter.isAvailable()
  ) {
    try {
      const deezerTrack = await deezerAdapter.findByIsrc(result.sourceTrack.isrc);
      if (deezerTrack?.previewUrl) {
        await repo.updatePreviewUrl(trackId, deezerTrack.previewUrl);
        previewUrl = deezerTrack.previewUrl;
      }
    } catch (err) {
      log.debug("Resolve", "Deezer preview enrichment failed:", err instanceof Error ? err.message : String(err));
    }
  }

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "track",
    id: trackId,
    shortUrl,
    track: {
      title: result.sourceTrack.title,
      artists: result.sourceTrack.artists,
      albumName: result.sourceTrack.albumName,
      artworkUrl: result.sourceTrack.artworkUrl,
      durationMs: result.sourceTrack.durationMs,
      isrc: result.sourceTrack.isrc,
      releaseDate: result.sourceTrack.releaseDate,
      isExplicit: result.sourceTrack.isExplicit,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}

async function persistAlbumAndRespond(
  result: AlbumResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  // Deezer preview fallback: if source has no topTrackPreviewUrl, use one from Deezer link
  let previewUrl = result.sourceAlbum.topTrackPreviewUrl;
  if (!previewUrl) {
    const deezerLink = result.links.find((l) => l.service === "deezer" && l.topTrackPreviewUrl);
    if (deezerLink?.topTrackPreviewUrl) previewUrl = deezerLink.topTrackPreviewUrl;
  }

  const { albumId, shortId } = await repo.persistAlbumWithLinks({
    sourceAlbum: {
      ...result.sourceAlbum,
      sourceUrl: result.sourceAlbum.webUrl,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "album",
    id: albumId,
    shortUrl,
    album: {
      title: result.sourceAlbum.title,
      artists: result.sourceAlbum.artists,
      releaseDate: result.sourceAlbum.releaseDate,
      totalTracks: result.sourceAlbum.totalTracks,
      artworkUrl: result.sourceAlbum.artworkUrl,
      label: result.sourceAlbum.label,
      upc: result.sourceAlbum.upc,
      previewUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}

async function persistArtistAndRespond(
  result: ArtistResolutionResult,
  origin: string,
): Promise<UnifiedResolveSuccessResponse> {
  const repo = await getRepository();

  const { artistId, shortId } = await repo.persistArtistWithLinks({
    sourceArtist: {
      ...result.sourceArtist,
      sourceUrl: result.sourceArtist.webUrl,
    },
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
      externalId: l.externalId,
    })),
  });

  const shortUrl = `${origin}/${shortId}`;

  return {
    type: "artist",
    id: artistId,
    shortUrl,
    artist: {
      name: result.sourceArtist.name,
      imageUrl: result.sourceArtist.imageUrl,
      genres: result.sourceArtist.genres,
    },
    links: result.links.map((l) => ({
      service: l.service,
      displayName: l.displayName,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  };
}
