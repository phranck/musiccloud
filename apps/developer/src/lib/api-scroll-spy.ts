/** One ordered document target measured relative to the current viewport. */
export interface ScrollTarget<T> {
  top: number;
  value: T;
}

/** Covers fractional final positions produced by native smooth scrolling. */
const ACTIVATION_LINE_TOLERANCE_PX = 1;

const MANUAL_SCROLL_KEYS = new Set([" ", "ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);

/** Result of one scroll-spy evaluation, including lock settlement state. */
export interface ScrollSpySelection<T> {
  value: T | undefined;
  pinnedTargetReached: boolean;
}

/** Selects the content target associated with the viewport activation line. */
export function selectActiveScrollTarget<T>(
  targets: readonly ScrollTarget<T>[],
  activationLine: number,
): T | undefined {
  let active = targets[0]?.value;

  for (const target of targets) {
    if (target.top > activationLine + ACTIVATION_LINE_TOLERANCE_PX) break;
    active = target.value;
  }

  return active;
}

/**
 * Resolves the visible scroll target while an explicit navigation target may
 * be pinned during native smooth scrolling.
 *
 * Safari can settle a fraction of a CSS pixel away from the activation line,
 * so the same tolerance used by ordinary target selection also releases the
 * pin. Intermediate anchors never replace the explicit target.
 */
export function resolveScrollSpySelection<T>(
  targets: readonly ScrollTarget<T>[],
  activationLine: number,
  pinnedValue?: T,
): ScrollSpySelection<T> {
  if (pinnedValue === undefined) {
    return {
      pinnedTargetReached: false,
      value: selectActiveScrollTarget(targets, activationLine),
    };
  }

  const pinnedTarget = targets.find((target) => Object.is(target.value, pinnedValue));
  return {
    pinnedTargetReached:
      pinnedTarget !== undefined && Math.abs(pinnedTarget.top - activationLine) <= ACTIVATION_LINE_TOLERANCE_PX,
    value: pinnedValue,
  };
}

/** Returns whether a browser event represents direct user scroll intent. */
export function isManualScrollIntent(eventType: string, key?: string): boolean {
  if (eventType === "pointerdown" || eventType === "touchstart" || eventType === "wheel") return true;
  return eventType === "keydown" && key !== undefined && MANUAL_SCROLL_KEYS.has(key);
}
