/**
 * @file Every rule about a preview URL's lifetime and choice.
 *
 * Most adapters serve permanent CDN URLs (Spotify, Tidal, and others), and
 * for those `getPreviewExpiry` returns `null`, meaning the URL never
 * expires from our perspective. Deezer signs preview URLs with an
 * `hdnea=exp=<unix>` query parameter; we parse that and persist the
 * resulting timestamp on the `track_previews.expires_at` /
 * `album_previews.expires_at` columns so the resolver can refresh just
 * that one preview lazily on read instead of invalidating the whole
 * cached entity.
 *
 * The SQL that picks the preview a share page shows, `previewPreferenceOrder`
 * in `db/adapters/postgres-shared.ts`, states {@link isPreviewFresh} and
 * {@link preferredPreviewCandidate} in SQL. This module stays free of the
 * repository and the adapters; the Deezer refresh lives in
 * `services/preview-refresh.ts`.
 */

import { Service } from "@musiccloud/shared";
import type { PreviewObservation } from "../db/repository.js";

/**
 * Returns the unix-millis timestamp at which the preview URL expires.
 * Only Deezer signs its preview URLs, so the Deezer parser is the only one
 * asked. A service that starts signing gets its parser added here, and every
 * check in this module learns it at once.
 *
 * @param previewUrl - The preview URL as a service returned it.
 * @returns The expiry in unix milliseconds, or `null` when the URL carries no
 *   parseable expiry, which is the common case for non-Deezer services.
 */
export function getPreviewExpiry(previewUrl: string): number | null {
  return getDeezerPreviewExpiry(previewUrl);
}

/**
 * Builds the preview row to store for a URL a service just returned, with the
 * expiry its signature carries.
 *
 * @param service - The service the preview URL came from, stored as the row's
 *   `service`.
 * @param url - The preview URL as the service returned it, stored unchanged
 *   and passed to {@link getPreviewExpiry}.
 * @returns The observation for `upsertTrackPreview` or `upsertAlbumPreview`.
 *   Its `expiresAt` is the parsed expiry as a `Date`, or `null` when the URL
 *   carries no parseable expiry and therefore never goes stale.
 */
export function previewObservation(service: string, url: string): PreviewObservation {
  const expiresAtMs = getPreviewExpiry(url);
  return { service, url, expiresAt: expiresAtMs ? new Date(expiresAtMs) : null };
}

/**
 * Returns whether the preview URL has a parseable expiry that lies in the
 * past. This is the one check on a URL; a stored row is checked with
 * {@link isPreviewFresh}.
 *
 * @param previewUrl - The preview URL to check.
 * @param now - The current time in unix milliseconds. Defaults to `Date.now()`.
 * @returns `true` when the URL's expiry is at or before `now`; `false` when it
 *   lies after `now` or the URL carries no expiry signature.
 */
export function isExpiredPreviewUrl(previewUrl: string, now: number = Date.now()): boolean {
  const expiresAt = getPreviewExpiry(previewUrl);
  return expiresAt !== null && expiresAt <= now;
}

/**
 * Returns whether a stored preview row can still be played, judged by the
 * expiry stored with it. `previewPreferenceOrder` in
 * `db/adapters/postgres-shared.ts` is the SQL form of the same rule.
 *
 * @param expiresAt - The row's stored expiry. `null` means the URL carries no
 *   signed expiry and counts as fresh.
 * @param now - The current time in unix milliseconds. Defaults to `Date.now()`.
 * @returns `true` when `expiresAt` is `null` or lies after `now`.
 */
export function isPreviewFresh(expiresAt: Date | null, now: number = Date.now()): boolean {
  return expiresAt === null || expiresAt.getTime() > now;
}

/**
 * One preview a resolve observed, from a track link, an album link or the
 * source entity.
 *
 * @property service - The service the preview came from. `undefined` when the
 *   source entity names no service, which never ranks as Deezer.
 * @property previewUrl - The preview URL. An entry without one is never picked.
 */
export interface PreviewCandidate {
  service?: string;
  previewUrl?: string;
}

/**
 * Selects the preview candidate to play, in the order `previewPreferenceOrder`
 * applies in SQL.
 *
 * Expired signed URLs are not playable, so they are never picked. Deezer wins
 * among usable candidates; otherwise the first usable candidate wins, so
 * callers place newly observed previews before stored ones.
 *
 * @param candidates - Candidates in preference order, newest observations first.
 * @returns The winning candidate, or `undefined` when every candidate lacks a
 *   URL or carries an expired one.
 */
export function preferredPreviewCandidate<Candidate extends PreviewCandidate>(
  candidates: readonly Candidate[],
): Candidate | undefined {
  const usable = candidates.filter((candidate) => candidate.previewUrl && !isExpiredPreviewUrl(candidate.previewUrl));
  return usable.find((candidate) => candidate.service === Service.Deezer) ?? usable[0];
}

/**
 * Selects a usable preview URL from observed candidates, falling back to a
 * stored one.
 *
 * Callers place newly observed metadata before stored metadata so a response
 * uses the same fresh preview that its persistence path just saved.
 *
 * @param candidates - Candidates in preference order, see {@link preferredPreviewCandidate}.
 * @param stored - Previously selected preview, used only when it remains usable
 *   and no candidate wins. Defaults to none.
 * @returns A currently usable URL, or `undefined` when every observation is
 *   absent or expired.
 */
export function pickPreferredPreview(candidates: readonly PreviewCandidate[], stored?: string): string | undefined {
  const observed = preferredPreviewCandidate(candidates)?.previewUrl;
  return observed ?? (stored && !isExpiredPreviewUrl(stored) ? stored : undefined);
}

/** Separates the parts of Deezer's `hdnea` token, such as `exp=…~hmac=…`. */
const DEEZER_TOKEN_PART_SEPARATOR = "~";

/** Opens the `hdnea` token part that holds the expiry in unix seconds. */
const DEEZER_EXPIRY_PREFIX = "exp=";

/** Converts Deezer's expiry in unix seconds to unix milliseconds. */
const MILLISECONDS_PER_SECOND = 1000;

/**
 * Parses the expiry Deezer signs into its preview URLs as `hdnea=exp=<unix>`.
 * Only hosts under `dzcdn.net` are read, so a foreign URL carrying the same
 * parameter is not mistaken for a signed one. The migration
 * `0098_derive_signed_preview_expiry.sql` reads stored URLs the same way.
 *
 * @param previewUrl - The preview URL to parse.
 * @returns The expiry in unix milliseconds, or `null` when the URL is not a
 *   Deezer CDN URL, carries no `exp` part, or does not parse.
 */
export function getDeezerPreviewExpiry(previewUrl: string): number | null {
  try {
    const url = new URL(previewUrl);
    if (!/(^|\.)dzcdn\.net$/i.test(url.hostname)) return null;

    const token = url.searchParams.get("hdnea");
    if (!token) return null;

    const expPart = token.split(DEEZER_TOKEN_PART_SEPARATOR).find((part) => part.startsWith(DEEZER_EXPIRY_PREFIX));
    if (!expPart) return null;

    const expiresAtSeconds = Number(expPart.slice(DEEZER_EXPIRY_PREFIX.length));
    if (!Number.isFinite(expiresAtSeconds) || expiresAtSeconds <= 0) return null;

    return expiresAtSeconds * MILLISECONDS_PER_SECOND;
  } catch {
    return null;
  }
}
