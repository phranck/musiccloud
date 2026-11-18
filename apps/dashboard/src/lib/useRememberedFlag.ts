/**
 * @file A yes or no about a screen that survives a reload, ported from
 * lmaa.space (`apps/dashboard/src/lib/useRememberedFlag.ts`).
 */

import { useCallback, useState } from "react";

/**
 * A yes or no that survives a reload, kept in the browser it was set in.
 *
 * For the small choices somebody makes about a screen rather than about the
 * data, such as whether a section stands open. They belong to the person
 * sitting there and not to the record, so they stay in their browser, stored
 * as `"true"` or `"false"` under `key`.
 *
 * A browser that refuses to store anything still works; the answer is then
 * `fallback` for as long as the page is open.
 *
 * @param key - The browser store key the answer is kept under, one per choice.
 * @param fallback - What holds until somebody decides otherwise, and while nothing is stored.
 * @returns The current answer and a way to change and remember it.
 */
export function useRememberedFlag(key: string, fallback: boolean): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored === null ? fallback : stored === String(true);
    } catch {
      return fallback;
    }
  });

  const remember = useCallback(
    (next: boolean) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, String(next));
      } catch {
        // A browser that stores nothing still shows the section correctly for
        // as long as the page is open, which is a better outcome than failing.
      }
    },
    [key],
  );

  return [value, remember];
}
