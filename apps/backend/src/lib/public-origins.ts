/**
 * @file The hosts this deployment is allowed to send a visitor to.
 *
 * A URL an operator types into a form and that a payment provider later
 * redirects a customer to is a redirect we host for whoever set it. It is
 * therefore checked against the origins this deployment already declares,
 * rather than against a pattern, because a pattern says a URL is well formed
 * and nothing about where it goes.
 */

/**
 * The origins that belong to us, from the configuration that already names
 * them for CORS and for the links in outgoing mail.
 *
 * Read on every call rather than cached, so a test can change the environment
 * and a deployment does not depend on module load order.
 *
 * @returns The allowed origins, lowercased, without duplicates.
 */
export function allowedPublicOrigins(): string[] {
  const raw = [
    process.env.ALLOWED_ORIGINS,
    process.env.DEVELOPER_URL,
    process.env.DASHBOARD_URL,
    process.env.PUBLIC_URL,
  ]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const origins = new Set<string>();
  for (const value of raw) {
    try {
      origins.add(new URL(value).origin.toLowerCase());
    } catch {
      // A malformed entry is configuration noise rather than a reason to fail
      // the request. It simply cannot match anything.
    }
  }
  return [...origins];
}

/**
 * Whether a URL points at one of our own origins over https.
 *
 * Plain http is refused even where it parses, because a customer returning
 * from a payment must not be sent somewhere the connection is readable.
 *
 * @param value - The URL as it was entered.
 * @returns `true` when the URL is https and its origin is one of ours.
 */
export function isAllowedPublicUrl(value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return allowedPublicOrigins().includes(parsed.origin.toLowerCase());
}
