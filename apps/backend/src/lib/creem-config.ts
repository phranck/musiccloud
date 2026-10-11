/**
 * The two Creem environments. They are separate accounts that share nothing,
 * so a product created in one does not exist in the other, and every product
 * id belongs to exactly one of them.
 */
export const CreemMode = {
  /** The sandbox, where no payment moves real money. */
  Test: "test",
  /** The live account, where a payment charges a real card. */
  Live: "live",
} as const;

/** A {@link CreemMode} member value. */
export type CreemModeValue = (typeof CreemMode)[keyof typeof CreemMode];

/** The key prefix Creem gives a sandbox key. Anything else is a live key. */
const TEST_KEY_PREFIX = "creem_test_";

/** Which environment variable holds each environment's key. */
const KEY_VARIABLE: Record<CreemModeValue, string> = {
  [CreemMode.Test]: "CREEM_TEST_API_KEY",
  [CreemMode.Live]: "CREEM_LIVE_API_KEY",
};

/**
 * The variable a key was read from before there was one per environment. Its
 * key fills the slot its own prefix names, so a deployment that predates the
 * second key keeps working unchanged.
 */
const LEGACY_KEY_VARIABLE = "CREEM_API_KEY";

/**
 * Whether any Creem key variable is set: one of {@link KEY_VARIABLE} or
 * {@link LEGACY_KEY_VARIABLE}.
 *
 * The boot check asks this before it validates the configuration, because a
 * deployment without Creem is valid. It reads the same table
 * {@link getCreemConfig} does, so a variable added there is seen here as well.
 *
 * @returns `true` when at least one of the variables holds a value.
 */
export function hasAnyCreemKeyVariable(): boolean {
  return [...Object.values(KEY_VARIABLE), LEGACY_KEY_VARIABLE].some((name) => Boolean(process.env[name]));
}

/**
 * Thrown when this deployment holds no key for the environment asked for.
 *
 * It is a type of its own rather than a message to match, because an unset key
 * and a Creem that refuses are diagnosed in different places. The pricing page
 * logs this one as `creem_not_configured` and every other failure as Creem
 * being unavailable.
 */
export class CreemKeyMissingError extends Error {
  /**
   * @param mode - The environment this deployment has no key for. The message
   *   names the variable that would hold it.
   */
  constructor(readonly mode: CreemModeValue) {
    super(
      `No Creem key for the ${mode} environment. Set ${KEY_VARIABLE[mode]} in the runtime environment. ` +
        ".env.local is only for local development.",
    );
    this.name = "CreemKeyMissingError";
  }
}

/**
 * The environment a Creem key belongs to, read from its own prefix.
 *
 * @param apiKey - The key.
 * @returns The environment that key talks to.
 */
export function modeOfApiKey(apiKey: string): CreemModeValue {
  return apiKey.startsWith(TEST_KEY_PREFIX) ? CreemMode.Test : CreemMode.Live;
}

/** The validated Creem runtime configuration, read in one place so a fault fails fast. */
export interface CreemConfig {
  /**
   * The API key per environment. An environment with no key is one this
   * deployment cannot reach at all, which is the normal state before the live
   * account exists.
   */
  apiKeys: Partial<Record<CreemModeValue, string>>;
  webhookSecret: string | undefined;
}

/**
 * Reads and validates the Creem runtime config from the environment.
 *
 * A deployment may hold a key for one environment or for both. `CREEM_API_KEY`
 * is accepted as well and fills the slot its own prefix names, so a deployment
 * that predates the second key keeps working unchanged.
 *
 * Every key is checked against the variable it was found in. A sandbox key in
 * `CREEM_LIVE_API_KEY` is the one mistake that must never pass quietly: it
 * would make the shop look live whilst charging nobody, and the reverse would
 * charge people during a test.
 *
 * @returns The keys per environment and the webhook secret.
 * @throws Error when a key sits in the variable of the other environment, or
 *   when two variables name the same environment with different keys.
 */
export function getCreemConfig(): CreemConfig {
  const apiKeys: Partial<Record<CreemModeValue, string>> = {};

  for (const mode of Object.values(CreemMode)) {
    const value = process.env[KEY_VARIABLE[mode]];
    if (!value) continue;
    const actual = modeOfApiKey(value);
    if (actual !== mode) {
      throw new Error(
        `${KEY_VARIABLE[mode]} holds a ${actual} key. A key belongs to the environment its prefix names, ` +
          `and putting one in the other's variable would point the shop at the wrong Creem account.`,
      );
    }
    apiKeys[mode] = value;
  }

  const legacyKey = process.env[LEGACY_KEY_VARIABLE];
  if (legacyKey) {
    const mode = modeOfApiKey(legacyKey);
    const existing = apiKeys[mode];
    if (existing && existing !== legacyKey) {
      throw new Error(
        `${LEGACY_KEY_VARIABLE} and ${KEY_VARIABLE[mode]} both name the ${mode} environment with different keys. ` +
          `Remove ${LEGACY_KEY_VARIABLE}, which exists only so a deployment that predates the second key keeps working.`,
      );
    }
    apiKeys[mode] = legacyKey;
  }

  return { apiKeys, webhookSecret: process.env.CREEM_WEBHOOK_SECRET || undefined };
}

/**
 * The environments this deployment holds a key for, in a stable order.
 *
 * The dashboard reads this to decide which environment it can act on, so an
 * operator sees why a control is unavailable rather than having it fail.
 *
 * @returns The reachable environments, test first.
 */
export function configuredCreemModes(): CreemModeValue[] {
  const { apiKeys } = getCreemConfig();
  return Object.values(CreemMode).filter((mode) => apiKeys[mode] !== undefined);
}

/**
 * The API key for one environment.
 *
 * @param mode - The environment to reach.
 * @returns Its key.
 * @throws {@link CreemKeyMissingError} naming the variable to set when this
 *   deployment has no key for that environment. Failing here is deliberate,
 *   because the alternative is falling back to the other account, which is the
 *   one thing that must never happen silently.
 * @throws Error from {@link getCreemConfig} when the configuration conflicts.
 */
export function requireCreemApiKey(mode: CreemModeValue): string {
  const key = getCreemConfig().apiKeys[mode];
  if (!key) throw new CreemKeyMissingError(mode);
  return key;
}
