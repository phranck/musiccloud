/**
 * @file The list of addresses somebody entered, as a request carries it and as
 * it is stored: the request schema of one link, the normalization of the whole
 * list with its rejected entries, and the lookup of one platform's address.
 */

import { normalizeSocialMediaValue } from "./normalizers.js";
import { SOCIAL_PLATFORM_KEYS, type SocialMediaLinks, type SocialPlatformKey } from "./platforms.js";
import { canonicalizePlatformKey, PLATFORM_SET } from "./url-helpers.js";

/** Longest address one link may carry: 500 characters. */
export const SOCIAL_MEDIA_URL_MAX_LENGTH = 500;

/**
 * The JSON schema of one address as a request carries it, for a route's Ajv.
 *
 * The platform is one of {@link SOCIAL_PLATFORM_KEYS} or `twitter`, which
 * {@link normalizeSocialMediaLinks} reads as `x`. Whether the address fits its
 * platform is checked in code by that function, because a pattern cannot.
 */
export const SOCIAL_MEDIA_LINK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["platform", "url"],
  properties: {
    platform: { type: "string", enum: [...SOCIAL_PLATFORM_KEYS, "twitter"] },
    url: { type: "string", maxLength: SOCIAL_MEDIA_URL_MAX_LENGTH },
  },
} as const;

/**
 * One address {@link normalizeSocialMediaLinks} refused.
 *
 * @property index - Its position in the list as given.
 * @property platform - The platform it claimed.
 * @property url - The address as given.
 */
export interface RejectedSocialMediaLink {
  index: number;
  platform: string;
  url: string;
}

/**
 * Turns the addresses somebody entered into a normalized list.
 *
 * An entry naming a platform nobody knows, or carrying an address that does not
 * fit the platform it claims, is reported as rejected rather than dropped in
 * silence. An empty address is skipped, because a cleared field is not a
 * mistake. The same address given twice for the same platform is kept once,
 * while two different addresses for that platform both stay.
 *
 * @param given - The addresses as given, platform and address each.
 * @returns The accepted addresses in the order they were given, and every
 *   rejected one. The list may be stored only while `rejected` is empty.
 */
export function normalizeSocialMediaLinks(given: readonly { platform: string; url: string }[]): {
  links: SocialMediaLinks;
  rejected: RejectedSocialMediaLink[];
} {
  const links: SocialMediaLinks = [];
  const rejected: RejectedSocialMediaLink[] = [];
  const seen = new Set<string>();

  given.forEach((entry, index) => {
    const platform = canonicalizePlatformKey(entry.platform);

    if (!PLATFORM_SET.has(platform)) {
      rejected.push({ index, platform: entry.platform, url: entry.url });
      return;
    }

    if (!entry.url) return;

    const url = normalizeSocialMediaValue(platform, entry.url);
    if (!url || url.length > SOCIAL_MEDIA_URL_MAX_LENGTH) {
      rejected.push({ index, platform: entry.platform, url: entry.url });
      return;
    }

    const identity = `${platform} ${url}`;
    if (seen.has(identity)) return;
    seen.add(identity);

    links.push({ platform: platform as SocialPlatformKey, url });
  });

  return { links, rejected };
}

/**
 * The first address given for one platform.
 *
 * For the places that ask about one particular network, such as the avatar
 * lookup wanting the Mastodon account. Where somebody gave several addresses
 * for that platform, the first one answers, because that is the one they
 * entered first.
 *
 * @param links The addresses to search, which may be absent.
 * @param platform The platform being asked about.
 * @returns The address, or `undefined` when that platform is not among them.
 */
export function findSocialMediaUrl(
  links: SocialMediaLinks | undefined,
  platform: SocialPlatformKey,
): string | undefined {
  return links?.find((link) => link.platform === platform)?.url;
}
