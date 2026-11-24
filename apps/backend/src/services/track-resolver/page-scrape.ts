/**
 * @file The OG metadata escape hatch of the URL pipeline: reads title, artist
 * and image from a music service page when that service's adapter has no
 * credentials, then resolves the result as an ordinary search.
 *
 * Page metadata enters ordinary matching and image policy rather than
 * bypassing either boundary.
 */
import { PLATFORM_CONFIG } from "@musiccloud/shared";
import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";
import { ResolveError } from "../../lib/resolve/errors.js";
import { pickRecordingArtworkUrl } from "../artwork.js";
import { getActiveAdapters } from "../index.js";
import type { NormalizedTrack, ServiceAdapter, ServiceId } from "../types.js";
import { fillMissingServices, tryCache } from "./cache.js";
import { completeFreshResolution } from "./completion.js";
import { resolveAcrossServices, resolvedTrackLink } from "./fan-out.js";
import type { ResolutionResult, ResolvedLink } from "./types.js";

/**
 * How long, in milliseconds, the page fetch of {@link scrapeTrackFromPage}
 * waits before it gives up and the scrape counts as failed. Eight seconds.
 */
const PAGE_SCRAPE_TIMEOUT_MS = 8000;

/**
 * Confidence of the link a scrape-resolved URL came in on. It stays below
 * `IDENTIFIER_MATCH_CONFIDENCE` (`1`), because the page metadata was matched
 * by text search rather than read through the service's own API. `0.9`.
 */
const SCRAPED_SOURCE_LINK_CONFIDENCE = 0.9;

/**
 * Scrape OG meta tags from a music service page to extract title and artist.
 * Used as fallback when the source adapter has no API credentials.
 *
 * Supports formats:
 *   - English: "Title by Artist on Service"
 *   - German: "„Title" von Artist bei Service"
 *   - French: "Title par Artist sur Service"
 *   - Generic fallback: split on common separators
 *
 * @param url - The music service page.
 * @returns Title, artist and page image, or null when the page offers none.
 */
async function scrapeTrackFromPage(
  url: string,
): Promise<{ title: string; artist: string; artworkUrl?: string } | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          // Bot UA gets server-rendered OG tags (SPA shells don't include them)
          "User-Agent": "facebookexternalhit/1.1",
        },
        redirect: "follow",
      },
      PAGE_SCRAPE_TIMEOUT_MS,
    );

    if (!response.ok) return null;

    const html = await response.text();

    // Extract og:title
    const ogTitleMatch = /<meta\s+property="og:title"\s+content="([^"]*)"/i.exec(html);
    if (!ogTitleMatch?.[1]) return null;

    const ogTitle = ogTitleMatch[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/\u201E|\u201C|\u201D/g, ""); // Remove „ " " quotes

    // Extract og:image for artwork
    const ogImageMatch = /<meta\s+property="og:image"\s+content="([^"]*)"/i.exec(html);
    const artworkUrl = ogImageMatch?.[1] || undefined;

    // Try locale-aware patterns: "Title by Artist on Service", "Title von Artist bei Service"
    const patterns = [
      /^(.+?)\s+by\s+(.+?)\s+on\s+.+$/i, // English
      /^(.+?)\s+von\s+(.+?)\s+bei\s+.+$/i, // German
      /^(.+?)\s+par\s+(.+?)\s+sur\s+.+$/i, // French
      /^(.+?)\s+di\s+(.+?)\s+su\s+.+$/i, // Italian
      /^(.+?)\s+de\s+(.+?)\s+en\s+.+$/i, // Spanish
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(ogTitle);
      if (match?.[1] && match?.[2]) {
        return { title: match[1].trim(), artist: match[2].trim(), artworkUrl };
      }
    }

    // Fallback: use og:title as free-text query (strip " on/bei/sur ServiceName")
    const stripped = ogTitle
      .replace(
        /\s+(on|bei|sur|su|en)\s+(Apple Music|Spotify|Deezer|Tidal|YouTube|SoundCloud|Qobuz|Pandora|Audius).*$/i,
        "",
      )
      .trim();

    if (stripped && stripped !== ogTitle) {
      // "Title - Artist" or "Title by Artist" without service suffix. The class
      // matches a hyphen, an en dash (U+2013) and an em dash (U+2014).
      const dashSplit = stripped.split(/\s+[-\u2013\u2014]\s+/);
      if (dashSplit.length >= 2) {
        return { title: dashSplit[0].trim(), artist: dashSplit[1].trim(), artworkUrl };
      }
    }

    // Last resort: use the cleaned title as both title and artist (free-text search)
    if (stripped && !stripped.toLowerCase().includes("web player")) {
      return { title: stripped, artist: stripped, artworkUrl };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fallback resolver for URLs where the source adapter has no API credentials.
 * Scrapes the page for OG metadata, then does a cross-service text search.
 *
 * @param url - The canonical URL that could not be fetched through its adapter.
 * @param sourceServiceId - The service the URL belongs to.
 * @returns The resolved track, from the cache when its ISRC is already stored.
 * @throws `ResolveError("SERVICE_DOWN")` when the page yields no metadata.
 * @throws `ResolveError("TRACK_NOT_FOUND")` when no service finds the scraped track.
 */
export async function resolveUrlViaScrape(url: string, sourceServiceId: ServiceId): Promise<ResolutionResult> {
  const scraped = await scrapeTrackFromPage(url);
  if (!scraped) {
    throw new ResolveError(
      "SERVICE_DOWN",
      `Cannot resolve ${sourceServiceId} URL: adapter not configured and page scrape failed`,
    );
  }

  log.debug("Resolver", `Scraped from page: "${scraped.title}" by ${scraped.artist}`);

  // Search across all active adapters
  const searchAdapters = await getActiveAdapters();
  const query = { title: scraped.title, artist: scraped.artist };

  let bestSourceTrack: NormalizedTrack | null = null;
  let bestAdapter: ServiceAdapter | null = null;
  let bestConfidence = 0;

  for (const adapter of searchAdapters) {
    try {
      const result = await adapter.searchTrack(query);
      if (result.found && result.track && result.confidence > bestConfidence) {
        bestSourceTrack = result.track;
        bestAdapter = adapter;
        bestConfidence = result.confidence;
      }
    } catch (error) {
      log.debug(
        "Resolver",
        `[${adapter.id}] scrape fallback search failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!bestSourceTrack || !bestAdapter) {
    throw new ResolveError("TRACK_NOT_FOUND", `Track not found: "${scraped.title}" by ${scraped.artist}`);
  }

  // The page image retains its provider even when catalogue metadata came from
  // another service. Both observations belong to the same verified cache identity.
  const observations: ResolvedLink[] = [
    {
      service: sourceServiceId,
      displayName: PLATFORM_CONFIG[sourceServiceId].label,
      url,
      confidence: SCRAPED_SOURCE_LINK_CONFIDENCE,
      matchMethod: "search",
      artworkUrl: pickRecordingArtworkUrl(scraped.artworkUrl, [], sourceServiceId),
    },
    resolvedTrackLink(bestAdapter, bestSourceTrack, bestConfidence, "search"),
  ];
  if (bestSourceTrack.isrc) {
    const cached = await tryCache({ isrc: bestSourceTrack.isrc });
    if (cached) return fillMissingServices(cached, observations);
  }

  // Resolve across all other services
  const { links, lateLinks } = await resolveAcrossServices(bestSourceTrack, bestAdapter);

  links.unshift(...observations);
  return completeFreshResolution(bestSourceTrack, links, lateLinks);
}
