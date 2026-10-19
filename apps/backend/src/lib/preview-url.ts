/**
 * @file Preview-URL freshness helpers.
 *
 * Most adapters serve permanent CDN URLs (Spotify, Tidal, and others), and
 * for those `getPreviewExpiry` returns `null`, meaning the URL never
 * expires from our perspective. Deezer signs preview URLs with an
 * `hdnea=exp=<unix>` query parameter; we parse that and persist the
 * resulting timestamp on the `track_previews.expires_at` /
 * `album_previews.expires_at` columns so the resolver can refresh just
 * that one preview lazily on read instead of invalidating the whole
 * cached entity.
 */

import { Service } from "@musiccloud/shared";

/**
 * Returns the unix-millis timestamp at which the preview URL expires,
 * or `null` if the URL has no parseable expiry (the common case for
 * non-Deezer services).
 *
 * `service` is accepted but unused today: only Deezer signs preview
 * URLs. The argument is reserved so callers can pass it without a
 * follow-up signature change when other services start signing.
 */
export function getPreviewExpiry(previewUrl: string, _service?: string): number | null {
  return getDeezerPreviewExpiry(previewUrl);
}

/**
 * Returns whether the preview URL has a parseable expiry that lies in
 * the past. URLs without an expiry signature are treated as fresh
 * (returns `false`).
 */
export function isExpiredPreviewUrl(previewUrl: string, service?: string, now = Date.now()): boolean {
  const expiresAt = getPreviewExpiry(previewUrl, service);
  return expiresAt !== null && expiresAt <= now;
}

/**
 * Selects a usable preview from provider observations in preference order.
 *
 * Expired signed URLs are not playable fallbacks. Deezer wins among usable
 * observations; otherwise the first usable candidate wins. Callers place newly
 * observed metadata before stored metadata so a response uses the same fresh
 * preview that its persistence path just saved.
 *
 * @param candidates - Provider ids and optional preview URLs, newest observations first.
 * @param stored - Previously selected preview, used only when it remains usable and no candidate wins.
 * @returns A currently usable URL, or undefined when every observation is absent or expired.
 */
export function pickPreferredPreview(
  candidates: readonly { service: string; previewUrl?: string }[],
  stored?: string,
): string | undefined {
  const usable = candidates.filter((candidate) => candidate.previewUrl && !isExpiredPreviewUrl(candidate.previewUrl));
  const observed = (usable.find((candidate) => candidate.service === Service.Deezer) ?? usable[0])?.previewUrl;
  return observed ?? (stored && !isExpiredPreviewUrl(stored) ? stored : undefined);
}

// ─── Service-specific helpers (kept exported for back-compat) ──────────────

export function getDeezerPreviewExpiry(previewUrl: string): number | null {
  try {
    const url = new URL(previewUrl);
    if (!/(^|\.)dzcdn\.net$/i.test(url.hostname)) return null;

    const token = url.searchParams.get("hdnea");
    if (!token) return null;

    const expPart = token.split("~").find((part) => part.startsWith("exp="));
    if (!expPart) return null;

    const expiresAtSeconds = Number(expPart.slice(4));
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return null;

    return expiresAtSeconds * 1000;
  } catch {
    return null;
  }
}

export function isExpiredDeezerPreviewUrl(previewUrl: string, now = Date.now()): boolean {
  const expiresAt = getDeezerPreviewExpiry(previewUrl);
  return expiresAt !== null && expiresAt <= now;
}
