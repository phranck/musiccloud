/**
 * @file Requests for the sponsoring setting, the donations ledger, the annual
 * sponsors, the sponsorship requests waiting for their transfer, and the
 * support prompts with their limits.
 */

import {
  type Donation,
  type DonationInput,
  type DonationTotals,
  ENDPOINTS,
  type PendingSponsorship,
  type PendingSponsorshipTakeover,
  type SocialMediaLinks,
  type Sponsor,
  type SponsorAvatarResult,
  type SponsorInput,
  type SponsoringConfig,
  type SupportPrompt,
  type SupportPromptInput,
  type SupportPromptLimits,
} from "@musiccloud/shared";
import { api } from "@/lib/api";

/** The query key of the sponsoring setting. */
export const SPONSORING_CONFIG_QUERY_KEY = ["admin", "sponsoring", "config"] as const;

/**
 * The query key every donation and sponsor query starts with. Every write to
 * either invalidates it, because they read each other: a sponsor's amount is
 * summed from the donations linked to them, removing a sponsor turns their
 * donations into free ones, and a recorded donation changes the sums.
 */
export const LEDGER_QUERY_KEY = ["admin", "sponsoring", "ledger"] as const;

/** The query key every donation query starts with. */
export const DONATIONS_QUERY_KEY = [...LEDGER_QUERY_KEY, "donations"] as const;

/** The query key of the ledger's rows. */
export const DONATION_LIST_QUERY_KEY = [...DONATIONS_QUERY_KEY, "list"] as const;

/** The query key of the ledger's sums. */
export const DONATION_TOTALS_QUERY_KEY = [...DONATIONS_QUERY_KEY, "totals"] as const;

/** The query key of the annual sponsors. */
export const SPONSORS_QUERY_KEY = [...LEDGER_QUERY_KEY, "sponsors"] as const;

/**
 * The query key of the sponsorship requests. It sits outside
 * {@link LEDGER_QUERY_KEY}, because recording a donation or a sponsor by hand
 * changes no request, while a takeover changes both and invalidates both.
 */
export const SPONSORSHIP_REQUESTS_QUERY_KEY = ["admin", "sponsoring", "requests"] as const;

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

/**
 * Reads every annual sponsor, current or past, with the amount linked to each.
 *
 * @returns The sponsors, the most recent payment first.
 */
export function fetchSponsors(): Promise<Sponsor[]> {
  return api.get<Sponsor[]>(ENDPOINTS.admin.sponsoring.sponsors);
}

/**
 * Records an annual sponsor.
 *
 * @param input - The sponsor as entered.
 * @returns The stored sponsor.
 */
export function createSponsor(input: SponsorInput): Promise<Sponsor> {
  return api.post<Sponsor>(ENDPOINTS.admin.sponsoring.sponsors, input);
}

/**
 * Replaces an annual sponsor's fields.
 *
 * @param id - The sponsor to change.
 * @param input - Their new fields.
 * @returns The stored sponsor.
 */
export function updateSponsor(id: string, input: SponsorInput): Promise<Sponsor> {
  return api.put<Sponsor>(ENDPOINTS.admin.sponsoring.sponsorDetail(id), input);
}

/**
 * Removes an annual sponsor. Their donations stay in the ledger as free ones.
 *
 * @param id - The sponsor to remove.
 */
export function deleteSponsor(id: string): Promise<void> {
  return api.delete<void>(ENDPOINTS.admin.sponsoring.sponsorDetail(id));
}

/**
 * Asks the backend to find, copy and store the picture behind a sponsor's
 * profiles, saved or not.
 *
 * @param socialMedia - The profiles as the card holds them.
 * @returns The stored copy's id, or `null` when no profile led to a picture.
 */
export function resolveSponsorAvatar(socialMedia: SocialMediaLinks): Promise<SponsorAvatarResult> {
  return api.post<SponsorAvatarResult>(ENDPOINTS.admin.sponsoring.sponsorAvatar, { socialMedia });
}

/**
 * Reads every sponsorship request nobody has taken over yet.
 *
 * @returns The requests, oldest first.
 */
export function fetchSponsorshipRequests(): Promise<PendingSponsorship[]> {
  return api.get<PendingSponsorship[]>(ENDPOINTS.admin.sponsoring.requests);
}

/**
 * Turns a request into an annual sponsor and the donation that pays for them.
 * The backend writes both and removes the request in one transaction, so a
 * failure leaves the request as it was.
 *
 * @param id - The request to take over.
 * @param takeover - What arrived and on which day, as the bank statement shows it.
 * @returns The sponsor as stored.
 */
export function takeOverSponsorshipRequest(id: string, takeover: PendingSponsorshipTakeover): Promise<Sponsor> {
  return api.post<Sponsor>(ENDPOINTS.admin.sponsoring.requestTakeover(id), takeover);
}

/**
 * Removes a request with everything the person entered. A transfer quoting
 * its reference can no longer be matched to anybody afterwards.
 *
 * @param id - The request to remove.
 */
export function deleteSponsorshipRequest(id: string): Promise<void> {
  return api.delete<void>(ENDPOINTS.admin.sponsoring.requestDetail(id));
}

/** The query key of every support prompt, published or not. */
export const SUPPORT_PROMPTS_QUERY_KEY = ["admin", "support-prompts", "list"] as const;

/** The query key of the limits that bound one reader across every support prompt together. */
export const SUPPORT_PROMPT_LIMITS_QUERY_KEY = ["admin", "support-prompts", "limits"] as const;

/**
 * Reads every support prompt, published or not, for the list in the dashboard.
 *
 * @returns The prompts.
 */
export function fetchSupportPrompts(): Promise<SupportPrompt[]> {
  return api.get<SupportPrompt[]>(ENDPOINTS.admin.supportPrompts.list);
}

/**
 * Reads what bounds one reader across every prompt together.
 *
 * @returns The stored limits, with the defaults filled in for anything never saved.
 */
export function fetchSupportPromptLimits(): Promise<SupportPromptLimits> {
  return api.get<SupportPromptLimits>(ENDPOINTS.admin.supportPrompts.limits);
}

/**
 * Stores the limits.
 *
 * @param limits - The complete new limits.
 * @returns The limits as stored.
 */
export function updateSupportPromptLimits(limits: SupportPromptLimits): Promise<SupportPromptLimits> {
  return api.put<SupportPromptLimits>(ENDPOINTS.admin.supportPrompts.limits, limits);
}

/**
 * Creates a support prompt.
 *
 * @param input - The prompt as entered.
 * @returns The prompt with the identifier it was given.
 */
export function createSupportPrompt(input: SupportPromptInput): Promise<SupportPrompt> {
  return api.post<SupportPrompt>(ENDPOINTS.admin.supportPrompts.list, input);
}

/**
 * Saves one support prompt. The identifier never changes, so nobody's counters reset.
 *
 * @param id - The prompt to change.
 * @param input - Its new fields.
 * @returns The prompt as stored.
 */
export function updateSupportPrompt(id: string, input: SupportPromptInput): Promise<SupportPrompt> {
  return api.put<SupportPrompt>(ENDPOINTS.admin.supportPrompts.detail(id), input);
}

/**
 * Removes one support prompt. It leaves the site at once.
 *
 * @param id - The prompt to remove.
 * @returns The backend's confirmation message.
 */
export function deleteSupportPrompt(id: string): Promise<{ message: string }> {
  return api.delete<{ message: string }>(ENDPOINTS.admin.supportPrompts.detail(id));
}
