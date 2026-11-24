/**
 * @file Picks the origin a resolve route builds its short URL on.
 *
 * The `Origin` header is client-controlled, so an attacker could supply any
 * hostname. Echoed back unchecked, the returned `shortUrl` would point at an
 * attacker-chosen host that a consumer might then share publicly. Every
 * resolve route therefore builds its short URL only on an origin from the
 * `ALLOWED_ORIGINS` list.
 */
import { requireEnvList } from "../env.js";

/** Name of the environment variable that lists the allowed origins, comma-separated. */
const ALLOWED_ORIGINS_ENV = "ALLOWED_ORIGINS";

/**
 * The origins a short URL may be built on, read once from
 * {@link ALLOWED_ORIGINS_ENV} when the module loads. The first entry is the
 * production origin and serves as the default. Loading fails when the
 * variable is missing or lists nothing.
 */
const ALLOWED_ORIGINS = requireEnvList(ALLOWED_ORIGINS_ENV);

/**
 * Picks a safe origin for the user-facing short URL.
 *
 * @param headerOrigin - The request's raw `Origin` header, absent when the
 *   request sent none (curl, Shortcuts).
 * @returns `headerOrigin` when it is in {@link ALLOWED_ORIGINS}, otherwise the
 *   first allowed origin.
 */
export function shortUrlOrigin(headerOrigin?: string): string {
  if (headerOrigin && ALLOWED_ORIGINS.includes(headerOrigin)) {
    return headerOrigin;
  }
  return ALLOWED_ORIGINS[0];
}
