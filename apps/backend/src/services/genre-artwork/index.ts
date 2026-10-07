/**
 * Public surface for the genre-artwork subsystem.
 *
 * `ensureArtwork` is the cold-path generator: downloads the source cover,
 * computes the cover's average color + dominant accent, renders a
 * Spotify-style tile JPEG (flat fill + rotated cover thumb + genre name),
 * and persists. Parallel requests for the same genre share one generation
 * via an in-flight Map (same pattern as `browseCacheInflight` in
 * `lastfm.ts`), so a thundering-herd of tile loads does not stampede the
 * CPU.
 *
 * `getCachedArtwork` and `getStoredArtworkSummaries` are the hot-path reads
 * used by the route and by the browse-grid response respectively.
 */

import { createConcurrencyLimiter } from "../../lib/concurrency.js";
import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";
import { extractColorsFromBuffer } from "./color-extractor.js";
import { generateArtwork } from "./generator.js";
import { getArtwork, type StoredArtwork, saveArtwork } from "./repository.js";

export type { StoredArtwork, StoredArtworkSummary } from "./repository.js";
export { clearAllArtworks, getArtwork as getCachedArtwork, getStoredArtworkSummaries } from "./repository.js";

const inflight = new Map<string, Promise<EnsuredArtwork>>();

/**
 * Default fill color when a cover cannot be fetched/decoded. Matches the
 * default `--color-accent` teal used elsewhere in the UI.
 */
const FALLBACK_COLOR = "#28A8D8";

/**
 * Cap on concurrent upstream cover-image fetches across ALL `ensureArtwork`
 * calls. A cold-cache burst (many tiles regenerating at once after a deploy or
 * an artwork-version bump) would otherwise fire dozens of parallel CDN fetches
 * and trip timeouts → fallback tiles. The frontend already limits in-flight
 * tile requests per client; this server-side gate protects the upstream
 * regardless of how many clients hit at once. Conservative on purpose:
 * regeneration is a one-time, cached cost, so reliability beats speed here.
 */
const MAX_CONCURRENT_COVER_FETCHES = 3;
const limitCoverFetch = createConcurrencyLimiter(MAX_CONCURRENT_COVER_FETCHES);

/** A freshly generated (or cache-hit) artwork, plus whether it is a transient fallback. */
export interface EnsuredArtwork extends StoredArtwork {
  /**
   * True when a cover URL was given but its fetch/decode failed, so the
   * flat-colour tile is NOT persisted and the route must serve it WITHOUT an
   * immutable cache header — otherwise the transient failure freezes in the
   * browser. A genuinely cover-less genre (no URL) is not a fallback.
   */
  isFallback: boolean;
}

export async function ensureArtwork(
  genreKey: string,
  coverUrl: string | null,
  displayName: string,
): Promise<EnsuredArtwork> {
  const cached = await getArtwork(genreKey);
  if (cached) return { ...cached, isFallback: false };

  const existing = inflight.get(genreKey);
  if (existing) return existing;

  const promise = (async (): Promise<EnsuredArtwork> => {
    let tileColor = FALLBACK_COLOR;
    let coverBuffer: Buffer | null = null;

    if (coverUrl) {
      // Gate the upstream fetch so a regeneration burst stays under the limit.
      await limitCoverFetch(async () => {
        try {
          const res = await fetchWithTimeout(coverUrl, undefined, 5000);
          if (res.ok) {
            coverBuffer = Buffer.from(await res.arrayBuffer());
            const { avgHex } = await extractColorsFromBuffer(coverBuffer);
            tileColor = avgHex;
          }
        } catch (err) {
          log.debug(
            "GenreArtwork",
            `Cover fetch/decode failed for ${genreKey}, using the fallback color: ${(err as Error).message}`,
          );
        }
      });
    }

    const jpeg = await generateArtwork(displayName, coverBuffer, tileColor);
    // A transient cover-fetch failure (URL present but nothing decoded) must
    // NOT be cached — that would freeze the genre as a permanent flat-colour
    // tile. Persist only a successful cover or a genuinely cover-less genre.
    const isFallback = coverUrl !== null && coverBuffer === null;
    if (!isFallback) {
      await saveArtwork(genreKey, jpeg, tileColor, coverUrl);
    }
    return { jpeg, accentColor: tileColor, isFallback };
  })().finally(() => {
    inflight.delete(genreKey);
  });

  inflight.set(genreKey, promise);
  return promise;
}
