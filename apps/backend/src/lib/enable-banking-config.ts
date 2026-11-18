/**
 * @file The Enable Banking credential, read and validated in one place.
 *
 * Ported from lmaa.space's `ENABLE_BANKING_*` handling in
 * `apps/backend/src/config/env.ts`, which validates its whole environment with
 * one Zod schema. musiccloud reads each feature's variables in a file of its
 * own, as `creem-config.ts` does for Creem, and the boot check calls
 * {@link getEnableBankingConfig} so a half-set credential stops the start.
 */

/** The variable that holds the application id Enable Banking knows musiccloud by. */
export const ENABLE_BANKING_APPLICATION_ID_VARIABLE = "ENABLE_BANKING_APPLICATION_ID";

/** The variable that holds the RSA private key that signs every request token. */
export const ENABLE_BANKING_PRIVATE_KEY_VARIABLE = "ENABLE_BANKING_PRIVATE_KEY";

/** What an application id looks like: a UUID, which is what Enable Banking issues. */
const APPLICATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A line break as the Zerops variable editor writes it out.
 *
 * A PEM is several lines and the editor holds one, so the value arrives with
 * its line breaks written as the two characters `\n`. `createSign` needs them
 * back as breaks before it reads the key.
 */
const WRITTEN_OUT_LINE_BREAK = /\\n/g;

/** The validated credential: both halves, the key with real line breaks. */
export interface EnableBankingConfig {
  /** The application id, a UUID, which also names the key in every token's header. */
  applicationId: string;
  /** The PEM private key that signs each request token. Never logged and never returned on a route. */
  privateKey: string;
}

/**
 * Reads the credential from the environment.
 *
 * Optional, because musiccloud runs without a bank connection and the bank
 * routes answer `MC-BANK-0001` while it is absent. Neither half is optional of
 * the other, though: one without the other is a configuration that cannot sign
 * anything, and it fails here rather than at the first request.
 *
 * @returns The credential, or `null` when neither variable is set.
 * @throws Error naming the missing variable when only one half is set, or
 *   saying the application id is not a UUID. No message carries a value.
 */
export function getEnableBankingConfig(): EnableBankingConfig | null {
  const applicationId = process.env[ENABLE_BANKING_APPLICATION_ID_VARIABLE] || undefined;
  const privateKey = process.env[ENABLE_BANKING_PRIVATE_KEY_VARIABLE] || undefined;
  if (!applicationId && !privateKey) return null;

  if (!applicationId || !privateKey) {
    const missing = applicationId ? ENABLE_BANKING_PRIVATE_KEY_VARIABLE : ENABLE_BANKING_APPLICATION_ID_VARIABLE;
    throw new Error(`${missing} is required whenever the other Enable Banking variable is set.`);
  }
  if (!APPLICATION_ID_PATTERN.test(applicationId)) {
    throw new Error(`${ENABLE_BANKING_APPLICATION_ID_VARIABLE} must be a UUID.`);
  }

  return { applicationId, privateKey: privateKey.replace(WRITTEN_OUT_LINE_BREAK, "\n") };
}

/**
 * Whether the deployment holds the credential that reaches Enable Banking.
 *
 * @returns `true` only when both halves are configured.
 * @throws Error from {@link getEnableBankingConfig} when only one half is set,
 *   which the boot check has already refused in a running backend.
 */
export function isEnableBankingConfigured(): boolean {
  return getEnableBankingConfig() !== null;
}
