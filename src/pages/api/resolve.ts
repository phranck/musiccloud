import type { APIRoute } from "astro";
import { resolveQuery, resolveTextSearchWithDisambiguation, resolveSelectedCandidate } from "../../services/resolver.js";
import type { ResolutionResult } from "../../services/resolver.js";
import { ResolveError, ERROR_STATUS_MAP, USER_MESSAGES } from "../../lib/errors.js";
import type { ErrorCode } from "../../lib/errors.js";
import { isUrl, stripTrackingParams } from "../../lib/url-parser.js";
import { db, sqlite, findExistingByIsrc } from "../../db/index.js";
import { tracks, serviceLinks, shortUrls } from "../../db/schema.js";
import { generateTrackId, generateShortId } from "../../lib/short-id.js";
import { apiRateLimiter } from "../../lib/rate-limiter.js";
import { log } from "../../lib/logger.js";

const ALLOWED_ORIGINS = ["http://localhost:4321", "http://localhost:4322", "https://music.cloud"];

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
      return persistAndRespond(result, origin);
    }

    // Flow 2: URL input - resolve directly
    if (isUrl(query!)) {
      const result = await resolveQuery(query!);
      return persistAndRespond(result, origin);
    }

    // Flow 3: Text search with disambiguation
    const textResult = await resolveTextSearchWithDisambiguation(query!);

    if (textResult.kind === "resolved" && textResult.result) {
      return persistAndRespond(textResult.result, origin);
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

function persistAndRespond(result: ResolutionResult, origin: string): Response {
  const sourceTrack = result.sourceTrack;
  const now = Date.now();

  // Wrap all DB read-then-write in a transaction to prevent race conditions
  const { trackId, shortId } = sqlite.transaction(() => {
    // ISRC deduplication: reuse existing track + short URL if same ISRC
    const existing = sourceTrack.isrc ? findExistingByIsrc(sourceTrack.isrc) : null;

    if (existing) {
      // Update service links (add new ones, skip existing via onConflictDoNothing)
      for (const link of result.links) {
        const cleanUrl = stripTrackingParams(link.url);
        db.insert(serviceLinks).values({
          id: generateTrackId(),
          trackId: existing.trackId,
          service: link.service,
          externalId: null,
          url: cleanUrl,
          confidence: link.confidence,
          matchMethod: link.matchMethod,
          createdAt: now,
        }).onConflictDoNothing().run();
      }

      return { trackId: existing.trackId, shortId: existing.shortId };
    }

    // New track: create fresh track + short URL
    const newTrackId = generateTrackId();
    const newShortId = generateShortId();

    db.insert(tracks).values({
      id: newTrackId,
      title: sourceTrack.title,
      artists: JSON.stringify(sourceTrack.artists),
      albumName: sourceTrack.albumName ?? null,
      isrc: sourceTrack.isrc ?? null,
      artworkUrl: sourceTrack.artworkUrl ?? null,
      durationMs: sourceTrack.durationMs ? Math.floor(sourceTrack.durationMs) : null,
      createdAt: now,
      updatedAt: now,
    }).run();

    for (const link of result.links) {
      const cleanUrl = stripTrackingParams(link.url);
      db.insert(serviceLinks).values({
        id: generateTrackId(),
        trackId: newTrackId,
        service: link.service,
        externalId: null,
        url: cleanUrl,
        confidence: link.confidence,
        matchMethod: link.matchMethod,
        createdAt: now,
      }).onConflictDoNothing().run();
    }

    db.insert(shortUrls).values({
      id: newShortId,
      trackId: newTrackId,
      createdAt: now,
    }).run();

    return { trackId: newTrackId, shortId: newShortId };
  })();

  const shortUrl = `${origin}/${shortId}`;

  return new Response(
    JSON.stringify({
      id: trackId,
      shortUrl,
      track: {
        title: sourceTrack.title,
        artists: sourceTrack.artists,
        albumName: sourceTrack.albumName,
        artworkUrl: sourceTrack.artworkUrl,
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
