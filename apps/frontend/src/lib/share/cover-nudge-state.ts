/** Persistent count of eligible cover visits in this browser. */
export const COVER_NUDGE_VISITS_KEY = "musiccloud:cover-nudge-visits";

/** Permanent suppression after the visitor intentionally uses the media-view toggle. */
export const COVER_NUDGE_SUPPRESSED_KEY = "musiccloud:cover-nudge-suppressed";

/** The nudge appears on every second eligible visit. */
const COVER_NUDGE_INTERVAL = 2;

interface CoverVisitInput {
  storage: Storage;
  coverVisible: boolean;
  motionAllowed: boolean;
}

/**
 * Registers one visible, motion-eligible cover visit and reports whether it should nudge.
 * Suppressed, hidden, reduced-motion, or storage-blocked visits leave the stored count unchanged.
 */
export function registerCoverVisit({ storage, coverVisible, motionAllowed }: CoverVisitInput): boolean {
  if (!coverVisible || !motionAllowed) return false;
  try {
    if (storage.getItem(COVER_NUDGE_SUPPRESSED_KEY) !== null) return false;
    const stored = storage.getItem(COVER_NUDGE_VISITS_KEY);
    const parsed = stored === null ? 0 : Number(stored);
    const previous = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    const visit = previous + 1;
    storage.setItem(COVER_NUDGE_VISITS_KEY, String(visit));
    return visit % COVER_NUDGE_INTERVAL === 0;
  } catch {
    return false;
  }
}

/** Permanently suppresses future nudges without disturbing the existing view preference. */
export function suppressCoverNudge(storage: Storage): void {
  try {
    storage.setItem(COVER_NUDGE_SUPPRESSED_KEY, "1");
  } catch {
    // The current interaction still owns the view when persistent storage is blocked.
  }
}
