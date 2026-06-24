import type { ServiceId } from "@musiccloud/shared";
import { detectSocialChannel } from "@/lib/bio/socialChannels";
import { detectMusicService } from "@/lib/platform/url";

/**
 * The four ways a detected bio link is presented. A shared `as const` namespace
 * (PascalCase members) so the discriminant is never an inline literal.
 */
export const BioLinkKind = {
  /** A commercial streaming URL → rendered as the platform's logo icon. */
  Platform: "platform",
  /** A social profile → rendered as `host/@handle` text. */
  Social: "social",
  /** Any other website → rendered as the bare `domain.tld`. */
  Web: "web",
  /** An email address → rendered as a `mailto:` link. */
  Email: "email",
} as const;
export type BioLinkKind = (typeof BioLinkKind)[keyof typeof BioLinkKind];

/**
 * A classified bio link: the navigable `href` plus the data each render path
 * needs (a {@link ServiceId} for platform logos, a display `label` otherwise).
 */
export type BioLink =
  | { kind: typeof BioLinkKind.Platform; href: string; service: ServiceId }
  | { kind: typeof BioLinkKind.Social; href: string; label: string }
  | { kind: typeof BioLinkKind.Web; href: string; label: string }
  | { kind: typeof BioLinkKind.Email; href: string; label: string };

/** A matched run is an email (not a URL) when it carries an `@` and no path separator. */
const EMAIL_LIKE = /^[^\s/]+@[^\s/]+$/;

/**
 * Second-level labels that act as a public suffix under a two-letter ccTLD
 * (`example.co.uk`, `band.com.au`). A compact substitute for a full public-suffix
 * list — enough to keep the registrable domain intact for the common cases.
 */
const COMPOUND_SLDS = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "gob", "or", "ne"]);

/**
 * Reduces a hostname to its display domain: drops a leading `www.` and any
 * deeper subdomains, leaving `domain.tld` (or `domain.sld.cctld` for compound
 * ccTLDs like `co.uk`). Examples: `www.pornophonique.de` → `pornophonique.de`,
 * `music.example.com` → `example.com`, `blog.example.co.uk` → `example.co.uk`.
 *
 * @param hostname - A URL hostname (no scheme/path).
 * @returns The bare registrable domain for display.
 */
function displayDomain(hostname: string): string {
  const host = hostname.replace(/^www\./, "");
  const labels = host.split(".");
  if (labels.length <= 2) return host;
  const sld = labels[labels.length - 2];
  const tld = labels[labels.length - 1];
  if (tld.length === 2 && COMPOUND_SLDS.has(sld)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

/**
 * Classifies a single matched bio token (a URL or email) into its presentation
 * kind. Commercial streaming links win over social, which win over plain web;
 * emails are detected up front. Scheme-less URLs (`www.…`, `host/path`) are given
 * an `https://` scheme for the `href`. Unparseable URLs degrade to web display
 * showing the raw token.
 *
 * @param rawMatch - The matched link text (trailing punctuation already stripped).
 * @returns The classified {@link BioLink}.
 */
export function resolveBioLink(rawMatch: string): BioLink {
  if (EMAIL_LIKE.test(rawMatch)) {
    return { kind: BioLinkKind.Email, href: `mailto:${rawMatch}`, label: rawMatch };
  }

  const href = rawMatch.startsWith("http") ? rawMatch : `https://${rawMatch}`;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: BioLinkKind.Web, href, label: rawMatch };
  }

  const service = detectMusicService(href);
  if (service) return { kind: BioLinkKind.Platform, href, service };

  const social = detectSocialChannel(url);
  if (social) return { kind: BioLinkKind.Social, href, label: `${social.displayHost}/@${social.handle}` };

  return { kind: BioLinkKind.Web, href, label: displayDomain(url.hostname) };
}
