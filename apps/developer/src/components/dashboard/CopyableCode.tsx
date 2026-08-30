import { useCallback, useEffect, useState } from "react";
import { CopyIcon, TickCircleIcon } from "@/lib/icons";

/** How long the "Copied" acknowledgement stays visible. */
const COPY_FEEDBACK_MS = 2000;

/**
 * Props for {@link CopyableCode}.
 */
export interface CopyableCodeProps {
  /** The text shown and copied. */
  code: string;
  /** What the copy button announces, so a screen reader knows what it copies. */
  label: string;
  /** Whether the block may wrap. A single value stays on one line; a snippet wraps. */
  multiline?: boolean;
}

/**
 * A block of code with one copy button.
 *
 * One recipe for every copyable value in the dashboard, so a key, a client id
 * and a snippet all look and behave the same and there is one place to change
 * that.
 *
 * @param props - See {@link CopyableCodeProps}.
 * @returns The code block with its copy control.
 */
export function CopyableCode({ code, label, multiline = false }: CopyableCodeProps) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
  }, [code]);

  return (
    <div className="flex flex-col gap-2" data-copyable-code>
      <div className="flex items-start gap-2">
        <pre
          className={`flex-1 min-w-0 rounded-button border border-border bg-code-bg px-3 py-2 text-code font-mono text-code-fg overflow-x-auto${
            multiline ? "" : " whitespace-nowrap"
          }`}
        >
          <code>{code}</code>
        </pre>
        <button
          type="button"
          onClick={onCopy}
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          className="button button--subtle text-body shrink-0"
        >
          {copied ? (
            <TickCircleIcon className="size-4" aria-hidden="true" />
          ) : (
            <CopyIcon className="size-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {copyFailed && (
        <p className="field__message field__message--error">Copying failed. Select and copy it manually.</p>
      )}
    </div>
  );
}
