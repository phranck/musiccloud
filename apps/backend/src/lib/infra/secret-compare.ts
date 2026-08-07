/**
 * @file Constant-time comparison for shared secrets presented in a request.
 */
import { timingSafeEqual } from "node:crypto";

/**
 * Compares a value supplied by a caller against a configured secret without
 * leaking, through timing, how much of it was correct.
 *
 * `===` stops at the first differing byte, so how long it runs depends on how
 * many leading bytes matched. The difference is small, and over the open
 * internet it disappears into the noise of the connection, which is why this is
 * hardening rather than the repair of an exploitable hole. It is worth doing
 * because it costs one function, and because the same codebase deliberately
 * pays a bcrypt round against a dummy hash so that login duration reveals
 * nothing. A secret compared carelessly next to that is an odd pairing.
 *
 * The length is compared first, and not in constant time. `timingSafeEqual`
 * throws on differing lengths, and the length of a configured secret is not
 * itself a secret worth protecting.
 *
 * @param provided - The raw header or parameter value from the request. Any
 *   non-string, including `undefined` and a repeated header's array, fails.
 * @param expected - The configured secret. An empty value never matches, so a
 *   missing configuration cannot accidentally accept an empty header.
 * @returns Whether the two are byte-for-byte identical.
 */
export function secretsMatch(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== "string" || !expected) return false;

  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}
