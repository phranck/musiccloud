import type { APIRoute } from "astro";
import { resolveQuery, resolveTextSearchWithDisambiguation, resolveSelectedCandidate } from "../../services/resolver.js";
import type { ResolutionResult } from "../../services/resolver.js";
import { ResolveError, ERROR_STATUS_MAP, USER_MESSAGES } from "../../lib/errors.js";
import type { ErrorCode } from "../../lib/errors.js";
import { isUrl, stripTrackingParams } from "../../lib/url-parser.js";
import { getRepository } from "../../db/index.js";
import { apiRateLimiter } from "../../lib/rate-limiter.js";
import { log } from "../../lib/logger.js";

const ALLOWED_ORIGINS = [
  "http://localhost:4321",
  "http://localhost:4322",
  "https://music.cloud",
  "https://music-cloud-three.vercel.app",
];

export const prerender = false;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limiting
  const clientIp = clientAddress ?? "unknown";
  if (apiRateLimiter.isLimited(clientIp)) {
    return jsonError("RATE_LIMITED", 429);
  }

  // Parse body
  let body: { query?: string; selectedCandidate?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("INVALID_URL", 400, "Request body must be valid JSON with a 'query' field.");
  }

  const query = body.query?.trim();
  const selectedCandidate = body.selectedCandidate?.trim();

  if (!query && !selectedCandidate) {
    return jsonError("INVALID_URL", 400, "The 'query' or 'selectedCandidate' field is required.");
  }

  try {
    // Validate origin against whitelist for short URL generation
    const requestOrigin = new URL(request.url).origin;
    const origin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];

    // Flow 1: User selected a candidate from disambiguation list
    if (selectedCandidate) {
      const result = await resolveSelectedCandidate(selectedCandidate);
      return await persistAndRespond(result, origin);
    }

    // Flow 2: URL input - resolve directly
    if (isUrl(query!)) {
      const result = await resolveQuery(query!);
      return await persistAndRespond(result, origin);
    }

    // Flow 3: Text search with disambiguation
    const textResult = await resolveTextSearchWithDisambiguation(query!);

    if (textResult.kind === "resolved" && textResult.result) {
      return await persistAndRespond(textResult.result, origin);
    }

    // Return disambiguation candidates (no DB persistence yet)
    return new Response(
      JSON.stringify({
        status: "disambiguation",
        candidates: textResult.candidates,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    if (error instanceof ResolveError) {
      const code = error.code as ErrorCode;
      const status = ERROR_STATUS_MAP[code] ?? 500;
      return jsonError(code, status, error.message);
    }

    log.error("Resolve", "Unexpected error:", error instanceof Error ? error.message : "Unknown error");
    if (import.meta.env.DEV && error instanceof Error) {
      log.error("Resolve", "Stack:", error.stack);
    }
    return jsonError("NETWORK_ERROR", 500);
  }
};

function jsonError(code: ErrorCode, status: number, customMessage?: string): Response {
  return new Response(
    JSON.stringify({
      error: code,
      message: customMessage ?? USER_MESSAGES[code] ?? "Something went wrong.",
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

async function persistAndRespond(result: ResolutionResult, origin: string): Promise<Response> {
  const repo = await getRepository();

  const { trackId, shortId } = await repo.persistTrackWithLinks({
    sourceTrack: result.sourceTrack,
    links: result.links.map((l) => ({
      service: l.service,
      url: stripTrackingParams(l.url),
      confidence: l.confidence,
      matchMethod: l.matchMethod,
    })),
  });

  const shortUrl = `${origin}/${shortId}`;

  return new Response(
    JSON.stringify({
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
      },
      links: result.links.map((l) => ({
        service: l.service,
        displayName: l.displayName,
        url: stripTrackingParams(l.url),
        confidence: l.confidence,
        matchMethod: l.matchMethod,
      })),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
