/**
 * @file Puts a value in the clipboard and says for a moment that it did.
 *
 * Every copy control in the dashboard shares this, so a copy confirms itself
 * the same way and for the same time wherever it is pressed.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * How long a copy control shows that it copied before it offers the copy again:
 * 1.6 seconds, the time lmaa.space's `CopyableCode` uses.
 */
export const COPY_CONFIRMATION_MS = 1600;

/**
 * What {@link useClipboardCopy} returns.
 *
 * @property copied - `true` from a successful copy until
 *   {@link COPY_CONFIRMATION_MS} have passed, `false` otherwise and by default.
 * @property copy - Writes a value to the clipboard. A browser that refuses the
 *   clipboard leaves `copied` at `false`, so the value stays on screen to be
 *   selected by hand, and nothing is thrown.
 */
export interface ClipboardCopy {
  copied: boolean;
  copy: (value: string) => Promise<void>;
}

/**
 * Copies a value and keeps a flag up for {@link COPY_CONFIRMATION_MS}.
 *
 * A second copy within that time restarts it, and the timer is cleared when the
 * component unmounts, so no state is set on a component that is gone.
 *
 * @returns The flag and the copy function.
 */
export function useClipboardCopy(): ClipboardCopy {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
  }, []);

  return { copied, copy };
}
