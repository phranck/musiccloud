/**
 * @file How long an App Attest key of the Apple app is kept without use,
 * and the sweep that removes older ones.
 *
 * The number is here, once. The privacy policy states the same period, so
 * changing it means changing that text too.
 */
import { RETENTION_DAY_MS } from "./api-access-retention.js";

/**
 * How long a key is kept after its last use.
 *
 * An active installation renews its session about once a week, which marks
 * its key as used. Ninety days without a renewal means the app has not been
 * used on that device for a quarter, so its key goes; it attests a new one
 * if it comes back.
 */
export const APP_ATTEST_KEY_RETENTION_DAYS = 90;

/**
 * Removes the keys unused for longer than `APP_ATTEST_KEY_RETENTION_DAYS`.
 *
 * @param deleteUnusedSince - Deletes the keys whose last use is before the cutoff, and returns how many.
 * @param now - The moment to measure the cutoff back from.
 * @returns How many keys were removed.
 */
export async function sweepAppAttestKeyRetention(
  deleteUnusedSince: (cutoff: Date) => Promise<number>,
  now: number,
): Promise<number> {
  return deleteUnusedSince(new Date(now - APP_ATTEST_KEY_RETENTION_DAYS * RETENTION_DAY_MS));
}
