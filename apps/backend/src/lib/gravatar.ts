/**
 * @file One answer to whether an address is a Gravatar picture.
 *
 * The admin avatar route, the developer profile route and the developer
 * Gravatar lookup all store an address as a picture and render it later, so
 * all three ask this one question. Checking the host is what keeps that column
 * from becoming a request to somewhere else entirely.
 */

/**
 * The hosts a Gravatar picture is served from.
 *
 * `www.gravatar.com` is the host this code and the dashboard build a picture
 * address on. `gravatar.com` and the numbered hosts such as `2.gravatar.com`
 * are what a Gravatar profile answers with. Every path on these hosts is
 * Gravatar's, so the path is not checked.
 */
const GRAVATAR_HOST = /^(?:www\.|[0-9]+\.)?gravatar\.com$/;

/**
 * Whether a value may be stored and rendered as a Gravatar picture.
 *
 * The value is parsed rather than compared as text, because a string that
 * starts with a Gravatar address can still lead somewhere else, for example
 * through credentials in front of another host. It has to be `https:`, carry
 * no credentials and no port, and name one of the hosts in
 * {@link GRAVATAR_HOST}.
 *
 * @param value - The address from a request body or from Gravatar's answer.
 * @returns Whether it may be stored as a Gravatar picture.
 */
export function isGravatarAddress(value: unknown): value is string {
  if (typeof value !== "string") return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.username === "" &&
    parsed.password === "" &&
    parsed.port === "" &&
    GRAVATAR_HOST.test(parsed.hostname)
  );
}
