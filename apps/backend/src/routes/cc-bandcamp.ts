/**
 * @file GET `/api/v1/cc/bandcamp/:jamendoId` — whether a CC track is also on
 * Bandcamp, so the share page can offer a "Buy on Bandcamp" link.
 *
 * The Bandcamp fuzzy-search scrape takes seconds, so it must never run on the
 * resolve/share hot path. This dedicated endpoint resolves the track's artist +
 * title from Jamendo, searches Bandcamp via the existing adapter (confidence
 * ≥ 0.6), and returns `{ bandcampUrl }` when a confident match survives the
 * variant guard. The outcome — including a negative — is cached in-process so a
 * given track is scraped at most once per TTL, and a hard timeout bounds the
 * outgoing request so a slow scrape never hangs.
 */
import { ROUTE_TEMPLATES } from "@musiccloud/shared";
import type { FastifyInstance } from "fastify";
import { publicErrorResponse } from "../docs/public-response-schema.js";
import { log } from "../lib/infra/logger.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { apiRateLimiter, isInternalRequest } from "../lib/infra/rate-limiter.js";
import { getCcTrack } from "../services/cc/jamendo/client.js";
import { bandcampAdapter } from "../services/plugins/bandcamp/adapter.js";
import type { MatchResult } from "../services/types.js";

/**
 * TTL for the Bandcamp presence cache (negatives included). Bandcamp presence is
 * stable, so a long TTL keeps the scrape from re-running on every share open.
 */
const BANDCAMP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const bandcampCache = new Map<string, { url: string | null; expiresAt: number }>();

/** Hard cap on the outgoing Bandcamp search so a slow scrape never hangs the request. */
const BANDCAMP_SEARCH_TIMEOUT_MS = 8000;

/** Title markers that distinguish a remix/edit/feat from the original recording. */
const VARIANT_MARKERS = ["remix", "version", "edit", "feat"] as const;

/**
 * Guards against the adapter's title normalisation matching a remix/edit/feat
 * back onto the original: if the Jamendo title carries a variant marker the
 * Bandcamp hit's title lacks, the hit is a different track and is rejected.
 *
 * @param jamendoTitle - The full Jamendo track title (never cleaned).
 * @param bandcampTitle - The matched Bandcamp track title.
 * @returns True when the titles agree on every variant marker present in Jamendo's.
 */
function passesVariantGuard(jamendoTitle: string, bandcampTitle: string): boolean {
  const jamendo = jamendoTitle.toLowerCase();
  const bandcamp = bandcampTitle.toLowerCase();
  return !VARIANT_MARKERS.some((marker) => jamendo.includes(marker) && !bandcamp.includes(marker));
}

/**
 * Scrapes Bandcamp for the CC track and returns its Bandcamp URL, or null.
 *
 * Searches the FULL Jamendo title (never cleaned), so a remix only matches a
 * Bandcamp remix; the variant guard then drops any normalisation-induced match
 * onto the original. A timeout caps the outgoing scrape; failures resolve to null.
 *
 * @param jamendoId - The Jamendo track id.
 * @returns The Bandcamp track URL, or null when absent / unmatched / timed out.
 */
async function scrapeCcBandcampUrl(jamendoId: string): Promise<string | null> {
  const track = await getCcTrack(jamendoId);
  if (!track) return null;

  const timeout = new Promise<MatchResult>((resolve) => {
    setTimeout(() => resolve({ found: false, confidence: 0, matchMethod: "search" }), BANDCAMP_SEARCH_TIMEOUT_MS);
  });
  let match: MatchResult;
  try {
    match = await Promise.race([
      bandcampAdapter.searchTrack({ title: track.title, artist: track.artistName }),
      timeout,
    ]);
  } catch (err) {
    log.debug("CcBandcamp", "Search failed:", err instanceof Error ? err.message : String(err));
    return null;
  }

  if (!match.found || !match.track) return null;
  if (!passesVariantGuard(track.title, match.track.title)) {
    log.debug("CcBandcamp", `Variant guard rejected "${match.track.title}" for "${track.title}"`);
    return null;
  }
  return match.track.webUrl;
}

/**
 * Resolves whether a CC track is on Bandcamp, caching the outcome (including the
 * negative) so the scrape runs at most once per track per TTL.
 *
 * @param jamendoId - The Jamendo track id.
 * @returns The Bandcamp track URL, or null.
 */
async function resolveCcBandcampUrl(jamendoId: string): Promise<string | null> {
  const cached = bandcampCache.get(jamendoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const url = await scrapeCcBandcampUrl(jamendoId);
  bandcampCache.set(jamendoId, { url, expiresAt: Date.now() + BANDCAMP_CACHE_TTL_MS });
  return url;
}

/**
 * Registers the CC-Bandcamp presence route. Returns `{ bandcampUrl }` when the
 * track is on Bandcamp, otherwise `{}`.
 *
 * @param app - The Fastify instance to register on.
 */
export default async function ccBandcampRoutes(app: FastifyInstance) {
  app.get<{ Params: { jamendoId: string } }>(
    ROUTE_TEMPLATES.v1.ccBandcamp,
    {
      schema: {
        tags: ["CC"],
        summary: "Whether a CC track is also available on Bandcamp",
        description:
          "Fuzzy-searches Bandcamp for the CC track (full Jamendo title, confidence-scored ≥ 0.6). Returns { bandcampUrl } with the Bandcamp track URL when a confident match survives the variant guard, otherwise {}. Async + cached (incl. negative hits) so the share page loads it after the core card renders without paying the scrape on the hot path.",
        params: {
          type: "object",
          required: ["jamendoId"],
          properties: {
            jamendoId: { type: "string", minLength: 1, maxLength: 32, pattern: "^[0-9]+$" },
          },
          additionalProperties: false,
        },
        response: {
          200: {
            description: "Bandcamp availability for the Creative Commons track.",
            type: "object",
            additionalProperties: false,
            properties: {
              bandcampUrl: { type: "string", format: "uri" },
            },
          },
          400: publicErrorResponse("The Jamendo track id is malformed."),
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

      const { jamendoId } = request.params;
      const bandcampUrl = await resolveCcBandcampUrl(jamendoId);
      return reply.send(bandcampUrl ? { bandcampUrl } : {});
    },
  );
}
