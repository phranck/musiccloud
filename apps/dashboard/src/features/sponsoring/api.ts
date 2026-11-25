/**
 * @file Requests for the sponsoring setting, the donations ledger, the annual
 * sponsors, the sponsorship requests waiting for their transfer, the support
 * prompts with their limits, and the bank connection.
 */

import {
  type BankAuthorizationStart,
  type BankConnectionCallback,
  type BankConnectionStatus,
  type BankReadRequest,
  type BankReadResult,
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
import { fileToDataUrl } from "@/lib/files";

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
 * Uploads a picture chosen in the dashboard as a sponsor's picture. The
 * backend decodes it, cuts it to the stored square and answers the copy's id;
 * a file that is no JPEG or PNG, or is past the upload cap, is refused with
 * `MC-REQ-0017`, which the request rejects with.
 *
 * @param file - The file from the picture's file input.
 * @returns The stored copy's id.
 */
export async function uploadSponsorAvatar(file: File): Promise<SponsorAvatarResult> {
  const dataUrl = await fileToDataUrl(file);
  return api.post<SponsorAvatarResult>(ENDPOINTS.admin.sponsoring.sponsorAvatarUpload, { dataUrl });
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

/** The query key of what the site knows about its link to the bank account. */
export const BANK_CONNECTION_QUERY_KEY = ["admin", "sponsoring", "bank-connection"] as const;

/**
 * Reads what the site knows about its link to the bank account, answered from
 * the backend's own database and therefore also while the bank is unreachable.
 *
 * @returns The status.
 */
export function fetchBankConnection(): Promise<BankConnectionStatus> {
  return api.get<BankConnectionStatus>(ENDPOINTS.admin.sponsoring.bankConnection);
}

/**
 * Starts an authorization at the bank. The backend admits the owner alone.
 *
 * @returns The bank's own address, which the caller sends the browser to.
 */
export function startBankAuthorization(): Promise<BankAuthorizationStart> {
  return api.post<BankAuthorizationStart>(ENDPOINTS.admin.sponsoring.bankConnectionAuthorize);
}

/**
 * Hands the bank's return to the backend, which spends it and puts the
 * connection in force. The backend admits the owner alone.
 *
 * @param callback - The code and the state from the return address.
 * @returns The status afterwards.
 */
export function completeBankAuthorization(callback: BankConnectionCallback): Promise<BankConnectionStatus> {
  return api.post<BankConnectionStatus>(ENDPOINTS.admin.sponsoring.bankConnectionSession, callback);
}

/**
 * Lets the account go and ends the consent behind it. The backend admits the owner alone.
 *
 * @returns The status afterwards, which reports nothing connected.
 */
export function disconnectBank(): Promise<BankConnectionStatus> {
  return api.delete<BankConnectionStatus>(ENDPOINTS.admin.sponsoring.bankConnection);
}

/**
 * Reads the account now rather than waiting for the next background read, and
 * books what belongs to musiccloud. The backend admits the owner alone.
 *
 * @param request - The day to start at, or `{}` for the days the read takes by itself.
 * @returns What the read did, or why it did nothing, which is an ordinary answer rather than a failure.
 */
export function syncBank(request: BankReadRequest): Promise<BankReadResult> {
  return api.post<BankReadResult>(ENDPOINTS.admin.sponsoring.bankConnectionSync, request);
}
