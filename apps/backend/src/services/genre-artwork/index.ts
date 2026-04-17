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
 * `getCachedArtwork` and `getAccentColors` are the hot-path reads used
 * by the route and by the browse-grid response respectively.
 */

import { fetchWithTimeout } from "../../lib/infra/fetch.js";
import { log } from "../../lib/infra/logger.js";
import { extractColorsFromBuffer } from "./color-extractor.js";
import { generateArtwork } from "./generator.js";
import { getArtwork, type StoredArtwork, saveArtwork } from "./repository.js";

export type { StoredArtwork } from "./repository.js";
export { clearAllArtworks, getAccentColors, getArtwork as getCachedArtwork } from "./repository.js";

const inflight = new Map<string, Promise<StoredArtwork>>();

/**
 * Default fill color when a cover cannot be fetched/decoded. Matches the
 * default `--color-accent` teal used elsewhere in the UI.
 */
const FALLBACK_COLOR = "#28A8D8";

export async function ensureArtwork(
  genreKey: string,
  coverUrl: string | null,
  displayName: string,
): Promise<StoredArtwork> {
  const cached = await getArtwork(genreKey);
  if (cached) return cached;

  const existing = inflight.get(genreKey);
  if (existing) return existing;

  const promise = (async (): Promise<StoredArtwork> => {
    let tileColor = FALLBACK_COLOR;
    let coverBuffer: Buffer | null = null;

    if (coverUrl) {
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
          `Cover fetch/decode failed for ${genreKey}: ${(err as Error).message} — using fallback color`,
        );
      }
    }

    const jpeg = await generateArtwork(displayName, coverBuffer, tileColor);
    await saveArtwork(genreKey, jpeg, tileColor, coverUrl);
    return { jpeg, accentColor: tileColor };
  })().finally(() => {
    inflight.delete(genreKey);
  });

  inflight.set(genreKey, promise);
  return promise;
}
