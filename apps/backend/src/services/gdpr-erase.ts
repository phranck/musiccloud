/**
 * @file GDPR erasure (MC-085, Art. 17). Authenticated self-service deletion
 * removes the developer account. Database cascades clear its identities,
 * email tokens, API-access requests and clients.
 */

import { getDeveloperRepository } from "../db/index.js";

/** What an erasure run actually removed. */
export interface EraseResult {
  /** Whether the explicitly identified developer account row was deleted. */
  accountDeleted: boolean;
}

/**
 * Erases an authenticated developer account. The caller owns the
 * authorization decision and must pass the account id from the verified
 * self-service session.
 *
 * @param developerAccountId - Authenticated account identifier to delete.
 * @returns Whether the account row existed and was deleted.
 */
export async function erasePersonalData(developerAccountId: string): Promise<EraseResult> {
  const developerRepo = await getDeveloperRepository();
  const accountDeleted = await developerRepo.deleteDeveloperAccount(developerAccountId);
  return { accountDeleted };
}
