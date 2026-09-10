/**
 * @file Reading the public plan list, and writing a price the way the cards do.
 *
 * Both the pricing page and any content page carrying `[[plans]]` show the same
 * plans, so both read them here. A second fetch with its own sorting or its own
 * failure behaviour would eventually show a different list on one of them, and
 * nothing would say which was right.
 */

import { backendUrl } from "@/lib/api";

/** One plan as `GET /api/v1/tiers` returns it. */
export interface PublicTier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  /** Monthly price in euros as a numeric string, or `null` for free plans. */
  price: string | null;
  /** Yearly price in euros as a numeric string, or `null` when no yearly billing is offered. */
  priceYearly: string | null;
  color: string;
  /** Icon name, one of the shared tier icons, or `null` for none. */
  icon: string | null;
  /** Custom label for the call to action, or `null` to use the portal default. */
  buttonLabel: string | null;
  description: string;
  enabled: boolean;
  /** Whether a developer can put a project on this plan themselves today. */
  selfServiceAssignable: boolean;
  disableReason: string;
  /** Whether this plan is highlighted as the recommended one. At most one is. */
  recommended: boolean;
  sortOrder: number;
  /** Ordered feature bullets shown on the card, each a short label. */
  features: string[];
}

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
    const response = await fetch(backendUrl("/api/v1/tiers"));
    if (!response.ok) return [];
    const tiers = (await response.json()) as PublicTier[];
    return tiers.sort((left, right) => left.sortOrder - right.sortOrder);
  } catch {
    return [];
  }
}

/**
 * Writes a euro amount the way the plan cards write it.
 *
 * Whole amounts render without decimals, fractional ones with two, so a plan at
 * nine euro reads as `€9` rather than as `€9.00`. A stored value that does not
 * parse as a number is shown unchanged rather than as `NaN`.
 *
 * @param raw - The price as the plan stores it, a numeric string.
 * @returns The formatted amount.
 */
export function formatTierPrice(raw: string): string {
  const value = Number(raw);
  if (!Number.isFinite(value)) return raw;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
