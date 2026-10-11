/**
 * @file One answer to "is this plan free" and to "which plan may a developer
 * put themselves on".
 *
 * Signup, the GitHub signup, the plan step of a project and the public
 * catalogue all ask these questions, and they ask them here so they cannot
 * answer them differently. A plan's price is its offers, so a plan is free
 * when it has none, and a developer may choose a plan themselves when it is
 * free and enabled.
 */

import { getTierRepository } from "../db/index.js";
import type { Tier, TierOffer } from "../db/tiers-repository.js";

/**
 * The canonical id of the free tier as seeded in migration
 * `0058_white_puff_adder.sql`.
 *
 * Only {@link resolveSignupTierId} reads it, as the tier an account is given
 * when nothing else applies. An account's tier is shown and enforces nothing,
 * so that fallback decides no limit.
 */
export const TIER_FREE_ID = "tier_free";

/**
 * Whether a plan is free.
 *
 * A plan's price is its offers, one per billing period, so a plan with no
 * offer costs nothing whichever period is asked about.
 *
 * @param tier - The plan.
 * @param offers - Offers of any plans; only those of `tier` count.
 * @returns `true` when the plan has no offer.
 */
export function isFreeTier(tier: Pick<Tier, "id">, offers: readonly Pick<TierOffer, "tierId">[]): boolean {
  return !offers.some((offer) => offer.tierId === tier.id);
}

/**
 * Whether a developer may put an account or a project on this plan without
 * anybody else being involved.
 *
 * A disabled plan is not offered at all, and a plan with a price cannot be
 * chosen because nothing has been paid.
 *
 * @param tier - The plan being considered.
 * @param offers - Offers of any plans; only those of `tier` count.
 * @returns `true` when the plan is enabled and free.
 */
export function isSelfServiceAssignableTier(
  tier: Pick<Tier, "id" | "enabled">,
  offers: readonly Pick<TierOffer, "tierId">[],
): boolean {
  return tier.enabled && isFreeTier(tier, offers);
}

/**
 * Every plan with every offer, read in one go so a list can be judged without
 * a query per plan.
 *
 * @returns The plans in catalogue order and all offers.
 */
async function readPlansWithOffers(): Promise<{ tiers: Tier[]; offers: TierOffer[] }> {
  const repo = await getTierRepository();
  const [tiers, offers] = await Promise.all([repo.listTiers(), repo.listAllOffers()]);
  return { tiers, offers };
}

/**
 * The plans a developer may currently choose from, in catalogue order.
 *
 * @returns Every enabled plan without an offer.
 */
export async function listSelfServiceAssignableTiers(): Promise<Tier[]> {
  const { tiers, offers } = await readPlansWithOffers();
  return tiers.filter((tier) => isSelfServiceAssignableTier(tier, offers));
}

/**
 * Resolves the tier id assigned to a new developer account at signup.
 *
 * An account is never left without a tier, so a requested tier that is not
 * assignable, unknown, or absent all resolve to {@link TIER_FREE_ID} rather
 * than to nothing. That is a fallback for the account, not permission to
 * grant a paid plan: a plan with an offer is never returned for the request.
 *
 * @param requestedTierId - The tier the caller asked for, if any.
 * @returns The tier id to store on the new account.
 */
export async function resolveSignupTierId(requestedTierId?: string | null): Promise<string> {
  const { tiers, offers } = await readPlansWithOffers();
  const requested = tiers.find((tier) => tier.id === requestedTierId);
  return requested !== undefined && isSelfServiceAssignableTier(requested, offers) ? requested.id : TIER_FREE_ID;
}
