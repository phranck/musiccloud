/**
 * @file Crawler dedupe — pre-resolve filter that drops candidates already
 * present in the canonical track DB.
 *
 * Uses the existing repository methods:
 * - `findTrackByUrl(url)` covers the URL-input case (the canonical
 *   `tracks.source_url` is what we'd write at persist time).
 * - `findTrackByIsrc(isrc)` covers cross-service ISRC matches: the
 *   adapter implementation in `db/adapters/postgres.ts:333-361` checks
 *   the canonical `tracks.isrc` first and falls back to the
 *   `track_external_ids` aggregation table, so a regional ISRC variant
 *   reported by another service still triggers a hit.
 *
 * Search candidates ("kind: search", Last.fm tag tops) cannot be
 * pre-deduplicated by ID — the resolver's existing cache hit on
 * (title, artist) absorbs duplicates one layer down. Returning false
 * here means "let the resolver handle it"; cost is one extra in-memory
 * lookup, never a duplicate persist.
 */
import { getRepository } from "../../db/index.js";
import type { Candidate } from "./types.js";

export async function isAlreadyIngested(c: Candidate): Promise<boolean> {
  if (c.kind !== "url") return false;

  const repo = await getRepository();
  if (await repo.findTrackByUrl(c.url)) return true;
  if (c.isrc && (await repo.findTrackByIsrc(c.isrc))) return true;
  return false;
}
