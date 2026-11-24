/**
 * @file Finds the picture of a sponsor from the addresses they gave.
 *
 * Ported from lmaa.space `apps/backend/src/services/sponsor-avatar.ts`.
 * Adapted: every request goes through `fetchWithTimeout`, which checks each
 * hop and every connection against private and reserved addresses, in place of
 * lmaa's `isPublicFetchTarget` and plain `fetch`; the `https` requirement lmaa
 * passed as `httpsOnly` is checked here before the request; lookup bodies are
 * read under a byte budget; `isExternalUrl` from lmaa's `validate.ts` lives
 * here as {@link isExternalUrl}; failures are logged through `log.deviation`
 * with the host and the reason.
 */
import { type SocialMediaLinks, WEBSITE_PLATFORM } from "@musiccloud/shared";

import { hostForLog } from "../lib/external-resource.js";
import { readJsonWithLimit } from "../lib/http-body.js";
import { fetchWithTimeout } from "../lib/infra/fetch.js";
import { log } from "../lib/infra/logger.js";
import { fetchPreviewImage, type PreviewIntent } from "../lib/preview-image.js";

/** How long a lookup at somebody else's instance may take. */
const LOOKUP_TIMEOUT_MS = 5000;

/**
 * The largest lookup answer read, in bytes. A Mastodon account or a Bluesky
 * profile is a few kilobytes; anything past this is not one.
 */
const MAX_LOOKUP_JSON_BYTES = 256 * 1024;

/** The longest picture address kept, in characters. */
const MAX_PICTURE_URL_LENGTH = 500;

/** The only scheme a lookup is sent over and a picture address may use. */
const HTTPS_PROTOCOL = "https:";

/** The component name every deviation of this module is logged under. */
const LOG_COMPONENT = "SponsorAvatar";
/** The error code of a recoverable deviation, as other backend services log it. */
const LOG_ERROR_CODE = "MC-SYS-0001";

/** Host names that always mean this machine. */
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
/** Name suffixes that only resolve inside a private network. */
const INTERNAL_NAME_SUFFIXES = [".internal", ".local"] as const;

/**
 * The services that hand out a portrait when asked directly.
 *
 * Measured on 2026-08-23: a Mastodon instance answers through its account
 * lookup, Bluesky through its public profile API, and GitHub and Codeberg both
 * serve a picture at the account's own address with `.png` appended. GitLab's
 * public user lookup answers a username with an empty list, so it is not here.
 */
const DIRECT_LOOKUPS: Readonly<Record<string, (address: string) => Promise<string | null>>> = {
  mastodon: lookupMastodonAvatar,
  bluesky: lookupBlueskyAvatar,
  github: lookupForgeAvatar,
  codeberg: lookupForgeAvatar,
};

/**
 * The order the addresses are tried in, from the closest likeness to the
 * loosest.
 *
 * A service that answers directly comes first, because what it returns is a
 * portrait of the person. Every other address is read as a page, which usually
 * yields the picture the profile itself shows. A website comes last: it has no
 * portrait, only its own mark, which is the right answer for somebody who gave
 * nothing else and the wrong one for somebody who did.
 *
 * Within each of the three groups the addresses keep the order they were
 * entered in, so somebody who gave two websites is read from the one they put
 * first.
 *
 * @param socialMedia - The sponsor's addresses, in the order they were entered.
 * @returns The same addresses in the order they are tried.
 */
function lookupOrder(socialMedia: SocialMediaLinks): SocialMediaLinks {
  const direct = socialMedia.filter((link) => Object.hasOwn(DIRECT_LOOKUPS, link.platform));
  const rest = socialMedia.filter(
    (link) => !Object.hasOwn(DIRECT_LOOKUPS, link.platform) && link.platform !== WEBSITE_PLATFORM,
  );
  const websites = socialMedia.filter((link) => link.platform === WEBSITE_PLATFORM);
  return [...direct, ...rest, ...websites];
}

