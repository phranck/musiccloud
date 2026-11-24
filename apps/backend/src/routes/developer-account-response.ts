/**
 * @file The account payload every developer portal route answers with, and the
 * choice of which of an account's pictures is shown.
 *
 * `developer-auth.ts` re-exports everything here, so imports from there keep
 * working. `developer-github.ts` and `developer-profile.ts` use it as well.
 */
import type { DeveloperAccount } from "../db/developer-repository.js";

/**
 * Shapes an internal {@link DeveloperAccount} row into the public account
 * payload returned by `/signup`, `/login` and `/me`. Centralized so the
 * endpoints cannot drift apart (the portal store assumes one shape) and so the
 * `passwordHash` field is *never* serialized to the client.
 *
 * @param account - row as returned by the developer repository.
 * @param tierName - Display name of the account's assigned tier, or `null`.
 *   Only `/me` resolves it (the portal renders every protected page from a
 *   fresh `/me`); the signup/login/OAuth responses pass the default `null`.
 * @returns The wire-level account object: `emailVerifiedAt` is collapsed to the
 *   boolean `emailVerified`, and `passwordHash` to the boolean `hasPassword`.
 *   The portal reads `hasPassword` to decide whether `/delete-account` needs a
 *   password confirmation, which a GitHub-only account cannot give.
 *   `portalAccessGrantedAt` is collapsed to the boolean `portalAccess`, which
 *   the portal's gate asks while the portal is closed, and `createdAt` (epoch
 *   ms) is rendered as an ISO string for JSON-safe transport. The raw
 *   `passwordHash`, `status` and `updatedAt`/`lastLoginAt` are intentionally
 *   omitted.
 */
export function buildAccountResponse(account: DeveloperAccount, tierName: string | null = null) {
  return {
    id: account.id,
    email: account.email,
    emailVerified: account.emailVerifiedAt !== null,
    hasPassword: account.passwordHash !== null,
    displayName: account.displayName,
    pendingEmail: account.pendingEmail,
    firstName: account.firstName,
    lastName: account.lastName,
    avatarUrl: resolveAvatarUrl(account),
    providerAvatarUrl: account.avatarUrl,
    uploadedAvatarUrl: account.uploadedAvatarUrl,
    gravatarUrl: account.gravatarUrl,
    avatarSource: account.avatarSource,
    technicalContactEmail: account.technicalContactEmail,
    portalAccess: account.portalAccessGrantedAt !== null,
    tierName,
    createdAt: new Date(account.createdAt).toISOString(),
  };
}

/** What `avatarSource` may hold, which is also what the check constraint allows. */
export const AvatarSource = {
  /** The picture an identity provider handed over, which today means GitHub. */
  Provider: "provider",
  /** The picture the developer uploaded. */
  Upload: "upload",
  /** The picture Gravatar answered with. */
  Gravatar: "gravatar",
} as const;

/** One of the sources in {@link AvatarSource}. */
export type AvatarSourceValue = (typeof AvatarSource)[keyof typeof AvatarSource];

/**
 * Whether a value from a request body names one of the three sources.
 *
 * @param value - What the body carried.
 * @returns Whether it is a source the column accepts.
 */
export function isAvatarSource(value: unknown): value is AvatarSourceValue {
  return typeof value === "string" && (Object.values(AvatarSource) as string[]).includes(value);
}

/**
 * The picture that is actually shown.
 *
 * A developer may hold three at once and chooses between them. Where they have
 * not chosen, or where the one they chose is gone, the first of the three that
 * exists is shown rather than nothing: an account with a picture should not
 * look like one without.
 *
 * @param account - The account as stored.
 * @returns The picture to show, or `null` where there is none.
 */
export function resolveAvatarUrl(account: DeveloperAccount): string | null {
  const chosen =
    account.avatarSource === AvatarSource.Upload
      ? account.uploadedAvatarUrl
      : account.avatarSource === AvatarSource.Gravatar
        ? account.gravatarUrl
        : account.avatarSource === AvatarSource.Provider
          ? account.avatarUrl
          : null;

  return chosen ?? account.uploadedAvatarUrl ?? account.gravatarUrl ?? account.avatarUrl;
}
