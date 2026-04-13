import type { Operation, ResourceKind, ServiceId } from "@musiccloud/shared";
import { OPERATION } from "@musiccloud/shared";
import { ResolveError } from "./errors.js";

/**
 * Per-service code prefix. The first 1-2 digits of an `MC-API-NNNN` /
 * `MC-AUTH-NNNN` code identify the adapter that produced the error, so a
 * code reported by a user maps to a specific service in one glance.
 *
 * Single-digit prefixes own a thousand codes (e.g. Apple Music = 1xxx);
 * two-digit prefixes share a hundred (e.g. KKBOX = 80xx, Beatport = 81xx).
 * The pattern matches the documentation in `packages/shared/src/error-codes.ts`.
 */
const ADAPTER_PREFIX: Record<ServiceId, string> = {
  "apple-music": "1",
  qobuz: "2",
  spotify: "3",
  tidal: "4",
  deezer: "5",
  youtube: "6",
  "youtube-music": "65",
  napster: "7",
  kkbox: "80",
  beatport: "81",
  bandcamp: "82",
  audiomack: "83",
  audius: "84",
  soundcloud: "85",
  boomplay: "86",
  pandora: "90",
  bugs: "91",
  melon: "92",
  netease: "93",
  qqmusic: "94",
  jiosaavn: "95",
};

/** Human-readable label used in error messages (capitalisation matches what users see in the UI). */
const ADAPTER_LABEL: Record<ServiceId, string> = {
  "apple-music": "Apple Music",
  qobuz: "Qobuz",
  spotify: "Spotify",
  tidal: "Tidal",
  deezer: "Deezer",
  youtube: "YouTube",
  "youtube-music": "YouTube Music",
  napster: "Napster",
  kkbox: "KKBOX",
  beatport: "Beatport",
  bandcamp: "Bandcamp",
  audiomack: "Audiomack",
  audius: "Audius",
  soundcloud: "SoundCloud",
  boomplay: "BoomPlay",
  pandora: "Pandora",
  bugs: "Bugs",
  melon: "Melon",
  netease: "Netease",
  qqmusic: "QQ Music",
  jiosaavn: "JioSaavn",
};

/**
 * Build the service-specific MC code suffix.
 *
 * For single-digit prefixes (Apple Music = "1", …, Napster = "7") the suffix
 * is `<prefix><3-char status>` so we get codes like `MC-API-1404` and
 * `MC-AUTH-3401`. For two-digit prefixes (`80` = KKBOX, `91` = Bugs, …) the
 * status is mapped to a 2-digit hint (`04` for 404, `01` for generic, `29`
 * for 429) so the code stays four characters wide: `MC-API-8004`.
 */
function buildSuffix(prefix: string, statusToken: string): string {
  if (prefix.length === 1) {
    // 1xxx — three trailing digits: HTTP-statusy.
    return `${prefix}${statusToken.padStart(3, "0").slice(-3)}`;
  }
  // 2-digit prefix, 2-digit status hint: 8004 / 8104 / 9004 / …
  const compact = statusToken === "001" ? "01" : statusToken.slice(-2);
  return `${prefix}${compact}`;
}

/**
 * Map an upstream HTTP error to a MC `ResolveError` with the right code
 * (auth / not-found / rate-limit / generic), service-specific prefix, and
 * a context payload that travels with the error.
 *
 * Adapters call this in their `getTrack` / `getAlbum` / `getArtist` catch
 * paths so the route handler returns an honest message ("Spotify
 * rate-limited us. (MC-API-3429)") instead of a generic
 * "Looks like you're offline".
 *
 * `op` defaults to `OPERATION.FETCH` (canonical "look up by id") — pass
 * `OPERATION.ISRC_LOOKUP`, `OPERATION.UPC_LOOKUP`, etc. for alternate paths.
 */
export function serviceHttpError(
  serviceId: ServiceId,
  status: number,
  kind: ResourceKind,
  id: string,
  op: Operation = OPERATION.FETCH,
): ResolveError {
  const prefix = ADAPTER_PREFIX[serviceId];
  const label = ADAPTER_LABEL[serviceId] ?? serviceId;
  const ctx = { service: serviceId, kind, id, status, op };

  if (status === 401) {
    return new ResolveError(`MC-AUTH-${buildSuffix(prefix, "401")}`, `${label} ${kind} ${op} failed: 401 (auth)`, ctx);
  }
  if (status === 404) {
    return new ResolveError(
      `MC-API-${buildSuffix(prefix, "404")}`,
      `${label} ${kind} ${op} failed: 404 (${kind} ${id} not found)`,
      ctx,
    );
  }
  if (status === 429) {
    return new ResolveError(`MC-API-${buildSuffix(prefix, "429")}`, `${label} ${kind} ${op} rate-limited (429)`, ctx);
  }
  return new ResolveError(`MC-API-${buildSuffix(prefix, "001")}`, `${label} ${kind} ${op} failed: ${status}`, ctx);
}

/**
 * Same as {@link serviceHttpError} but for the "request returned 200 but the
 * payload was empty / missing the resource we asked for" case. Always emits
 * the per-service 404 code so users see a consistent "not found" experience.
 */
export function serviceNotFoundError(
  serviceId: ServiceId,
  kind: ResourceKind,
  id: string,
  detail?: string,
): ResolveError {
  const prefix = ADAPTER_PREFIX[serviceId];
  const label = ADAPTER_LABEL[serviceId] ?? serviceId;
  const KindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
  // Wording matches the legacy "X: Track not found: <id>" used by many
  // adapters before the sweep, so downstream code (and tests) that grep the
  // phrase "Track not found" continue to work.
  return new ResolveError(
    `MC-API-${buildSuffix(prefix, "404")}`,
    `${label}: ${KindLabel} not found: ${id}${detail ? ` (${detail})` : ""}`,
    { service: serviceId, kind, id },
  );
}
