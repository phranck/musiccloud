import { requireEnv } from "./env.js";
import { getPolarConfig } from "./polar-config.js";

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
 * Call once during startup, before the server accepts connections. Without it a
 * missing `JAMENDO_CLIENT_ID` only surfaces as a generic `MC-API-0004` the first
 * time someone uses CC mode, while `/health/db` still reports the container
 * ready, making the breakage invisible and slow to trace. Failing here instead turns the
 * misconfiguration into a loud restart loop, the same way a failed migration
 * does.
 *
 * @throws Error when a required variable is unset or empty; the message (from
 *   {@link requireEnv}) names the variable and notes that `.env.local` is
 *   dev-only.
 */
export function assertRequiredBootEnv(): void {
  for (const name of REQUIRED_BOOT_ENV) {
    requireEnv(name);
  }

  // Polar is optional to boot in the foundation phase: CI and tests that do not
  // wire Polar can leave POLAR_ACCESS_TOKEN unset and the guard stays inert.
  // When the token IS present, however, the rest of the Polar config must also
  // be consistent (correct POLAR_SERVER, valid POLAR_PRODUCTS JSON). Calling
  // getPolarConfig() here converts a misconfiguration from a silent request-time
  // failure into a loud restart loop at boot, matching the guarantee already
  // provided for JAMENDO_CLIENT_ID above.
  if (process.env.POLAR_ACCESS_TOKEN) {
    getPolarConfig();
  }
}
