/**
 * @file One answer to whether a string is usable as an email address, and to
 * the form a developer's address is stored in.
 *
 * The check is deliberately shallow. An address is only ever proved by sending
 * to it, so a stricter pattern would reject valid addresses without making the
 * accepted ones any more real. What this rules out is the shapes that cannot be
 * an address at all, and a length past what SMTP carries.
 */

/** The longest reverse-path SMTP accepts, per RFC 5321 section 4.5.3.1.3. */
export const MAX_EMAIL_LENGTH = 254;

/**
 * Whether a string could be an email address: one `@`, something either side
 * of it, a dot in the domain, and no whitespace anywhere.
 *
 * @param value - The candidate, already trimmed by the caller.
 * @returns `true` when the shape is usable, `false` otherwise.
 */
export function isValidEmailAddress(value: string): boolean {
  if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [localPart, domain] = parts as [string, string];
  if (localPart.length === 0 || domain.length === 0) return false;
  return domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

/**
 * The form a developer's sign-in address is stored and looked up in, or `null`
 * where the value cannot be an address.
 *
 * `developer_accounts.email` is compared exactly, by the lookup and by its
 * unique index, so an address only finds its account when it was written in
 * the same form it is read in. Every route that reads or writes one passes it
 * through here: sign-up, sign-in, the reset request, the address change,
 * GitHub sign-in, the Gravatar lookup, the GDPR export and the admin edit. An
 * address stored in another form locks its owner out and lets a second account
 * take the same mailbox.
 *
 * @param raw - The value from a request body, a query or a provider, untrimmed.
 * @returns The trimmed, lowercased address, or `null` when the value is not a
 *   string or fails {@link isValidEmailAddress}.
 */
export function normalizeEmailAddress(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  return isValidEmailAddress(email) ? email : null;
}

/**
 * The error code for an address that cannot be one.
 *
 * It is its own code rather than the generic `MC-REQ-0001`, because the portal
 * decides from the code which field the message belongs under, and a plain
 * `INVALID_EMAIL` would not survive: `normalizeApiErrorPayload` replaces any
 * code outside the `MC-` scheme with the one that matches the status.
 */
export const INVALID_EMAIL_CODE = "MC-REQ-0006";

/** The error code for an address another developer account already holds. See {@link INVALID_EMAIL_CODE}. */
export const EMAIL_TAKEN_CODE = "MC-REQ-0007";
