/**
 * @file GDPR erasure (MC-085, Art. 17). Erasure is anonymisation for stored
 * form submissions (their `submitter_email` is nulled; the data itself stays)
 * plus, for account subjects, deletion of the developer account — the DB
 * cascade then clears identities, email tokens, and API-access
 * requests/clients, while `form_submissions.developer_account_id` is nulled
 * by its `SET NULL` foreign key.
 */

import type { PersonalDataSubject } from "../db/admin-repository.js";
import { getAdminRepository, getDeveloperRepository } from "../db/index.js";

/** What an erasure run actually removed. */
export interface EraseResult {
  /** How many stored submissions lost their personal attribution. */
  anonymizedSubmissions: number;
  /** Whether a developer account row was deleted (account subjects only). */
  accountDeleted: boolean;
}

/**
 * Erases the subject's personal data: always anonymises their submissions;
 * deletes the developer account when the subject carries one. Callers own the
 * authorization decision (self-service danger zone vs. admin request).
 *
 * @param subject - Account holder (both fields) or account-less submitter.
 * @returns Counts of what was erased.
 */
export async function erasePersonalData(subject: PersonalDataSubject): Promise<EraseResult> {
  const adminRepo = await getAdminRepository();
  const { anonymized } = await adminRepo.anonymizeFormSubmissionsBySubject(subject);

  let accountDeleted = false;
  if (subject.developerAccountId) {
    const developerRepo = await getDeveloperRepository();
    accountDeleted = await developerRepo.deleteDeveloperAccount(subject.developerAccountId);
  }

  return { anonymizedSubmissions: anonymized, accountDeleted };
}
