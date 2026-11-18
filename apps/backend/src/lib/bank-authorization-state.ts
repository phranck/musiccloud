/**
 * @file Recognizing a returning bank authorization, ported from lmaa.space
 * (`apps/backend/src/lib/bank-authorization-state.ts`).
 */

import { secretsMatch } from "./infra/secret-compare.js";

/** What the match needs of a stored authorization, and no more. */
export interface AuthorizationStateCandidate {
  /** The value that was issued, as hex. */
  state: string;
  /** The moment after which it no longer counts. */
  expiresAt: Date;
}

/**
 * Picks the stored authorization a return belongs to, if any does.
 *
 * @param candidates - Every authorization the table holds.
 * @param presented - The value the bank handed back.
 * @param now - The moment to judge expiry against.
 * @returns The one that matches and has not expired, or `null`.
 *
 * @remarks
 * Every candidate is compared, and each comparison is constant-time through
 * the backend's one `secretsMatch`, so neither the time taken nor the number of
 * comparisons says how far a guessed value got. The table holds an
 * authorization only while one is in flight, which is what keeps comparing all
 * of them cheap.
 *
 * Expiry is decided here rather than in the query that loaded the rows, so
 * there is one answer to when an authorization has run out and it is one a test
 * can put a clock in front of.
 */
export function matchAuthorizationState<Candidate extends AuthorizationStateCandidate>(
  candidates: Candidate[],
  presented: string,
  now: Date,
): Candidate | null {
  let matched: Candidate | null = null;

  for (const candidate of candidates) {
    const isCurrent = candidate.expiresAt.getTime() > now.getTime();
    if (isCurrent && secretsMatch(presented, candidate.state)) matched = candidate;
  }

  return matched;
}
