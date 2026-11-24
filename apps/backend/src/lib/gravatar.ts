/**
 * @file One answer to whether an address is a Gravatar picture, and the lookup
 * that asks Gravatar for the picture of an address.
 *
 * The admin avatar route, the developer profile route and the developer
 * Gravatar lookup all store an address as a picture and render it later, so
 * all three ask this one question. Checking the host is what keeps that column
 * from becoming a request to somewhere else entirely. {@link findGravatar}
 * answers the developer Gravatar lookup in `developer-profile.ts`.
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

/** Where the direct lookup asks whether an address has a picture of its own. */
const GRAVATAR_PREFIX = "https://www.gravatar.com/avatar/";

/** Where a profile is asked for, which is the second place a picture can be. */
const GRAVATAR_PROFILE = "https://gravatar.com";

/** How long to wait for Gravatar before giving up on the lookup. */
const GRAVATAR_TIMEOUT_MS = 4_000;

/** How wide a Gravatar is asked for, which is what the portal draws it at. */
const GRAVATAR_SIZE = 256;

/**
 * Finds the picture Gravatar holds for one hashed address.
 *
 * Two questions, because Gravatar answers them differently. The first asks
 * whether that address has a picture of its own, with `d=404` so the answer is
 * a yes or a no rather than a placeholder image. The second asks the profile,
 * because an account holds several addresses and assigns its picture to one of
 * them: an address that is on the account without being the one the picture
 * hangs on answers no to the first question whilst its owner can see their own
 * face on gravatar.com. Asking only the first reports "no Gravatar" to somebody
 * who plainly has one.
 *
 * @param hash - The SHA-256 of the lowercased address.
 * @returns The picture's address, or `null` where there is none.
 * @throws When Gravatar could not be reached, which is not the same as no.
 */
export async function findGravatar(hash: string): Promise<string | null> {
  const direct = `${GRAVATAR_PREFIX}${hash}?s=${GRAVATAR_SIZE}`;
  const response = await fetch(`${direct}&d=404`, {
    method: "HEAD",
    signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
  });
  if (response.ok) return direct;
  if (response.status !== 404) throw new Error(`gravatar answered ${response.status}`);

  const profile = await fetch(`${GRAVATAR_PROFILE}/${hash}.json`, {
    signal: AbortSignal.timeout(GRAVATAR_TIMEOUT_MS),
  });
  if (profile.status === 404) return null;
  if (!profile.ok) throw new Error(`gravatar answered ${profile.status}`);

  const payload = (await profile.json()) as { entry?: { thumbnailUrl?: unknown }[] };
  const thumbnail = payload.entry?.[0]?.thumbnailUrl;

  // The address comes from Gravatar rather than from this code, so it is
  // checked before it is stored and rendered.
  if (!isGravatarAddress(thumbnail)) return null;

  const parsed = new URL(thumbnail);
  parsed.searchParams.set("s", String(GRAVATAR_SIZE));
  return parsed.toString();
}