/**
 * The profile picture behind one of a sponsor's addresses.
 *
 * Resolved on the server, so a visitor's browser never asks a foreign instance
 * for a picture.
 *
 * Every service is covered, including the ones nobody has heard of, because a
 * platform without an API of its own is still a page, and the preview reader
 * knows how to take a picture from a page. What it finds is whatever that
 * profile shows the world, which on most platforms is the portrait and on a
 * few is the platform's own banner. Whoever enters the sponsor sees the result
 * and can drop it.
 *
 * @param socialMedia - The sponsor's addresses, in the order they were entered.
 * @returns The address of the picture, or `null` when none could be resolved.
 */
export async function resolveSponsorAvatar(socialMedia: SocialMediaLinks): Promise<string | null> {
  for (const { platform, url } of lookupOrder(socialMedia)) {
    if (!url) continue;

    const direct = DIRECT_LOOKUPS[platform];
    // A profile is read for the picture it shows of the person; a website is
    // read for its own mark. The same reader answers both, so which of the two
    // it is looking for has to be said here.
    const avatar = direct
      ? await direct(url)
      : await lookupSiteImage(url, platform === WEBSITE_PLATFORM ? "site-mark" : "portrait");
    if (avatar) return avatar;
  }

  return null;
}

/**
 * Asks a Mastodon instance for the picture of one of its accounts.
 *
 * @param profileUrl - A canonical profile address such as `https://host/@name`.
 * @returns The address of the picture, or `null`.
 */
async function lookupMastodonAvatar(profileUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(profileUrl);
  } catch {
    return null;
  }

  const account = parsed.pathname.replace(/^\/@/, "");
  if (!account || account.includes("/")) return null;

  const lookupUrl = `${parsed.origin}/api/v1/accounts/lookup?acct=${encodeURIComponent(account)}`;
  const data = await fetchJson<{ avatar_static?: string; avatar?: string }>(lookupUrl);
  return pictureUrl(data?.avatar_static ?? data?.avatar);
}

/**
 * Asks Bluesky's public API for the picture of an account.
 *
 * @param profileUrl - A canonical profile address such as
 *   `https://bsky.app/profile/name.bsky.social`.
 * @returns The address of the picture, or `null`.
 */
async function lookupBlueskyAvatar(profileUrl: string): Promise<string | null> {
  const handle = profileUrl.replace(/^https:\/\/bsky\.app\/profile\//, "");
  if (!handle || handle.includes("/")) return null;

  const lookupUrl = `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handle)}`;
  const data = await fetchJson<{ avatar?: string }>(lookupUrl);
  return pictureUrl(data?.avatar);
}

/**
 * Asks a Gitea-style forge for the picture of one of its accounts.
 *
 * GitHub and Codeberg both serve it at the account's own address with `.png`
 * appended, and both answer without a credential. Verified on 2026-08-23:
 * `https://github.com/phranck.png` answers 200 with a JPEG, and
 * `https://codeberg.org/phranck.png` answers 200 with a PNG.
 *
 * @param profileUrl - A canonical profile address such as `https://host/name`.
 * @returns The address of the picture, or `null`.
 */
async function lookupForgeAvatar(profileUrl: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(profileUrl);
  } catch {
    return null;
  }

  const account = parsed.pathname.replace(/^\/+|\/+$/g, "");
  if (!account || account.includes("/")) return null;

  const candidate = `${parsed.origin}/${encodeURIComponent(account)}.png`;
  if (!isHttps(candidate)) return null;

  try {
    // Only the headers are needed. Whether the address answers with an image is
    // the whole question, and the picture itself is fetched later.
    const response = await fetchWithTimeout(candidate, { method: "HEAD", redirect: "follow" }, LOOKUP_TIMEOUT_MS);
    if (!response.ok) return null;
    if (!response.headers.get("content-type")?.startsWith("image/")) return null;
    return pictureUrl(candidate);
  } catch (error) {
    logLookupFailure(candidate, error);
    return null;
  }
}

/**
 * Takes the picture a page shows.
 *
 * The preview reader answers this question for any page: it reads the page's
 * own image, its icons and its manifest, measures every candidate and takes the
 * largest of the best kind. Pointed at a profile on any service, that is
 * usually the portrait the profile shows; pointed at a website, it is the
 * site's own mark. It needs to know nothing about the service, which is why it
 * covers the ones nobody has heard of.
 *
 * @param pageUrl - The address the sponsor gave.
 * @param intent - Whether the page is somebody's profile or their website,
 *   which decides whether the page's own picture or the site's mark is wanted.
 * @returns The address of the picture, or `null`.
 */
