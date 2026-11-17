/**
 * @file The copy button beside each line of the transfer card.
 */

import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";

/** How long the button says it copied, in milliseconds: 2,000. */
const COPIED_FEEDBACK_MS = 2_000;

/** Props of {@link CopyValueButton}. */
interface CopyValueButtonProps {
  /** What the button copies. */
  value: string;
  /** The line's label, so the button is announced as "Copy IBAN". */
  label: string;
  /** The word for copying, such as "Copy". */
  copyLabel: string;
  /** The word for having copied, such as "Copied". */
  copiedLabel: string;
}

/**
 * A button that copies one value of the transfer card.
 *
 * It says that it copied for a moment and then returns, so the reader can copy
 * the next line without the first still claiming to be fresh. Where the browser
 * refuses the clipboard, nothing happens and the value stays selectable.
 *
 * @param props - See {@link CopyValueButtonProps}.
 * @returns The button.
 */
export function CopyValueButton({ value, label, copyLabel, copiedLabel }: CopyValueButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`${copied ? copiedLabel : copyLabel} ${label}`}
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:text-text-primary"
    >
      {copied ? (
        <CheckIcon weight="bold" aria-hidden="true" className="size-4 text-success" />
      ) : (
        <CopyIcon weight="duotone" aria-hidden="true" className="size-4" />
      )}
    </button>
  );
}
