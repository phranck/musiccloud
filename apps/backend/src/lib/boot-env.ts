import { getCreemConfig } from "./creem-config.js";
import { requireEnv } from "./env.js";

/**
 * Environment variables the backend cannot serve correctly without. Each is
 * checked once at startup by {@link assertRequiredBootEnv} so a missing value
 * fails the boot instead of breaking lazily at request time.
 *
 * - `JAMENDO_CLIENT_ID` gates the whole Creative-Commons resolve path: every CC
 *   request calls the Jamendo API, which the client refuses to hit without it.
 */
const REQUIRED_BOOT_ENV = ["JAMENDO_CLIENT_ID"] as const;

/**
 * Asserts that every {@link REQUIRED_BOOT_ENV} variable is set, throwing on the
 * first one that is missing or empty.
 *
 * After the required-var loop, an optional Creem consistency guard runs:
 * Creem is not required to boot during the foundation phase (CI and tests
 * without Creem credentials can start fine), but when `CREEM_API_KEY` is
 * present the full Creem config must be consistent. Checking here surfaces a
 * misconfigured Creem env as a loud boot failure rather than a silent runtime
 * error on the first billing request.
 *
 * Call once during startup, before the server accepts connections. Without it a
 * missing `JAMENDO_CLIENT_ID` only surfaces as a generic `MC-API-0004` the first
 * time someone uses CC mode, while `/health/db` still reports the container
 * ready -- an invisible, slow-to-trace breakage. Failing here instead turns the
 * misconfiguration into a loud restart loop, the same way a failed migration
 * does.
 *
 * @throws Error when a required variable is unset or empty; the message (from
 *   {@link requireEnv}) names the variable and notes that `.env.local` is
 *   dev-only.
 * @throws Error when `CREEM_API_KEY` is set but the Creem config is otherwise
 *   inconsistent (re-thrown from {@link getCreemConfig}).
 */
export function assertRequiredBootEnv(): void {
  for (const name of REQUIRED_BOOT_ENV) {
    requireEnv(name);
  }

  // Creem is optional: omitting CREEM_API_KEY is valid in CI and in dev
  // environments that have not yet wired Creem. But when the key IS present
  // the rest of the config (webhook secret shape, prefix-derived mode) must
  // also be consistent. Calling getCreemConfig() here turns any mismatch into
  // a loud boot failure instead of a silent error on the first billing request.
  if (process.env.CREEM_API_KEY) {
    getCreemConfig();
  }
}
