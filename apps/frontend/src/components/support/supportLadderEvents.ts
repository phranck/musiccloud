/**
 * @file How something outside the support ladder asks it to open one of its tabs.
 *
 * Ported from lmaa.space (`apps/frontend/src/lib/support-ladder-events.ts`). The
 * sponsor wall and the ladder are separate parts of a page and share no state,
 * so they share this event, and its name lives here rather than being typed out
 * on both sides.
 */

import type { SupportIntervalKeyValue } from "@musiccloud/shared";

/** The event the ladder listens for. */
export const CHOOSE_SUPPORT_INTERVAL_EVENT = "mc:choose-support-interval";

/**
 * What that event carries.
 *
 * @property key - The tab to open.
 */
export interface ChooseSupportIntervalDetail {
  key: SupportIntervalKeyValue;
}

/**
 * Asks whichever ladder is on the page to open a tab and come into view.
 *
 * @param key - The tab to open.
 * @returns `true` when a ladder took the request, `false` when none is on the
 *   page, which a ladder signals by cancelling the event.
 */
export function chooseSupportInterval(key: SupportIntervalKeyValue): boolean {
  const event = new CustomEvent<ChooseSupportIntervalDetail>(CHOOSE_SUPPORT_INTERVAL_EVENT, {
    detail: { key },
    cancelable: true,
  });
  return !window.dispatchEvent(event);
}
