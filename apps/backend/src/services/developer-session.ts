/**
 * @file Which developer account a session cookie belongs to.
 *
 * `authenticateDeveloper` refuses a request on every answer but an account.
 * Redeeming an invitation link asks the same question without refusing,
 * because the link works for somebody signed in and for somebody who is not.
 * Both read the answer from here, so what counts as a valid session cannot
 * differ between them.
 */
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getDeveloperRepository } from "../db/index.js";
import { isDeveloperAccountActive, SessionKind } from "./developer-auth.js";

/** Why a session cookie names no account that may act. */
export const DeveloperSessionRefusal = {
  /** No cookie at all. */
  Missing: "missing",
  /** A token that does not verify, has expired, or is not a developer session. */
  Invalid: "invalid",
  /** A valid token whose account is gone or not active. */
  Inactive: "inactive",
} as const;

/** One of the reasons in {@link DeveloperSessionRefusal}. */
export type DeveloperSessionRefusalValue = (typeof DeveloperSessionRefusal)[keyof typeof DeveloperSessionRefusal];

/** The account a session belongs to, or why there is none. */
export type DeveloperSessionResolution = { account: DeveloperAccount } | { refusal: DeveloperSessionRefusalValue };

/**
 * Resolves a session cookie to the account it belongs to.
 *
 * The account is loaded on every call rather than trusted from the token, so
 * a suspended or deleted account stops acting at once.
 *
 * @param token - The `mc_dev_session` cookie's value, or `undefined`.
 * @param verify - The verifier, `(token) => app.jwt.verify(token)`, which
 *   throws on a bad signature or an expired token.
 * @returns The account, or the reason there is none.
 */
export async function resolveDeveloperSession(
  token: string | undefined,
  verify: (token: string) => unknown,
): Promise<DeveloperSessionResolution> {
  if (!token) return { refusal: DeveloperSessionRefusal.Missing };

  let payload: { sub?: unknown; kind?: unknown };
  try {
    payload = verify(token) as { sub?: unknown; kind?: unknown };
  } catch {
    return { refusal: DeveloperSessionRefusal.Invalid };
  }
  if (payload.kind !== SessionKind.Developer || typeof payload.sub !== "string" || payload.sub === "") {
    return { refusal: DeveloperSessionRefusal.Invalid };
  }

  const account = await (await getDeveloperRepository()).findDeveloperAccountById(payload.sub);
  if (!account || !isDeveloperAccountActive(account)) return { refusal: DeveloperSessionRefusal.Inactive };
  return { account };
}
