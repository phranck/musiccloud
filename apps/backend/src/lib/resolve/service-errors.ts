/**
 * HTTP-to-MC-code translator for adapter error paths.
 *
 * When a plugin's `getTrack`/`getAlbum`/`getArtist` catches a non-OK response
 * from its upstream, it must produce a `ResolveError` the route layer can
 * turn into `{ code, message }`. Every adapter used to hand-roll that
 * mapping, which scattered the error-code rules and drifted across
 * services. This module is the single source of truth:
 *
 *   adapter catch block  ->  serviceHttpError(status, …)  ->  ResolveError
 *
 * Why a separate module from `errors.ts`: `errors.ts` defines the error
 * classes (the data structure); this file defines the translation policy
 * (status 429 becomes MC-API-NNN29 etc.). Splitting them keeps the class
 * definitions short and lets the policy evolve without touching the types.
 *
 * Why per-service prefixes (1 = Apple Music, 3 = Spotify, 80 = KKBOX, …):
 * a user reporting "I got MC-API-3404" tells us immediately that Spotify
 * returned 404, without needing log correlation. The prefixes are
 * `ADAPTER_ERROR_CODE_PREFIX` in `packages/shared/src/error-codes.ts`, and the
 * service names in the messages are the labels of `PLATFORM_CONFIG`, so a
 * message names a service the way the share page does.
 */

import {
  ADAPTER_ERROR_CODE_PREFIX,
  getPlatformLabel,
  Operation,
  type ResourceKind,
  type ServiceId,
  serviceErrorDigits,
} from "@musiccloud/shared";
import { ResolveError } from "./errors.js";

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
 * `op` defaults to `Operation.Fetch` (canonical "look up by id"). Pass
 * `Operation.IsrcLookup`, `Operation.UpcLookup`, etc. for alternate paths.
 */
export function serviceHttpError(
  serviceId: ServiceId,
  status: number,
  kind: ResourceKind,
  id: string,
  op: Operation = Operation.Fetch,
): ResolveError {
  const prefix = ADAPTER_ERROR_CODE_PREFIX[serviceId];
  const label = getPlatformLabel(serviceId);
  const ctx = { service: serviceId, kind, id, status, op };

  if (status === 401) {
    return new ResolveError(
      `MC-AUTH-${serviceErrorDigits(prefix, "401")}`,
      `${label} ${kind} ${op} failed: 401 (auth)`,
      ctx,
    );
  }
  if (status === 404) {
    return new ResolveError(
      `MC-API-${serviceErrorDigits(prefix, "404")}`,
      `${label} ${kind} ${op} failed: 404 (${kind} ${id} not found)`,
      ctx,
    );
  }
  if (status === 429) {
    return new ResolveError(
      `MC-API-${serviceErrorDigits(prefix, "429")}`,
      `${label} ${kind} ${op} rate-limited (429)`,
      ctx,
    );
  }
  return new ResolveError(
    `MC-API-${serviceErrorDigits(prefix, "001")}`,
    `${label} ${kind} ${op} failed: ${status}`,
    ctx,
  );
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
  const prefix = ADAPTER_ERROR_CODE_PREFIX[serviceId];
  const label = getPlatformLabel(serviceId);
  const KindLabel = kind.charAt(0).toUpperCase() + kind.slice(1);
  // Downstream code and adapter tests match the phrase "Track not found", so
  // the message keeps the "<Service>: Track not found: <id>" shape.
  return new ResolveError(
    `MC-API-${serviceErrorDigits(prefix, "404")}`,
    `${label}: ${KindLabel} not found: ${id}${detail ? ` (${detail})` : ""}`,
    { service: serviceId, kind, id },
  );
}
