/**
 * @file Value resolution for the email variable catalog (MC-081).
 *
 * The shared catalog (`EMAIL_VARIABLES` in `@musiccloud/shared`) defines which
 * variable NAMES exist and when they are available; this module resolves their
 * VALUES on the server: system-scope variables from environment configuration,
 * recipient-scope variables from the addressee. Context-scope values are never
 * resolved here — they are supplied by the action occurrence itself (see
 * `triggerEmailAction` in `email-actions.ts`).
 */

import { EmailRecipientKind, getEmailVariableMeta } from "@musiccloud/shared";

import { requireEnv } from "../lib/env.js";

/**
 * The addressee of a system mail, discriminated by recipient kind. Carries
 * exactly the fields the recipient-scope variables are resolved from; callers
 * hand in what they already have (request body, account row) instead of the
 * resolver reaching into persistence.
 */
export type EmailActionRecipient =
  | {
      kind: typeof EmailRecipientKind.AdminUser;
      /** Admin's login/display name (`admin_users.username`). */
      username: string;
      /** Admin's email address. */
      email: string;
      /** Admin's role string (e.g. `"admin"`). */
      role: string;
    }
  | {
      kind: typeof EmailRecipientKind.DeveloperAccount;
      /** Developer account's email address (`developer_accounts.email`). */
      email: string;
      /** Optional display name (`developer_accounts.display_name`); `username` falls back to the email local part. */
      displayName?: string | null;
    };

/**
 * Resolves every system-scope catalog variable from the server environment.
 * Fails fast (via {@link requireEnv}) when a URL env var is missing, so a
 * misconfigured deployment surfaces at send time instead of shipping mails
 * with broken links.
 *
 * @returns `websiteUrl` (PUBLIC_URL), `dashboardUrl` (DASHBOARD_URL),
 *   `developerUrl` (DEVELOPER_URL), and `loginUrl` (dashboard login page).
 */
export function resolveSystemVariables(): Record<string, string> {
  const dashboardUrl = requireEnv("DASHBOARD_URL");
  return {
    websiteUrl: requireEnv("PUBLIC_URL"),
    dashboardUrl,
    developerUrl: requireEnv("DEVELOPER_URL"),
    loginUrl: `${dashboardUrl}/login`,
  };
}

/**
 * Resolves the recipient-scope catalog variables for an addressee. Which keys
 * come back depends on the recipient kind: admin users carry `role`,
 * developer accounts do not (the catalog's `recipientKinds` mirrors this).
 *
 * @param recipient - The addressee, discriminated by `kind`.
 * @returns The resolvable recipient variables (`username`, `email`, and for
 *   admin users `role`).
 */
export function resolveRecipientVariables(recipient: EmailActionRecipient): Record<string, string> {
  if (recipient.kind === EmailRecipientKind.AdminUser) {
    return { username: recipient.username, email: recipient.email, role: recipient.role };
  }
  return {
    username: recipient.displayName || emailLocalPart(recipient.email),
    email: recipient.email,
  };
}

/**
 * Extracts the local part of an email address (`dev.jane@example.com` →
 * `dev.jane`) as the developer-account `username` fallback when no display
 * name is set.
 */
function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

/**
 * Fills gaps in an already-resolved variable set with the catalog's sample
 * values — used by test sends, where system + recipient values are real but
 * context variables (e.g. `inviteUrl`) have no live flow to mint them.
 *
 * @param base - Already-resolved variables; never overwritten.
 * @param names - The variable names the template uses (auto-extracted).
 * @returns A new record: `base` plus a `sampleValue` for every missing name
 *   the catalog knows. Unknown names stay unfilled, so their `{{var}}`
 *   placeholder remains visible in the delivered test mail as feedback.
 */
export function applySampleValues(base: Record<string, string>, names: readonly string[]): Record<string, string> {
  const filled = { ...base };
  for (const name of names) {
    if (name in filled) continue;
    const meta = getEmailVariableMeta(name);
    if (meta) filled[name] = meta.sampleValue;
  }
  return filled;
}
