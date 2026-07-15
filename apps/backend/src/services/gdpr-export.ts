/**
 * @file GDPR personal-data export (MC-085, Art. 15/20): assembles everything
 * stored about a subject into one versioned JSON package — the developer
 * account (without secrets), its auth identities, and API-access
 * requests/clients with token METADATA (never hashes). An account-less
 * subject produces a minimal package containing only the normalized subject.
 */

import type { ApiAccessRequest, ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import type { DeveloperAccount, DeveloperIdentity } from "../db/developer-repository.js";
import { getApiAccessRepository, getDeveloperRepository } from "../db/index.js";

/** The person a GDPR access or portability request is about. */
export interface PersonalDataSubject {
  developerAccountId?: string;
  email: string;
}

/** A client plus its issued tokens' metadata, as included in the export. */
export interface ExportedApiClient extends ApiClient {
  tokens: ApiClientToken[];
}

/** The versioned export package handed to the subject as a JSON download. */
export interface PersonalDataExport {
  version: 1;
  exportedAt: string;
  subject: PersonalDataSubject;
  /** The account row without `passwordHash`; absent for account-less subjects. */
  account?: Omit<DeveloperAccount, "passwordHash">;
  identities?: DeveloperIdentity[];
  apiAccess?: {
    requests: ApiAccessRequest[];
    clients: ExportedApiClient[];
  };
}

/**
 * Builds the subject's complete personal-data package.
 *
 * @param subject - Account holder (both fields) or account-less submitter
 *   (email only). Account sections are collected only when
 *   `developerAccountId` is present.
 * @returns The versioned export package.
 */
export async function buildPersonalDataExport(subject: PersonalDataSubject): Promise<PersonalDataExport> {
  const pkg: PersonalDataExport = {
    version: 1,
    exportedAt: new Date().toISOString(),
    subject,
  };

  if (!subject.developerAccountId) return pkg;

  const developerRepo = await getDeveloperRepository();
  const account = await developerRepo.findDeveloperAccountById(subject.developerAccountId);
  if (account) {
    // The bcrypt hash is a secret, not the subject's personal data — strip it.
    const { passwordHash: _passwordHash, ...accountWithoutSecret } = account;
    pkg.account = accountWithoutSecret;
    pkg.identities = await developerRepo.listDeveloperIdentitiesByAccount(account.id);
  }

  const apiAccessRepo = await getApiAccessRepository();
  const requests = await apiAccessRepo.listApiAccessRequestsByDeveloperAccount(subject.developerAccountId);
  const clients = await apiAccessRepo.listApiClientsByDeveloperAccount(subject.developerAccountId);
  const clientsWithTokens: ExportedApiClient[] = [];
  for (const client of clients) {
    clientsWithTokens.push({ ...client, tokens: await apiAccessRepo.listApiClientTokensByClient(client.id) });
  }
  pkg.apiAccess = { requests, clients: clientsWithTokens };

  return pkg;
}
