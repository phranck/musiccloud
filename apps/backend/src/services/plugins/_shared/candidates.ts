/**
 * @file Completeness of negative evidence from bounded candidate-page searches.
 *
 * A validated positive recording can survive an unrelated candidate failure.
 * Without that match, any rejected candidate leaves the search incomplete, even
 * when another page answered 404 or described a different recording. Returning
 * a clean miss there would suppress the provider through the resolver's miss cache.
 */

import type { ServiceId } from "@musiccloud/shared";
import { log } from "../../../lib/infra/logger.js";

/**
 * Rejects incomplete negative evidence after the adapter has scored its candidates.
 * @param results - Settled candidate requests; an empty array is a valid completed search.
 * @param matched - Whether the adapter accepted a qualifying recording or album.
 * @param service - Provider attached to a recoverable partial-result deviation.
 * @throws The first candidate failure when no positive match resolves the uncertainty.
 */
export function throwIfSearchIncomplete(
  results: readonly PromiseSettledResult<unknown>[],
  matched: boolean,
  service: ServiceId,
): void {
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (!failure) return;
  if (!matched) throw failure.reason;
  log.deviation(
    {
      component: "Adapter",
      adapterId: service,
      errorCode: "MC-API-0004",
      operation: "catalog_candidate_fetch",
      outcome: "positive_partial_candidates",
    },
    failure.reason,
  );
}
