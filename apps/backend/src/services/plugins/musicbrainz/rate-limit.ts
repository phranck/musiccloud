/**
 * @file Single-slot 1 req/s gate for MusicBrainz API calls.
 *
 * MusicBrainz enforces 1 req/s for unauthenticated callers; exceeding
 * the rate produces 503 Service Unavailable with `Retry-After`. This
 * module serializes every outgoing MB request through one shared
 * minimum-interval throttle, so callers can fire concurrently without
 * coordinating themselves.
 *
 * The 1100ms gap (rather than 1000ms) leaves headroom for clock skew
 * and the small variance in MB's own bucket replenishment. Empirically
 * 1000ms still produces sporadic 503s under load.
 */

import { createMinIntervalThrottle } from "../../../lib/infra/throttle.js";

/** The minimum gap in milliseconds between the starts of two MusicBrainz requests. */
const MIN_INTERVAL_MS = 1100;

/** The one throttle every MusicBrainz request in this process waits for. */
const musicBrainzThrottle = createMinIntervalThrottle(MIN_INTERVAL_MS);

/**
 * Waits until the next available slot, then marks it consumed. Returns
 * when the caller is allowed to issue exactly one request. Callers are
 * served in the order they call, each at least `MIN_INTERVAL_MS` after
 * the previous one started.
 *
 * @returns A promise that resolves when the caller's slot has come.
 */
export function acquireMusicBrainzSlot(): Promise<void> {
  return musicBrainzThrottle.acquire();
}

/** Test-only: reset the gate state between cases. */
export function _resetMusicBrainzGate(): void {
  musicBrainzThrottle.reset();
}
