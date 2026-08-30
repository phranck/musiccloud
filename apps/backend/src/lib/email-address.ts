/**
 * @file One answer to whether a string is usable as an email address.
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
