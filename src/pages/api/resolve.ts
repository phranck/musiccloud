import type { APIRoute } from "astro";
import { resolveQuery, resolveTextSearchWithDisambiguation, resolveSelectedCandidate } from "../../services/resolver.js";
import type { ResolutionResult } from "../../services/resolver.js";
import { ResolveError, ERROR_STATUS_MAP, USER_MESSAGES } from "../../lib/errors.js";
import type { ErrorCode } from "../../lib/errors.js";
import { isUrl, stripTrackingParams } from "../../lib/url-parser.js";
import { db } from "../../db/index.js";
import { tracks, serviceLinks, shortUrls } from "../../db/schema.js";
import { generateTrackId, generateShortId } from "../../lib/short-id.js";
import { apiRateLimiter } from "../../lib/rate-limiter.js";

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
    // Get request origin for generating correct short URLs (localhost vs production)
    const origin = new URL(request.url).origin;

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

    console.error("Resolve failed:", error);
    if (error instanceof Error) {
      console.error("Error name:", error.name);
      console.error("Error message:", error.message);
      console.error("Stack:", error.stack);
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

  const trackId = generateTrackId();
  const shortId = generateShortId();
  const now = Date.now();

  const trackData = {
    id: trackId,
    title: sourceTrack.title,
    artists: JSON.stringify(sourceTrack.artists),
    albumName: sourceTrack.albumName ?? null,
    isrc: sourceTrack.isrc ?? null,
    artworkUrl: sourceTrack.artworkUrl ?? null,
    durationMs: sourceTrack.durationMs ? Math.floor(sourceTrack.durationMs) : null,
    createdAt: now,
    updatedAt: now,
  };
  console.log("[DB] Inserting track with fields:");
  for (const [key, value] of Object.entries(trackData)) {
    console.log(`  ${key}: ${JSON.stringify(value)} (${typeof value})`);
  }

  try {
    db.insert(tracks).values(trackData).run();
  } catch (err) {
    console.error("[DB] Insert tracks failed:", err);
    throw err;
  }

  // Store links with cleaned URLs (no tracking parameters)
  for (const link of result.links) {
    const cleanUrl = stripTrackingParams(link.url);
    db.insert(serviceLinks).values({
      id: generateTrackId(),
      trackId,
      service: link.service,
      externalId: "",
      url: cleanUrl,
      confidence: link.confidence,
      matchMethod: link.matchMethod,
      createdAt: now,
    }).onConflictDoNothing().run();
  }

  db.insert(shortUrls).values({
    id: shortId,
    trackId,
    createdAt: now,
  }).run();

  // Generate short URL with request origin (localhost for dev, production domain for prod)
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
