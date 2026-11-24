/**
 * The small string and URL helpers the social-media normalizers, the platform
 * detection and the list normalization share: platform-key lookup, handle and
 * path trimming, URL parsing, and the host checks for networks that answer on
 * more than one host. None of these is part of the package's public surface;
 * `index.ts` does not re-export them.
 */

import { SOCIAL_PLATFORM_KEYS } from "./platforms.js";

/** Every supported platform key, as a set for membership checks. */
export const PLATFORM_SET = new Set<string>(SOCIAL_PLATFORM_KEYS);

/**
 * Maps a platform key onto its canonical spelling.
 *
 * @param platform A platform key as given, such as `"twitter"` or `"instagram"`.
 * @returns `"x"` for `"twitter"`, every other key unchanged.
 */
export function canonicalizePlatformKey(platform: string): string {
  return platform === "twitter" ? "x" : platform;
}

/**
 * Removes one trailing slash.
 *
 * @param s The string to trim.
 * @returns `s` without its final `/`, or `s` unchanged when it has none.
 */
export function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

/**
 * Removes one leading `@`.
 *
 * @param s The handle to trim.
 * @returns `s` without its first `@`, or `s` unchanged when it has none.
 */
export function stripLeadingAt(s: string): string {
  return s.startsWith("@") ? s.slice(1) : s;
}

/**
 * Parses a string as an absolute URL without throwing.
 *
 * @param s The string to parse.
 * @returns The parsed URL, or `null` when `s` is not an absolute URL.
 */
export function tryParseUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    return null;
  }
}

/**
 * Removes a leading `www.` from a host name.
 *
 * @param host The host name.
 * @returns `host` without `www.`, or `host` unchanged when it has none.
 */
export function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

/**
 * Whether a host belongs to Pinterest: any `pinterest.*` domain, a subdomain of
 * `pinterest.com`, or the `pin.it` short host.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for a Pinterest host.
 */
export function isPinterestHost(host: string): boolean {
  return host.startsWith("pinterest.") || host.endsWith(".pinterest.com") || host === "pin.it";
}

/**
 * Whether a host belongs to Facebook: `facebook.com`, `fb.com`, or a subdomain of `facebook.com`.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for a Facebook host.
 */
export function isFacebookHost(host: string): boolean {
  return host === "facebook.com" || host === "fb.com" || host.endsWith(".facebook.com");
}

/**
 * Whether a host belongs to LinkedIn: `linkedin.com` or one of its subdomains.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for a LinkedIn host.
 */
export function isLinkedinHost(host: string): boolean {
  return host === "linkedin.com" || host.endsWith(".linkedin.com");
}

/**
 * Whether a host belongs to XING: `xing.com` or one of its subdomains.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for a XING host.
 */
export function isXingHost(host: string): boolean {
  return host === "xing.com" || host.endsWith(".xing.com");
}

/**
 * Whether a host belongs to X: `x.com`, `twitter.com`, or a subdomain of either.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for an X host.
 */
export function isXHost(host: string): boolean {
  return host === "x.com" || host === "twitter.com" || host.endsWith(".x.com") || host.endsWith(".twitter.com");
}

/**
 * Whether a host belongs to Tumblr: `tumblr.com` or one of its subdomains.
 *
 * @param host The host name, without `www.`.
 * @returns `true` for a Tumblr host.
 */
export function isTumblrHost(host: string): boolean {
  return host === "tumblr.com" || host.endsWith(".tumblr.com");
}

/**
 * First path segments on `linkedin.com` that name a LinkedIn section rather than
 * a person. The LinkedIn normalizer reads any other single segment as a vanity
 * profile path and rewrites it to `/in/<slug>`.
 */
export const LINKEDIN_RESERVED_PATHS = new Set([
  "in",
  "company",
  "school",
  "groups",
  "learning",
  "jobs",
  "posts",
  "pulse",
  "feed",
  "me",
  "notifications",
  "messaging",
  "mynetwork",
  "events",
  "services",
  "pages",
  "help",
  "pricing",
  "login",
  "signup",
  "news",
  "careers",
  "legal",
  "terms",
  "policies",
  "products",
  "ads",
  "marketing",
  "premium",
  "recruiter",
  "search",
  "profile",
  "settings",
  "security",
  "privacy",
  "account",
  "today",
  "showcase",
  "influencer",
  "talent",
  "business",
  "sales",
  "mobile",
  "pub",
  "public-profile",
]);

/**
 * Reads the last path segment of a URL, which most networks use as the user name.
 *
 * @param url The parsed profile URL.
 * @returns The last segment after removing one trailing slash, or an empty
 *   string when the path has none.
 */
export function extractPathUser(url: URL): string {
  return stripTrailingSlash(url.pathname).split("/").pop() ?? "";
}
