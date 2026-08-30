/**
 * @file GDPR personal-data export (MC-085, Art. 15/20): assembles everything
 * stored about a subject into one versioned JSON package — the developer
 * account (without secrets), its auth identities, and its registrations with
 * token metadata, never hashes and never the tokens themselves. An
 * account-less subject produces a minimal package containing only the
 * normalized subject.
 */

import type { ApiClient, ApiClientToken } from "../db/api-access-repository.js";
import type { DeveloperAccount, DeveloperIdentity } from "../db/developer-repository.js";
import { getApiAccessRepository, getDeveloperRepository } from "../db/index.js";

/** The person a GDPR access or portability request is about. */
export interface PersonalDataSubject {
  developerAccountId?: string;
  email: string;
}

/**
 * A token as the export carries it: when it was issued, used and revoked, and
 * the prefix that identifies it on screen. The hash is credential material
 * rather than the subject's personal data, so it stays out.
 */
export interface ExportedApiClientToken {
  id: string;
  clientId: string;
  tokenPrefix: string;
  status: string;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
  rotatedFromTokenId: string | null;
}

/** A client plus its issued tokens' metadata, as included in the export. */
export interface ExportedApiClient extends ApiClient {
  tokens: ExportedApiClientToken[];
}

/**
 * Projects a stored token onto the fields the export is allowed to carry.
 *
 * The list is written out rather than subtracted from the row, because a
 * subtraction exports whatever the row gains next. That is how the hash and
 * the token itself came to travel in this package in the first place.
 *
 * @param token - The stored token.
 * @returns Only the metadata fields named above.
 */
function toExportedToken(token: ApiClientToken): ExportedApiClientToken {
  return {
    id: token.id,
    clientId: token.clientId,
    tokenPrefix: token.tokenPrefix,
    status: token.status,
    createdAt: token.createdAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    rotatedFromTokenId: token.rotatedFromTokenId,
  };
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
  const clients = await apiAccessRepo.listApiClientsByDeveloperAccount(subject.developerAccountId);
  const clientsWithTokens: ExportedApiClient[] = [];
  for (const client of clients) {
    const tokens = await apiAccessRepo.listApiClientTokensByClient(client.id);
    clientsWithTokens.push({ ...client, tokens: tokens.map(toExportedToken) });
  }
  pkg.apiAccess = { clients: clientsWithTokens };

  return pkg;
}
