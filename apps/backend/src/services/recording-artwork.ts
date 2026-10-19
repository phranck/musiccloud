import { getRepository } from "../db/index.js";
import type { RecordingKind } from "../db/repository.js";
import { log } from "../lib/infra/logger.js";
import { type ArtworkCandidate, pickRecordingArtworkUrl } from "./artwork.js";

/**
 * Keeps a permitted recording cover and persists only an actual cover change.
 *
 * Fresh resolution uses the pure policy in `artwork.ts` before its initial
 * insert. Cached and late results use this boundary because rewriting an entire
 * recording would risk credits, operator edits, and the existing share id.
 * Compare-and-set storage protects a concurrently changed cover. Share-page
 * reads use only the pure filter and never call this mutating boundary.
 *
 * @param kind - Track or album, never an artist portrait.
 * @param id - Persisted entity id; absent before persistence.
 * @param own - Cover observed on that entity, possibly a prohibited fallback.
 * @param candidates - Covers from validated matches, empty when only filtering.
 * @returns The permitted cover, or undefined for the existing placeholder.
 */
export async function keepRecordingArtwork(
  kind: RecordingKind,
  id: string | undefined,
  own: string | undefined,
  candidates: readonly ArtworkCandidate[] = [],
): Promise<string | undefined> {
  const kept = pickRecordingArtworkUrl(own, candidates);
  if (!id || kept === own) return kept;
  try {
    const repository = await getRepository();
    await repository.replaceRecordingArtwork(kind, id, own ?? null, kept ?? null);
  } catch (error) {
    log.deviation(
      {
        component: "Resolver",
        errorCode: "MC-DB-0004",
        operation: "persist_recording_artwork",
        outcome: "filtered_cover_without_persisted_change",
        entityKind: kind,
      },
      error,
    );
  }
  return kept;
}
