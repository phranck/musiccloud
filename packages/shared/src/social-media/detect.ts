/**
 * @file How an address is sorted into a platform: by its host
 * ({@link detectPlatformFromUrl}), as a whole address a person typed
 * ({@link classifyProfileLink}, {@link detectProfilePlatform}), and as a bare
 * fediverse handle ({@link isFediverseHandle}).
 */

import { normalizeSocialMediaValue } from "./normalizers.js";
import { type SocialMediaLink, type SocialPlatformKey, WEBSITE_PLATFORM } from "./platforms.js";
import {
  isFacebookHost,
  isLinkedinHost,
  isPinterestHost,
  isTumblrHost,
  isXHost,
  isXingHost,
  stripTrailingSlash,
  stripWww,
  tryParseUrl,
} from "./url-helpers.js";

/** The platform each known host belongs to, looked up after `www.` is removed. */
const DOMAIN_TO_PLATFORM: Record<string, SocialPlatformKey> = {
  "instagram.com": "instagram",
  "facebook.com": "facebook",
  "fb.com": "facebook",
  "threads.net": "threads",
  "threads.com": "threads",
  "tiktok.com": "tiktok",
  "youtube.com": "youtube",
  "youtu.be": "youtube",
  "twitch.tv": "twitch",
  "x.com": "x",
  "twitter.com": "x",
  "bsky.app": "bluesky",
  "linkedin.com": "linkedin",
  "xing.com": "xing",
  "pin.it": "pinterest",
  "patreon.com": "patreon",
  "tumblr.com": "tumblr",
  "mixcloud.com": "mixcloud",
  "soundcloud.com": "soundcloud",
  "podcasts.apple.com": "applepodcasts",
  "open.spotify.com": "spotify",
  "spotify.com": "spotify",
  "wa.me": "whatsapp",
  "whatsapp.com": "whatsapp",
  "signal.me": "signal",
  "signal.group": "signal",
  "discord.gg": "discord",
  "discord.com": "discord",
  "discordapp.com": "discord",
  "github.com": "github",
  "gist.github.com": "github",
  "gitlab.com": "gitlab",
  "codeberg.org": "codeberg",
};

/**
 * Puts `https://` in front of an address that carries no scheme.
 *
 * People write `xing.com/profile/somebody` far more often than they write the
 * scheme, and both halves of sorting an address have to read the same string
 * for that to work.
 *
 * @param input - An address, trimmed.
 * @returns The address with a scheme.
 */
function withHttpsScheme(input: string): string {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

/**
 * Infers a social media platform from a URL string.
 *
 * Returns `null` when the host does not match any known platform or the input
 * cannot be parsed as a URL.
 *
 * @param input - A URL string (with or without protocol prefix).
 * @returns The matching `SocialPlatformKey`, or `null` if unrecognized.
 */
export function detectPlatformFromUrl(input: string): SocialPlatformKey | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const url = tryParseUrl(withHttpsScheme(trimmed));
  if (!url) return null;

  const host = stripWww(url.hostname);

  // Direct domain match
  const direct = DOMAIN_TO_PLATFORM[host];
  if (direct) return direct;

  if (isFacebookHost(host)) return "facebook";
  if (isLinkedinHost(host)) return "linkedin";
  if (isXingHost(host)) return "xing";
  if (isXHost(host)) return "x";
  if (isTumblrHost(host)) return "tumblr";

  if (isPinterestHost(host)) return "pinterest";

  // Mastodon heuristic: path starts with /@ or /web/@
  const path = stripTrailingSlash(url.pathname);
  if (path.startsWith("/@") || path.startsWith("/web/@")) return "mastodon";

  return null;
}

/**
 * `user@instance.tld`, with or without the leading `@`, being how a fediverse
 * address is written where it is not written as a link.
 */
const FEDIVERSE_HANDLE = /^@?[^@\s/]+@[^@\s/]+\.[^@\s/]+$/;

/**
 * Sorts one address a person typed into the service it belongs to.
 *
 * Somebody giving their address should not first have to say what kind it is.
 * The list of services and the shapes their addresses take is already here, so
 * the sorting is ours to do rather than theirs.
 *
 * An address on none of the known services is a website, which is a service in
 * its own right here rather than a leftover.
 *
 * @param input - What the person typed, with or without a scheme.
 * @returns The platform key and the canonical address, or `null` when the input
 *   is not an address at all.
 */
export function classifyProfileLink(input: string): SocialMediaLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // A fediverse handle is answered before anything else, because it carries no
  // scheme and putting one in front of it makes the part before the second `@`
  // into userinfo: `@kim@chaos.social` would come out as a website on
  // `chaos.social` belonging to a user called `@kim`.
  if (FEDIVERSE_HANDLE.test(trimmed)) {
    const handleUrl = normalizeSocialMediaValue("mastodon", trimmed);
    if (handleUrl) return { platform: "mastodon", url: handleUrl };
  }

  // Where the host named a service, the normalizer is handed the same address
  // the detection read rather than the one it was typed as. Without that,
  // `xing.com/profile/somebody` is recognized and then refused, because every
  // normalizer parses a URL and falls through to its bare-handle branch when
  // there is no scheme to parse.
  const platform = detectPlatformFromUrl(trimmed);
  const value = platform ? withHttpsScheme(trimmed) : trimmed;
  const url = normalizeSocialMediaValue(platform ?? WEBSITE_PLATFORM, value);
  return url ? { platform: platform ?? WEBSITE_PLATFORM, url } : null;
}

/**
 * Whether an address is a bare fediverse handle such as `@kim@chaos.social`.
 *
 * A handle names an instance and a person and stops there, so it cannot say
 * which fediverse service is running on that instance. Mastodon, Pixelfed and
 * Friendica handles are written identically, and {@link detectProfilePlatform}
 * answers Mastodon for all three because that is the common case.
 *
 * A caller that lets somebody name the service themselves asks this first, so a
 * handle fills an empty choice without overruling one that was made.
 *
 * @param input - What the person typed.
 * @returns `true` for `user@instance` and `@user@instance`.
 */
export function isFediverseHandle(input: string): boolean {
  return FEDIVERSE_HANDLE.test(input.trim());
}

/**
 * Names the service an address belongs to, or nothing where it names none.
 *
 * The same answer {@link classifyProfileLink} gives, reported the way a form
 * needs it. That function falls back to `website` for anything it does not
 * recognize, which is right when the answer has to be something. A control
 * offering a platform to pick by hand needs the opposite: it has to know when
 * the address said nothing, so it can leave the choice somebody made standing.
 *
 * Reach for this rather than {@link detectPlatformFromUrl} anywhere a person
 * types an address. That one reads a URL and knows a service by its host, so it
 * cannot see a fediverse handle: the instance is somebody's own domain and the
 * `@user@` in front of it parses as URL userinfo.
 *
 * @param input - What the person typed, with or without a scheme.
 * @returns The platform key, or `null` where the address names no particular
 *   service and where it is not an address at all.
 */
export function detectProfilePlatform(input: string): SocialPlatformKey | null {
  const classified = classifyProfileLink(input);
  if (!classified || classified.platform === WEBSITE_PLATFORM) return null;
  return classified.platform;
}
