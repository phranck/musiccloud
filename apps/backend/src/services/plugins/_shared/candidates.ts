/**
 * @file Telling a search with no readable candidate from a search with no match.
 *
 * A scraping adapter finds candidate ids on a search page and then fetches each
 * candidate's own page. One page failing costs one candidate. Every page
 * failing means the service did not answer, and the adapter contract
 * (`ServiceAdapter.findByIsrc` in `services/types.ts`) requires a throw for
 * that rather than "not found", because the resolver remembers a miss for a
 * month and skips the service for that long.
 */

/**
 * Throws when every candidate fetch of a search failed.
 *
 * @param results - The settled candidate fetches. An empty list is not a
 *   failure: the search page itself answered with no candidates.
 * @throws The first fetch's error, when none of them succeeded.
 */
export function throwIfNoCandidateAnswered(results: readonly PromiseSettledResult<unknown>[]): void {
  const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (firstFailure && results.every((result) => result.status === "rejected")) throw firstFailure.reason;
}
