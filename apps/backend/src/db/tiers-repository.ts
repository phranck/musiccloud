/**
 * Repository contract for the tier (API tariff) system (MC-092): read, create,
 * update, and delete tier definitions. The admin dashboard manages tiers; the
 * public Developer Portal reads them for its pricing page.
 */

/** Default tier accent colour (neutral slate) applied when none is supplied. */
export const DEFAULT_TIER_COLOR = "#64748b";

export interface Tier {
  id: string;
  name: string;
  requestsPerMinute: number;
  requestsPerDay: number;
  attributionRequired: boolean;
  price: string | null;
  /** Hex accent colour `#RRGGBB` (validated at the API boundary; default `#64748b`). */
  color: string;
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
  sortOrder?: number;
}

export interface TierUpdateData {
  name?: string;
  requestsPerMinute?: number;
  requestsPerDay?: number;
  attributionRequired?: boolean;
  price?: string | null;
  color?: string;
  sortOrder?: number;
}

export interface TierRepository {
  listTiers(): Promise<Tier[]>;
  createTier(data: TierCreateData): Promise<Tier>;
  updateTier(id: string, data: TierUpdateData): Promise<Tier>;
  deleteTier(id: string): Promise<void>;
}
