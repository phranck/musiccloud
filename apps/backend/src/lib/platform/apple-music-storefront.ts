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
 * A cached Apple Music link carries the storefront it was resolved in (e.g.
 * `/fr/`). Apple Music catalogue IDs are global, so the same recording opens
 * under any storefront where it is licensed. At render time we therefore
 * rewrite the URL's storefront segment to the viewer storefront we infer for
 * the request, keeping the catalogue ID. The button then opens directly in the
 * viewer's storefront instead of a foreign one. When we cannot infer a
 * storefront, or it already matches, the cached URL is returned unchanged.
 *
 * This is intentionally a render-time transform, not a data migration. The
 * cached link keeps its original storefront in the database.
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
 * Rewrite a cached Apple Music URL so it opens in the requested storefront.
 *
 * Apple Music catalogue IDs are global; only the leading `/<storefront>/`
 * segment is region-specific. Swapping that segment to the viewer storefront
 * lets the same recording open directly in their region instead of a foreign
 * one. The URL is returned unchanged when no request storefront can be
 * inferred, when it is not an Apple Music URL, or when it already matches.
 * Callers should only use this for rows whose service is `apple-music`.
 *
 * @param url - The cached Apple Music URL.
 * @param requestedStorefront - The viewer storefront (ISO 3166-1 alpha-2,
 *   already normalized to lowercase by {@link resolveAppleMusicStorefrontFromHeaders}),
 *   or `null` when it cannot be inferred.
 * @returns The URL with its storefront segment rewritten, or the original URL.
 */
export function rewriteAppleMusicUrlForStorefront(url: string, requestedStorefront: string | null): string {
  if (!requestedStorefront) return url;
  const linkStorefront = extractAppleMusicStorefront(url);
  if (!linkStorefront || linkStorefront === requestedStorefront) return url;
  return url.replace(/^(https?:\/\/music\.apple\.com\/)[a-z]{2}(\/|$)/i, `$1${requestedStorefront}$2`);
}
