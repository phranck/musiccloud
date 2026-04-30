/**
 * @file Crawler ingest — runs one candidate through the existing resolver
 * pipeline and persists via the shared `persistResolution` helper.
 *
 * The crawler does no resolver work of its own: URL candidates go through
 * `resolveUrl`, search candidates through `resolveTextSearchWithDisambiguation`.
 * Disambiguation results are skipped (returning multiple candidates is the
 * resolver's "ask the user which one" path; the crawler has no user to ask
 * and would rather drop the candidate than guess).
 *
 * Persistence reuses the same `persistResolution` core that the route
 * layer calls, so cross-service ID aggregation, MusicBrainz canonicalisation,
 * and per-service preview persistence all happen identically.
 */
import { log } from "../../lib/infra/logger.js";
import { persistResolution } from "../persist-resolution.js";
import { resolveTextSearchWithDisambiguation, resolveUrl } from "../resolver.js";
import type { Candidate } from "./types.js";

export type IngestStatus = "ingested" | "skipped" | "error";

/**
 * Resolve + persist one candidate. `skipped` is returned for resolvable-but-
 * not-actionable cases (search returning a disambiguation list); `error`
 * for upstream failures (network, parse, persist) — both are non-fatal and
 * the heartbeat continues with the next candidate.
 */
export async function ingestCandidate(c: Candidate): Promise<IngestStatus> {
  try {
    if (c.kind === "url") {
      const result = await resolveUrl(c.url);
      await persistResolution(result);
      return "ingested";
    }

    const textResult = await resolveTextSearchWithDisambiguation(`${c.title} ${c.artist}`);
    if (textResult.kind !== "resolved" || !textResult.result) {
      // Disambiguation list — the crawler won't pick a winner.
      return "skipped";
    }
    await persistResolution(textResult.result);
    return "ingested";
  } catch (err) {
    log.error("Crawler", `Ingest failed: ${err instanceof Error ? err.message : String(err)}`);
    return "error";
  }
}
