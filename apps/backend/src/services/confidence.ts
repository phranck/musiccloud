/**
 * @file One meaning for the confidence a resolved link reports.
 *
 * The three resolvers each build links, and each used to hand the adapter's own
 * score straight through. Adapters score their own text matches and several
 * reach a perfect one, so a guess and a certainty arrived at a caller as the
 * same number. This module is where the scale is enforced, once, rather than in
 * twenty-one adapters where one of them would eventually not enforce it.
 */
import type { MatchMethod } from "@musiccloud/shared";
import { IDENTIFIER_MATCH_CONFIDENCE, SEARCH_MAX_CONFIDENCE } from "./constants.js";

/** Methods that name the recording itself rather than resembling it. */
const IDENTIFIER_METHODS: readonly MatchMethod[] = ["isrc", "upc", "isrc-inference"];

/**
 * Holds a reported confidence to what its match method is allowed to claim.
 *
 * An identifier match and the source link may report
 * {@link IDENTIFIER_MATCH_CONFIDENCE}, because both are the recording rather
 * than something that looks like it. A text match stops at
 * {@link SEARCH_MAX_CONFIDENCE} however good its own scoring says it is, so a
 * caller reading `1` knows it did not come from a search. That comparison is
 * against `1` rather than the ceiling, because the ceiling does not survive
 * storage in a `real` column exactly and `1` does.
 *
 * @param matchMethod - How the link was arrived at.
 * @param confidence - What the adapter reported.
 * @returns The confidence a caller sees, never above what the method may claim.
 */
export function confidenceForMethod(matchMethod: MatchMethod, confidence: number): number {
  if (matchMethod === "source" || IDENTIFIER_METHODS.includes(matchMethod)) {
    return Math.min(confidence, IDENTIFIER_MATCH_CONFIDENCE);
  }
  if (matchMethod === "search") return Math.min(confidence, SEARCH_MAX_CONFIDENCE);
  return confidence;
}
