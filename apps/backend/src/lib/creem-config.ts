import { requireEnv } from "./env.js";

/**
 * The two Creem environments. They are separate accounts that share nothing,
 * so a product created in one does not exist in the other, and every product
 * id belongs to exactly one of them.
 */
export const CreemMode = {
  /** The sandbox, reached with a `creem_test_` key. */
  Test: "test",
  /** The live account, where a payment moves real money. */
  Live: "live",
} as const;

/** A {@link CreemMode} member value. */
export type CreemModeValue = (typeof CreemMode)[keyof typeof CreemMode];

/** Validierte Creem-Laufzeit-Config, an einer Stelle gelesen (fail-fast). */
export interface CreemConfig {
  apiKey: string;
  mode: CreemModeValue;
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
    mode: apiKey.startsWith("creem_test_") ? CreemMode.Test : CreemMode.Live,
    webhookSecret: process.env.CREEM_WEBHOOK_SECRET || undefined,
  };
}
