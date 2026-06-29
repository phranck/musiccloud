/** Seconds one arrow-key step skips. */
export const SEEK_STEP_SECONDS = 10;
/** Guard kept before the real end for the "jump near end" shortcut. */
export const SEEK_END_GUARD_SECONDS = 3;

/**
 * Resolves the clamped target time for a relative seek.
 *
 * @param currentTime - The player's current position in seconds.
 * @param deltaSeconds - Signed offset to apply (e.g. +10 / -10).
 * @param duration - Track duration in seconds.
 * @returns The new time, clamped to `0 … duration`.
 */
export function resolveSeekTarget(currentTime: number, deltaSeconds: number, duration: number): number {
  return Math.max(0, Math.min(duration, currentTime + deltaSeconds));
}
