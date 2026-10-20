/**
 * @file Artist-name splitting for adapters that receive combined strings.
 *
 * Several services return the artist credit as one string like
 * `"Artist A, Artist B & Artist C"` rather than a proper array.
 * This helper normalizes those into the `string[]` shape that
 * `NormalizedTrack.artists` / `NormalizedAlbum.artists` expect, while
 * collapsing the two common separators (comma, ampersand) consistently.
 * Structured provider arrays do not need that metadata conversion.
 *
 * artistSearchNames builds broad lookup terms. artistIdentityNames accepts
 * only explicit collaboration markers because commas and ampersands can belong
 * to one band's name. Neither surface replaces stored credits or display metadata.
 */

import { Service } from "@musiccloud/shared";
import type { NormalizedTrack } from "../../types.js";

/**
 * Reads a provider's published Latin name without overwriting its bilingual display label.
 *
 * Bugs reports LatinName(HangulAlias) in its credits. Only that verified format
 * is interpreted here; unknown providers and Latin parenthetical descriptors
 * remain intact. This is a lookup/comparison value, never canonical metadata.
 *
 * @param raw - Original provider credit.
 * @param service - Known provider provenance, absent when the format is unverified.
 * @returns The reported Latin name for a Bugs alias, otherwise the original credit.
 */
export function artistNameForSearch(raw: string, service?: NormalizedTrack["sourceService"]): string {
  if (service !== Service.Bugs) return raw;
  const match = /^([^()]+?)\s*\(([^()]+)\)\s*$/u.exec(raw);
  if (
    !match ||
    !/\p{Script=Latin}/u.test(match[1]) ||
    /\p{Script=Hangul}/u.test(match[1]) ||
    !/\p{Script=Hangul}/u.test(match[2]) ||
    /\p{Script=Latin}/u.test(match[2])
  )
    return raw;
  return match[1].trim();
}

/**
 * Keeps full credits before distinct component interpretations without mutating metadata.
 * @param candidates - Ordered lookup or identity terms; blank terms are discarded.
 * @returns Trimmed, case-insensitively distinct names in their supplied order.
 */
function uniqueArtistNames(candidates: readonly string[]): string[] {
  const seen = new Set<string>();
  return candidates
    .map((name) => name.trim())
    .filter((name) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/**
 * Derives broad request terms without treating them as artist identity.
 * @param raw - Original credit; commas/ampersands may broaden the lookup only.
 * @returns The full credit followed by distinct possible lookup components.
 */
export function artistSearchNames(raw: string): string[] {
  return uniqueArtistNames([raw, ...raw.split(/\s+(?:x|feat\.?|ft\.?)\s+|,|&/i)]);
}

/**
 * Interprets explicit collaboration credits while preserving complete band names.
 * @param raw - Original credit; only x/feat/featuring/ft markers split identity terms.
 * @returns The full name and explicit collaborators; comma/ampersand names remain whole.
 */
export function artistIdentityNames(raw: string): string[] {
  return uniqueArtistNames([raw, ...raw.split(/\s+(?:x|feat(?:uring)?\.?|ft\.?)\s+/i)]);
}

/**
 * Splits provider metadata that represents several artists as one credit.
 *
 * @param raw - Combined credit, typically from a provider response.
 * @param fallback - Name for empty or unparseable input; defaults to Unknown Artist.
 * @returns A nonempty array of trimmed artist names.
 */
export function splitArtistNames(raw: string | undefined | null, fallback = "Unknown Artist"): string[] {
  if (!raw) return [fallback];
  const parts = raw
    .split(/[,&]/)
    .map((a) => a.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [fallback];
}
