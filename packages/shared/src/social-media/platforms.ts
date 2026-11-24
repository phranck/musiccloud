/**
 * @file The social platforms musiccloud knows, and the shape of one place
 * somebody can be found on them.
 */

/** Ordered list of all supported social media platform keys. */
export const SOCIAL_PLATFORM_KEYS = [
  "applepodcasts",
  "mastodon",
  "pixelfed",
  "friendica",
  "bluesky",
  "instagram",
  "facebook",
  "whatsapp",
  "signal",
  "discord",
  "threads",
  "tiktok",
  "x",
  "youtube",
  "twitch",
  "tumblr",
  "linkedin",
  "xing",
  "pinterest",
  "patreon",
  "mixcloud",
  "soundcloud",
  "spotify",
  "github",
  "gitlab",
  "codeberg",
  "website",
] as const;

/** Union type of all valid social media platform keys derived from `SOCIAL_PLATFORM_KEYS`. */
export type SocialPlatformKey = (typeof SOCIAL_PLATFORM_KEYS)[number];

/**
 * The platform of an address that belongs to no network: somebody's own site.
 *
 * It is the fallback every unrecognized address is sorted into, the platform
 * the editor may overrule with a recognized one, and the one the sponsor
 * picture lookup reads last, for the site's own mark rather than a portrait.
 */
export const WEBSITE_PLATFORM = "website" satisfies SocialPlatformKey;

/**
 * One place somebody can be found, as a platform together with the address that
 * leads there.
 *
 * @property platform One of `SOCIAL_PLATFORM_KEYS`, in its canonical spelling.
 * @property url The address, normalized for that platform.
 */
export interface SocialMediaLink {
  platform: SocialPlatformKey;
  url: string;
}

/**
 * Every place somebody can be found, in the order they were entered.
 *
 * A list rather than a map from platform to address, because one person may
 * have two websites or two accounts on the same network. A map holds one value
 * per key, so the second address would replace the first without saying so.
 */
export type SocialMediaLinks = SocialMediaLink[];