async function lookupSiteImage(pageUrl: string, intent: PreviewIntent): Promise<string | null> {
  try {
    const found = await fetchPreviewImage(pageUrl, { intent });
    return found ? pictureUrl(found.url) : null;
  } catch (error) {
    logLookupFailure(pageUrl, error);
    return null;
  }
}

/**
 * Reads JSON from a public HTTPS address.
 *
 * The address is checked before the request and redirects are refused, because
 * the host comes from what an operator pasted and may point anywhere.
 * `fetchWithTimeout` refuses a host that resolves to a private or reserved
 * address before any request leaves.
 *
 * @param url - The address to read.
 * @returns The parsed body, or `null` on any failure, including a body over
 *   {@link MAX_LOOKUP_JSON_BYTES}.
 */
async function fetchJson<T>(url: string): Promise<T | null> {
  if (!isHttps(url)) return null;

  try {
    const response = await fetchWithTimeout(
      url,
      { headers: { Accept: "application/json" }, redirect: "error" },
      LOOKUP_TIMEOUT_MS,
    );
    if (!response.ok) return null;
    return await readJsonWithLimit<T>(response, MAX_LOOKUP_JSON_BYTES);
  } catch (error) {
    logLookupFailure(url, error);
    return null;
  }
}

/**
 * Keeps an address only when a browser may safely load it as a picture.
 *
 * @param candidate - What the instance returned, which may be anything.
 * @returns The address, or `null` when it is not a public HTTPS one of at most
 *   {@link MAX_PICTURE_URL_LENGTH} characters.
 */
function pictureUrl(candidate: string | undefined): string | null {
  if (!candidate) return null;
  if (!isHttps(candidate)) return null;
  if (!isExternalUrl(candidate)) return null;
  return candidate.length <= MAX_PICTURE_URL_LENGTH ? candidate : null;
}

/**
 * Whether an address is an `https` one.
 *
 * @param url - Any address.
 * @returns `true` when it parses and its scheme is `https`.
 */
function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === HTTPS_PROTOCOL;
  } catch {
    return false;
  }
}

/**
 * Checks that a URL names an external host, lexically and without resolving it.
 *
 * Ported from lmaa.space `apps/backend/src/lib/validate.ts`. It refuses the
 * obvious internal names and private ranges by their spelling, for an address
 * that is stored rather than fetched now. Whatever later fetches the address
 * goes through `fetchWithTimeout`, which checks the resolved addresses.
 *
 * @param url - The address to check.
 * @returns `true` for an `http` or `https` address whose host is not local,
 *   private, link-local or an internal name.
 */
function isExternalUrl(url: string): boolean {
  try {
    const { hostname, protocol } = new URL(url);
    if (protocol !== "http:" && protocol !== HTTPS_PROTOCOL) return false;
    const bare = hostname.replace(/^\[|]$/g, "");
    if (LOCAL_HOSTNAMES.has(bare)) return false;
    // Private IPv4 ranges
    if (bare.startsWith("10.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(bare)) return false;
    if (bare.startsWith("192.168.")) return false;
    // Link-local + cloud metadata
    if (bare.startsWith("169.254.")) return false;
    // Private IPv6 ranges (ULA fc00::/7, link-local fe80::/10)
    if (/^f[cd]/i.test(bare)) return false;
    if (/^fe[89ab]/i.test(bare)) return false;
    // Internal hostnames
    if (INTERNAL_NAME_SUFFIXES.some((suffix) => bare.endsWith(suffix))) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Logs a failed lookup with the host and the reason, never the body.
 *
 * @param url - The address that was asked.
 * @param error - Why it failed, such as a refused private address.
 */
function logLookupFailure(url: string, error: unknown): void {
  log.deviation(
    {
      component: LOG_COMPONENT,
      errorCode: LOG_ERROR_CODE,
      operation: "sponsor_avatar_lookup",
      outcome: "address_skipped",
      host: hostForLog(url),
    },
    error,
  );
}
