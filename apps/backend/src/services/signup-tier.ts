/**
 * @file Single source for "which tier is assignable at signup" (MC-109, Plan A).
 *
 * Plan A rule: only `tier_free` is ever assignable at signup. A requested paid
 * tier (or an unknown/missing id) must safely fall back to `tier_free` so that:
 * - An account is NEVER left tier-less after signup.
 * - A paid tier can NEVER be granted for free.
 *
 * A later plan (Plan C) will extend {@link resolveSignupTierId} to support paid
 * tiers for users who have completed a purchase flow. Until then this module
 * stays lean and only allows the free tier.
 */

import { getTierRepository } from "../db/index.js";

/**
 * The canonical id of the free tier as seeded in migration
 * `0058_white_puff_adder.sql`. Used as the fallback and the only assignable
 * tier in Plan A.
 */
export const TIER_FREE_ID = "tier_free";

/**
 * Resolves the tier id that should be assigned to a new developer account at
 * signup time.
 *
 * **Plan A invariants (non-negotiable until Plan C):**
 * 1. If no tier id is requested, `tier_free` is assigned.
 * 2. If `tier_free` is explicitly requested, it is assigned.
 * 3. If any paid tier is requested, the request is silently ignored and
 *    `tier_free` is assigned instead; paid tiers are not yet purchasable.
 * 4. If an unknown id is requested, `tier_free` is assigned.
 *
 * The function always fetches the current tier list via
 * {@link getTierRepository} so that the "is it assignable?" check is grounded
 * in real DB state rather than a hardcoded allowlist. This makes the future
 * Plan C extension (add real assignability logic) a minimal, local change.
 *
 * @param requestedTierId - The tier id the caller would like assigned, if any.
 *   `undefined` and `null` both mean "no preference" and resolve to `tier_free`.
 * @returns The tier id that must be stored on the new developer account.
 *   Currently always `"tier_free"`.
 */
export async function resolveSignupTierId(requestedTierId?: string | null): Promise<string> {
  const repo = await getTierRepository();
  const tiers = await repo.listTiers();

  const requested = tiers.find((t) => t.id === requestedTierId);

  // Plan A assignability rule: a tier is only assignable at signup when it is
  // the free tier. Any paid tier (or missing/unknown id) falls back to free.
  const isAssignable = requested !== undefined && requested.id === TIER_FREE_ID;

  return isAssignable ? requested.id : TIER_FREE_ID;
}
