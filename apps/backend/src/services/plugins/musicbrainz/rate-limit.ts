/**
 * @file Single-slot 1 req/s gate for MusicBrainz API calls.
 *
 * MusicBrainz enforces 1 req/s for unauthenticated callers; exceeding
 * the rate produces 503 Service Unavailable with `Retry-After`. This
 * module serialises every outgoing MB request through one async slot
 * that releases on a fixed schedule, so callers can fire concurrently
 * without coordinating themselves.
 *
 * The 1100ms gap (rather than 1000ms) leaves headroom for clock skew
 * and the small variance in MB's own bucket replenishment. Empirically
 * 1000ms still produces sporadic 503s under load.
 */

const MIN_INTERVAL_MS = 1100;

let nextSlotAt = 0;

/**
 * Wait until the next available slot, then mark it consumed. Returns
 * when the caller is allowed to issue exactly one request.
 *
 * Internally schedules the next slot `MIN_INTERVAL_MS` after the one
 * just claimed, so back-to-back callers serialise naturally without
 * a queue data structure.
 */
export async function acquireMusicBrainzSlot(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextSlotAt);
  nextSlotAt = slot + MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

/** Test-only: reset the gate state between cases. */
export function _resetMusicBrainzGate(): void {
  nextSlotAt = 0;
}
