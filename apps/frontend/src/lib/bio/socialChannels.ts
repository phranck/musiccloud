/**
 * Recognises social-media profile URLs in bio text and normalises them to a
 * compact `host/@handle` display form (e.g. `twitter.com/@username`,
 * `bsky.app/@handle`, `chaos.social/@user`).
 *
 * Two detection paths:
 * 1. A fixed registry of well-known networks keyed by hostname (Twitter/X,
 *    Bluesky, Instagram, Facebook, Pinterest, Snapchat, Telegram). Each knows how
 *    to pull the handle out of its own path shape.
 * 2. A Mastodon/fediverse fallback: any host whose path is exactly `/@user`
 *    (the universal fediverse profile shape) on an otherwise unknown domain.
 *
 * Signal is intentionally absent: its links (`signal.me/#…`, `signal.group/…`)
 * carry no public handle, so they fall through to plain domain display.
 */

/** A normalised social link: the brand host to show plus the extracted handle (no leading `@`). */
export interface SocialMatch {
  displayHost: string;
  handle: string;
}

/**
 * One social network's recognition rule.
 *
 * @property hosts - Hostnames (without leading `www.`) that identify this network.
 * @property displayHost - Canonical host shown in the label (collapses `x.com` → `twitter.com`).
 * @property handleFromPath - Extracts the handle from the path segments, or `null` when the URL is not a profile.
 */
interface SocialChannel {
  hosts: string[];
  displayHost: string;
  handleFromPath: (segments: string[]) => string | null;
}

/** Strips a single leading `@` so handles normalise to a bare username. */
function stripAt(value: string): string {
  return value.startsWith("@") ? value.slice(1) : value;
}

/** First path segment as a handle, unless it is a reserved (non-profile) route. */
function firstSegmentHandle(segments: string[], reserved: Set<string>): string | null {
  const first = segments[0];
  if (!first) return null;
  const handle = stripAt(first);
  return handle && !reserved.has(handle.toLowerCase()) ? handle : null;
}

const TWITTER_RESERVED = new Set([
  "home",
  "search",
  "explore",
  "notifications",
  "messages",
  "i",
  "hashtag",
  "intent",
  "share",
  "settings",
]);
const INSTAGRAM_RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts"]);
const FACEBOOK_RESERVED = new Set(["profile.php", "pages", "groups", "events", "watch", "marketplace", "sharer"]);
const PINTEREST_RESERVED = new Set(["pin", "search", "ideas"]);
const TELEGRAM_RESERVED = new Set(["joinchat", "s", "share", "addstickers", "proxy"]);

const SOCIAL_CHANNELS: SocialChannel[] = [
  {
    hosts: ["twitter.com", "x.com", "mobile.twitter.com"],
    displayHost: "twitter.com",
    handleFromPath: (segments) => firstSegmentHandle(segments, TWITTER_RESERVED),
  },
  {
    hosts: ["bsky.app"],
    displayHost: "bsky.app",
    handleFromPath: (segments) => (segments[0] === "profile" ? (segments[1] ?? null) : null),
  },
  {
    hosts: ["instagram.com"],
    displayHost: "instagram.com",
    handleFromPath: (segments) => firstSegmentHandle(segments, INSTAGRAM_RESERVED),
  },
  {
    hosts: ["facebook.com", "fb.com", "m.facebook.com"],
    displayHost: "facebook.com",
    handleFromPath: (segments) => firstSegmentHandle(segments, FACEBOOK_RESERVED),
  },
  {
    hosts: ["pinterest.com"],
    displayHost: "pinterest.com",
    handleFromPath: (segments) => firstSegmentHandle(segments, PINTEREST_RESERVED),
  },
  {
    hosts: ["snapchat.com"],
    displayHost: "snapchat.com",
    handleFromPath: (segments) =>
      segments[0] === "add" ? (segments[1] ?? null) : firstSegmentHandle(segments, new Set()),
  },
  {
    hosts: ["t.me", "telegram.me", "telegram.dog"],
    displayHost: "t.me",
    handleFromPath: (segments) => firstSegmentHandle(segments, TELEGRAM_RESERVED),
  },
];

/** Host (without `www.`) → channel, built once so detection is an O(1) lookup. */
const HOST_TO_CHANNEL = new Map<string, SocialChannel>(
  SOCIAL_CHANNELS.flatMap((channel) => channel.hosts.map((host) => [host, channel] as const)),
);

/** Matches a fediverse profile path: exactly `/@user`, no further segments. */
const FEDIVERSE_PROFILE = /^\/@([A-Za-z0-9_.-]+)\/?$/;

/**
 * Classifies a parsed URL as a social profile and returns its normalised
 * `host/@handle` parts, or `null` when it is not a recognised social profile.
 *
 * @param url - The parsed URL (already given an `https://` scheme by the caller).
 * @returns The {@link SocialMatch}, or `null` to fall back to plain domain display.
 */
export function detectSocialChannel(url: URL): SocialMatch | null {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  const channel = HOST_TO_CHANNEL.get(host);
  if (channel) {
    const handle = channel.handleFromPath(segments);
    return handle ? { displayHost: channel.displayHost, handle } : null;
  }

  // Fediverse fallback: any unknown host serving a bare `/@user` profile path.
  const fediverse = url.pathname.match(FEDIVERSE_PROFILE);
  return fediverse ? { displayHost: host, handle: fediverse[1] } : null;
}
