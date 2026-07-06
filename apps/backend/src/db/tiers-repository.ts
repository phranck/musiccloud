/**
 * Repository contract for the tier (API tariff) system (MC-092): read, create,
 * update, and delete tier definitions. The admin dashboard manages tiers; the
 * public Developer Portal reads them for its pricing page.
 */

/** Default tier accent colour (neutral slate) applied when none is supplied. */
export const DEFAULT_TIER_COLOR = "#64748b";

/**
 * Fallback rate limits applied when an API client has no per-key override
 * AND its owning account has no (resolvable) tier — e.g. the tier was
 * deleted (`tier_id` is set NULL via FK). Kept identical to the historic
 * free-tier defaults so the failure mode is "conservative free limits",
 * never "unlimited".
 */
export const FALLBACK_REQUESTS_PER_MINUTE = 60;
export const FALLBACK_REQUESTS_PER_DAY = 10000;

export interface Tier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  price: string | null;
  /** Hex accent colour `#RRGGBB` (validated at the API boundary; default `#64748b`). */
  color: string;
  /** Free-text description shown on the public pricing card (English, ≤500 chars; default `""`). */
  description: string;
  /** Whether the tier is currently offered. Disabled tiers stay visible on the pricing page (marked) but can no longer be assigned. */
  enabled: boolean;
  /** Reason shown when the tier is disabled (English, ≤200 chars; default `""`). Only meaningful when `enabled` is false. */
  disableReason: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface TierCreateData {
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired?: boolean;
  price?: string | null;
  color?: string;
  description?: string;
  enabled?: boolean;
  disableReason?: string;
  sortOrder?: number;
}

export interface TierUpdateData {
  name?: string;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  attributionRequired?: boolean;
  price?: string | null;
  color?: string;
  description?: string;
  enabled?: boolean;
  disableReason?: string;
  sortOrder?: number;
}

export interface TierRepository {
  listTiers(): Promise<Tier[]>;
  createTier(data: TierCreateData): Promise<Tier>;
  updateTier(id: string, data: TierUpdateData): Promise<Tier>;
  deleteTier(id: string): Promise<void>;
}
