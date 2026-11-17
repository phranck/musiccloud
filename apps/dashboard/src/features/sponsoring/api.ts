/**
 * @file Requests for the sponsoring setting.
 */

import { ENDPOINTS, type SponsoringConfig } from "@musiccloud/shared";
import { api } from "@/lib/api";

/** The query key of the sponsoring setting. */
export const SPONSORING_CONFIG_QUERY_KEY = ["admin", "sponsoring", "config"] as const;

/**
 * Reads the setting, with the defaults filled in for anything never saved.
 *
 * @returns The stored setting.
 */
export function fetchSponsoringConfig(): Promise<SponsoringConfig> {
  return api.get<SponsoringConfig>(ENDPOINTS.admin.sponsoring.config);
}

/**
 * Replaces the setting. The backend admits the owner alone.
 *
 * @param next - The complete new setting.
 * @returns The setting as stored.
 */
export function updateSponsoringConfig(next: SponsoringConfig): Promise<SponsoringConfig> {
  return api.put<SponsoringConfig>(ENDPOINTS.admin.sponsoring.config, next);
}
