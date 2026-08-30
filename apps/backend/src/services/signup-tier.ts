/**
 * @file One answer to "which tier may a developer put themselves on".
 *
 * Two places ask it: signup, which assigns a tier to a new account, and the
 * plan step, where a developer chooses the plan for a project. They ask it here
 * so they cannot answer it differently, which is the shape the project rules
 * forbid.
 *
 * Today the answer is the free tier and nothing else, because no paid tier can
 * be bought yet. When one can, this is the module that changes, and both
 * callers follow.
 */

import { getTierRepository } from "../db/index.js";
import type { Tier } from "../db/tiers-repository.js";

/**
 * The canonical id of the free tier as seeded in migration
 * `0058_white_puff_adder.sql`.
 */
export const TIER_FREE_ID = "tier_free";

/**
 * Whether a developer may put an account or a project on this tier without
 * anybody else being involved.
 *
 * A disabled tier is not offered at all, and a paid tier cannot be chosen
 * because nothing has been paid: the checkout that would change that is built
 * in the billing epic.
 *
 * @param tier - The tier being considered.
 * @returns `true` when a developer may choose it themselves.
 */
export function isSelfServiceAssignableTier(tier: Pick<Tier, "id" | "enabled">): boolean {
  return tier.id === TIER_FREE_ID && tier.enabled;
}

/**
 * The tiers a developer may currently choose from, in catalogue order.
 *
 * @returns Every assignable tier. Today that is at most one.
 */
export async function listSelfServiceAssignableTiers(): Promise<Tier[]> {
  const repo = await getTierRepository();
  const tiers = await repo.listTiers();
  return tiers.filter((tier) => isSelfServiceAssignableTier(tier));
}

/**
 * Resolves the tier id assigned to a new developer account at signup.
 *
 * An account is never left without a tier, so a requested tier that is not
 * assignable, unknown, or absent all resolve to the free tier rather than to
 * nothing. That is a fallback for the account, not permission to grant a paid
 * tier: a paid tier is never returned here.
 *
 * @param requestedTierId - The tier the caller asked for, if any.
 * @returns The tier id to store on the new account.
 */
export async function resolveSignupTierId(requestedTierId?: string | null): Promise<string> {
  const repo = await getTierRepository();
  const tiers = await repo.listTiers();

  const requested = tiers.find((tier) => tier.id === requestedTierId);
  return requested !== undefined && isSelfServiceAssignableTier(requested) ? requested.id : TIER_FREE_ID;
}
