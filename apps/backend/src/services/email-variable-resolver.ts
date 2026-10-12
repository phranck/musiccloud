/**
 * @file Value resolution for the email variable catalog (MC-081).
 *
 * The shared catalog (`EMAIL_VARIABLES` in `@musiccloud/shared`) defines which
 * variable NAMES exist and when they are available. This module resolves their
 * VALUES on the server: system-scope variables from environment configuration,
 * recipient-scope variables from the addressee. Context-scope values are never
 * resolved here, because the action occurrence supplies them (see
 * `triggerEmailAction` in `email-actions.ts`).
 *
 * The return types are derived from the catalog. The bind-time gate allows a
 * template every name the catalog lists for its action, and the send-time gate
 * checks the names resolved here, so a catalog entry this module does not
 * resolve would pass the first and fail the second. Deriving the types turns
 * that into a compile error in this file.
 */

import {
  EmailRecipientKind,
  type EmailRecipientKindValue,
  getEmailVariableMeta,
  type RecipientEmailVariableName,
  type SystemEmailVariableName,
} from "@musiccloud/shared";

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
 * @returns One value per system-scope catalog name: `websiteUrl`
 *   (`PUBLIC_URL`), `dashboardUrl` (`DASHBOARD_URL`), `developerUrl`
 *   (`DEVELOPER_URL`) and `loginUrl` (the dashboard login page).
 */
export function resolveSystemVariables(): Record<SystemEmailVariableName, string> {
  const dashboardUrl = requireEnv("DASHBOARD_URL");
  return {
    websiteUrl: requireEnv("PUBLIC_URL"),
    dashboardUrl,
    developerUrl: requireEnv("DEVELOPER_URL"),
    loginUrl: `${dashboardUrl}/login`,
  };
}

/**
 * One resolver per recipient kind, each returning exactly the recipient-scope
 * names the catalog lists for that kind. A recipient kind or a recipient entry
 * added to the catalog without a value here fails to compile.
 */
const RECIPIENT_VARIABLE_RESOLVERS: {
  [Kind in EmailRecipientKindValue]: (
    recipient: Extract<EmailActionRecipient, { kind: Kind }>,
  ) => Record<RecipientEmailVariableName<Kind>, string>;
} = {
  [EmailRecipientKind.AdminUser]: (recipient) => ({
    username: recipient.username,
    email: recipient.email,
    role: recipient.role,
  }),
  [EmailRecipientKind.DeveloperAccount]: (recipient) => ({
    username: recipient.displayName || emailLocalPart(recipient.email),
    email: recipient.email,
  }),
};

/**
 * Resolves the recipient-scope catalog variables for an addressee. Which keys
 * come back depends on the recipient kind, as the catalog's `recipientKinds`
 * says: admin users carry `role`, developer accounts do not.
 *
 * @param recipient - The addressee, discriminated by `kind`.
 * @returns The recipient variables the catalog lists for that kind.
 */
export function resolveRecipientVariables(recipient: EmailActionRecipient): Record<string, string> {
  // The table is typed per kind. Indexing it with a union loses the pairing
  // between the kind and its recipient, which the cast restores.
  const resolve = RECIPIENT_VARIABLE_RESOLVERS[recipient.kind] as (
    recipient: EmailActionRecipient,
  ) => Record<string, string>;
  return resolve(recipient);
}

/**
 * Extracts the local part of an email address (`dev.jane@example.com` gives
 * `dev.jane`) as the developer-account `username` fallback when no display
 * name is set.
 */
function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at === -1 ? email : email.slice(0, at);
}

/**
 * Fills gaps in an already-resolved variable set with the catalog's sample
 * values. Test sends use it, because their system and recipient values are
 * real while context variables (e.g. `inviteUrl`) have no live flow to mint
 * them.
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
