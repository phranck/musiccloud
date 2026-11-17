/**
 * @file Requests for the sponsoring setting and the donations ledger.
 */

import {
  type Donation,
  type DonationInput,
  type DonationTotals,
  ENDPOINTS,
  type SponsoringConfig,
} from "@musiccloud/shared";
import { api } from "@/lib/api";

/** The query key of the sponsoring setting. */
export const SPONSORING_CONFIG_QUERY_KEY = ["admin", "sponsoring", "config"] as const;

/**
 * The query key every ledger query starts with. Invalidating it refreshes the
 * list and the sums together, because a recorded donation changes both.
 */
export const DONATIONS_QUERY_KEY = ["admin", "sponsoring", "donations"] as const;

/** The query key of the ledger's rows. */
export const DONATION_LIST_QUERY_KEY = [...DONATIONS_QUERY_KEY, "list"] as const;

/** The query key of the ledger's sums. */
export const DONATION_TOTALS_QUERY_KEY = [...DONATIONS_QUERY_KEY, "totals"] as const;

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

/**
 * Reads every donation, newest first.
 *
 * @returns The ledger's rows.
 */
export function fetchDonations(): Promise<Donation[]> {
  return api.get<Donation[]>(ENDPOINTS.admin.sponsoring.donations);
}

/**
 * Reads what came in over the funding year and month, per month and per route.
 *
 * @returns The sums.
 */
export function fetchDonationTotals(): Promise<DonationTotals> {
  return api.get<DonationTotals>(ENDPOINTS.admin.sponsoring.donationTotals);
}

/**
 * Records a donation.
 *
 * @param input - The donation as entered.
 * @returns The stored row.
 */
export function createDonation(input: DonationInput): Promise<Donation> {
  return api.post<Donation>(ENDPOINTS.admin.sponsoring.donations, input);
}

/**
 * Replaces a donation's fields.
 *
 * @param id - The row to change.
 * @param input - Its new fields.
 * @returns The stored row.
 */
export function updateDonation(id: string, input: DonationInput): Promise<Donation> {
  return api.put<Donation>(ENDPOINTS.admin.sponsoring.donationDetail(id), input);
}

/**
 * Removes a donation from the ledger, which takes it out of every sum.
 *
 * @param id - The row to remove.
 */
export function deleteDonation(id: string): Promise<void> {
  return api.delete<void>(ENDPOINTS.admin.sponsoring.donationDetail(id));
}
