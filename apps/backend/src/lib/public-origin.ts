/**
 * @file Resolves the origin that public URLs are built on.
 *
 * A share URL always lives on the public site, whichever host answered the
 * request that produced it. It therefore follows from configuration and never
 * from the request.
 *
 * The share route used to read `X-Forwarded-Host` for this and interpolate it
 * straight into a URL, on the stated assumption that the endpoint was reachable
 * only through the frontend. It is not: `GET /api/v1/share/{shortId}` is
 * registered unauthenticated and documented as part of the public API. The
 * header is attacker input there, and it is not even the right value, because
 * the Zerops ingress sets it to the host that was actually addressed, which for
 * a direct API call is `api.musiccloud.io` rather than the public site.
 */

/** Used when `PUBLIC_URL` is unset or unusable. */
const FALLBACK_PUBLIC_ORIGIN = "https://musiccloud.io";

/**
 * Reduces a configured URL to its origin, dropping any path, query or fragment.
 *
 * @param value - Raw configured value.
 * @returns The origin, or `null` when the value is not an absolute HTTP(S) URL.
 */
function toHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Returns the origin that public-facing URLs are built on.
 *
 * Reads `PUBLIC_URL`, which the deployment already sets and which
 * `GET /health/frontend` already probes. A missing or malformed value falls
 * back to the production site rather than throwing, because a share response
 * with a slightly wrong absolute URL is a better outcome than a `500`.
 *
 * @returns An absolute origin with no trailing slash, for example `https://musiccloud.io`.
 */
export function getPublicOrigin(): string {
  const configured = process.env.PUBLIC_URL;
  if (!configured) return FALLBACK_PUBLIC_ORIGIN;
  return toHttpOrigin(configured) ?? FALLBACK_PUBLIC_ORIGIN;
}
