/**
 * Apple Music storefront handling for share-page cache reads.
 *
 * Why this exists:
 * Apple Music catalogue IDs are storefront-scoped. A URL such as
 * `https://music.apple.com/us/album/...?...i=1443463670` can open fine for
 * a US account but fail inside the Apple Music app for an AT account with
 * Apple's generic "Something went wrong" screen. The old share-page path
 * treated cached Apple Music links as globally valid because `service_links`
 * has one row per `(track, service)`. That is correct for services with
 * globally stable IDs, but it is unsafe for Apple Music.
 *
 * Product rule:
 * A cached Apple Music link is renderable only when the link's URL storefront
 * matches the viewer storefront we can infer for this request. If we cannot
 * infer a storefront, we keep the old behaviour and render the link. If we
 * can infer one and the cached URL points elsewhere, we hide Apple Music
 * rather than sending the user into a broken native-app deep link.
 *
 * This is intentionally a render-time guard, not a data migration. Existing
 * cached links remain in the database for their original storefront, but they
 * are no longer considered globally valid on share pages.
 */
import type { IncomingHttpHeaders } from "node:http";

const APPLE_MUSIC_URL_STOREFRONT = /^https?:\/\/music\.apple\.com\/([a-z]{2})(?:\/|$)/i;
const APPLE_MUSIC_STOREFRONT_HEADER = "x-musiccloud-apple-music-storefront";

const COUNTRY_HEADER_CANDIDATES = [
  APPLE_MUSIC_STOREFRONT_HEADER,
  "cf-ipcountry",
  "x-vercel-ip-country",
  "cloudfront-viewer-country",
  "x-country-code",
  "x-geo-country",
] as const;

function normalizeStorefront(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[a-z]{2}$/.test(normalized) ? normalized : null;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  return firstHeaderValue(headers[name]);
}

/**
 * Extract the storefront embedded in an Apple Music URL.
 *
 * Apple puts the storefront directly after the host (`/us/`, `/at/`, ...).
 * We only return a value for real Apple Music URLs because callers use the
 * result as a trust boundary for hiding or showing platform buttons.
 */
export function extractAppleMusicStorefront(url: string): string | null {
  return APPLE_MUSIC_URL_STOREFRONT.exec(url)?.[1]?.toLowerCase() ?? null;
}

function storefrontFromAcceptLanguage(header: string | undefined): string | null {
  if (!header) return null;

  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0];
    const region = /^[a-z]{2}-([a-z]{2})$/i.exec(tag)?.[1];
    const storefront = normalizeStorefront(region);
    if (storefront) return storefront;
  }

  return null;
}

/**
 * Infer the Apple Music storefront for a request.
 *
 * Priority is explicit edge/CDN country signal first, then Accept-Language,
 * then APPLE_MUSIC_STOREFRONT. The env fallback is deliberately last: it
 * keeps local/dev behaviour stable but must not override a concrete user
 * region supplied by the frontend BFF or proxy.
 */
export function resolveAppleMusicStorefrontFromHeaders(headers: IncomingHttpHeaders): string | null {
  for (const name of COUNTRY_HEADER_CANDIDATES) {
    const storefront = normalizeStorefront(headerValue(headers, name));
    if (storefront) return storefront;
  }

  return (
    storefrontFromAcceptLanguage(headerValue(headers, "accept-language")) ??
    normalizeStorefront(process.env.APPLE_MUSIC_STOREFRONT)
  );
}

/**
 * Decide whether a cached Apple Music URL is valid for the requested
 * storefront. A non-Apple URL passed here is treated as unverifiable and is
 * shown only when the request storefront is also unknown. Callers should only
 * use this for rows whose service is `apple-music`.
 */
export function isAppleMusicLinkRenderableForStorefront(url: string, requestedStorefront: string | null): boolean {
  const linkStorefront = extractAppleMusicStorefront(url);
  if (!linkStorefront) return !requestedStorefront;
  if (!requestedStorefront) return true;
  return linkStorefront === requestedStorefront;
}
