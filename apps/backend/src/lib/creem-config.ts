import { requireEnv } from "./env.js";

/** Validierte Creem-Laufzeit-Config, an einer Stelle gelesen (fail-fast). */
export interface CreemConfig {
  apiKey: string;
  mode: "test" | "live";
  webhookSecret: string | undefined;
}

/**
 * Reads and validates the Creem runtime config from the environment. The mode
 * (test vs live) is derived from the API key prefix, so a test key can never
 * accidentally hit live and vice versa.
 */
export function getCreemConfig(): CreemConfig {
  const apiKey = requireEnv("CREEM_API_KEY");
  return {
    apiKey,
    mode: apiKey.startsWith("creem_test_") ? "test" : "live",
    webhookSecret: process.env.CREEM_WEBHOOK_SECRET || undefined,
  };
}
