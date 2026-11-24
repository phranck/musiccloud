/**
 * @file Reading the public plan list, and writing a price the way the cards do.
 *
 * Both the pricing page and any content page carrying `[[plans]]` show the same
 * plans, so both read them here. A second fetch with its own sorting or its own
 * failure behaviour would eventually show a different list on one of them, and
 * nothing would say which was right.
 */

import { ENDPOINTS, type PublicTier } from "@musiccloud/shared";
import { backendUrl } from "@/lib/api";

/**
 * Reads the public plans, in the order they are meant to be shown.
 *
 * @returns The plans by ascending `sortOrder`, or an empty list when the
 *   backend cannot be reached. Empty rather than an error, because a pricing
 *   page that fails to load is worse than one showing its commitments without
 *   the table; every caller checks the length and says what it shows instead.
 */
export async function fetchPublicTiers(): Promise<PublicTier[]> {
  try {
    const response = await fetch(backendUrl(ENDPOINTS.v1.tiers));
    if (!response.ok) return [];
    const tiers = (await response.json()) as PublicTier[];
    return tiers.sort((left, right) => left.sortOrder - right.sortOrder);
  } catch {
    return [];
  }
}

/**
 * Writes an amount in its currency the way the plan cards write it.
 *
 * Whole amounts render without decimals, fractional ones with two, so a plan at
 * nine euro reads as `€9` rather than as `€9.00`, and one at nine dollars as
 * `$9`. A stored value that does not parse as a number is shown unchanged
 * rather than as `NaN`.
 *
 * @param raw - The price as the plan stores it, a numeric string in whole
 *   units of `currency`.
 * @param currency - The ISO 4217 code the price is charged in, such as `EUR`
 *   or `USD`, as the catalogue names it beside the price.
 * @returns The formatted amount.
 */
export function formatTierPrice(raw: string, currency: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * The billing periods a plan card can show a price for, which are the two
 * sides of the monthly/yearly switch above the cards.
 *
 * - `monthly`: the price from `PublicTier.price`, in `priceCurrency`.
 * - `yearly`: the price from `PublicTier.priceYearly`, in `priceYearlyCurrency`.
 */
export type BillingPeriod = "monthly" | "yearly";

/**
 * Writes the price one side of the switch shows for a plan, in the currency
 * that price is charged in.
 *
 * The side shows its own period's price, and falls back to the other period's
 * when the plan is not sold over its own, so a plan sold only yearly still
 * shows a figure on the monthly side. The amount and its currency always come
 * from the same period, so a fallback never writes one period's amount in the
 * other period's currency.
 *
 * @param tier - The plan as the public catalogue serves it.
 * @param period - The side of the switch the price is written for.
 * @returns The formatted price, or `null` when the plan has a price over
 *   neither period.
 */
export function formatPeriodPrice(tier: PublicTier, period: BillingPeriod): string | null {
  const monthly = { amount: tier.price, currency: tier.priceCurrency };
  const yearly = { amount: tier.priceYearly, currency: tier.priceYearlyCurrency };
  const [preferred, fallback] = period === "monthly" ? [monthly, yearly] : [yearly, monthly];
  for (const candidate of [preferred, fallback]) {
    if (candidate.amount && candidate.currency) return formatTierPrice(candidate.amount, candidate.currency);
  }
  return null;
}
