import { requireEnv } from "./env.js";

/**
 * A tier-to-Polar-product mapping entry: one Polar product per billing
 * interval. The Free tier has no entry in the products map.
 */
export interface PolarProductPair {
  month: string;
  year: string;
}

/**
 * Validated Polar runtime config, read from a single call site and validated
 * fail-fast so any misconfiguration surfaces at startup rather than silently
 * breaking billing at request time.
 */
export interface PolarConfig {
  /** Which Polar backend to use: "sandbox" for test mode, "production" for live. */
  server: "sandbox" | "production";
  /** Polar organization access token for API calls. */
  accessToken: string;
  /** Optional webhook signing secret used to verify Polar event payloads. */
  webhookSecret: string | undefined;
  /**
   * Map of tier IDs to their Polar product IDs for each billing interval.
   * The Free tier has no entry here since it has no associated Polar product.
   */
  products: Record<string, PolarProductPair>;
}

/**
 * Parses and validates the POLAR_PRODUCTS JSON string into a typed product map.
 * Throws a descriptive error if the JSON is malformed or any entry is missing
 * the required "month" or "year" string fields.
 *
 * @param raw - The raw JSON string from the POLAR_PRODUCTS env var.
 * @returns A validated map of tier ID to Polar product pair.
 */
function parseProducts(raw: string): Record<string, PolarProductPair> {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error("POLAR_PRODUCTS is not valid JSON.");
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("POLAR_PRODUCTS must be a JSON object of tierId to { month, year }.");
  }
  const out: Record<string, PolarProductPair> = {};
  for (const [tierId, pair] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof pair !== "object" || pair === null) {
      throw new Error(`POLAR_PRODUCTS["${tierId}"] must be an object with month and year.`);
    }
    const { month, year } = pair as Record<string, unknown>;
    if (typeof month !== "string" || !month || typeof year !== "string" || !year) {
      throw new Error(`POLAR_PRODUCTS["${tierId}"] needs non-empty string "month" and "year".`);
    }
    out[tierId] = { month, year };
  }
  return out;
}

/**
 * Reads and validates the Polar runtime config from the environment. Throws on
 * any inconsistency (unknown server, malformed product map) so misconfiguration
 * fails fast instead of silently disabling billing at request time.
 *
 * Call this once at startup (or in the boot guard) rather than on every request.
 * The validated config object is a plain, serialisable value that can be passed
 * to any service that needs it.
 *
 * @returns The validated {@link PolarConfig} object.
 * @throws {Error} When POLAR_SERVER is not "sandbox" or "production".
 * @throws {Error} When POLAR_ACCESS_TOKEN or POLAR_PRODUCTS are missing.
 * @throws {Error} When POLAR_PRODUCTS cannot be parsed or any entry is malformed.
 */
export function getPolarConfig(): PolarConfig {
  const server = requireEnv("POLAR_SERVER");
  if (server !== "sandbox" && server !== "production") {
    throw new Error(`POLAR_SERVER must be "sandbox" or "production", got "${server}".`);
  }
  return {
    server,
    accessToken: requireEnv("POLAR_ACCESS_TOKEN"),
    webhookSecret: process.env.POLAR_WEBHOOK_SECRET || undefined,
    products: parseProducts(requireEnv("POLAR_PRODUCTS")),
  };
}
