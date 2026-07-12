import { useCallback, useEffect, useRef, useState } from "react";
import { CloseCircleIcon, CopyIcon, TickCircleIcon } from "@/lib/icons";

/** How long the "Copied" confirmation stays visible. */
const COPY_FEEDBACK_MS = 2000;

/**
 * Props for {@link TokenRevealBox}.
 */
export interface TokenRevealBoxProps {
  /** The full secret token, available exactly once. */
  rawToken: string;
  /** Name of the app the token belongs to, for context. */
  appName: string;
  /** Called when the developer dismisses the box. */
  onDismiss: () => void;
}

/**
 * One-time token reveal: shows a freshly created/rotated raw token with a
 * copy button and an unmissable "shown only once" warning. Focuses itself on
 * mount so keyboard users land on the announcement, and clears its copy
 * feedback timer on unmount. The token lives only in this component's props.
 * Dismissing the box is final, matching the backend's store-hash-only model.
 *
 * @param props - See {@link TokenRevealBoxProps}.
 * @returns The reveal panel.
 */
export function TokenRevealBox({ rawToken, appName, onDismiss }: TokenRevealBoxProps) {
  const boxRef = useRef<HTMLOutputElement>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const onCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }, [rawToken]);

  return (
    <output ref={boxRef} tabIndex={-1} className="surface-card block px-5 py-4 outline-none">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-body font-medium text-fg">
          New API key for <span className="text-accent">{appName}</span>
        </p>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss. The key will not be shown again."
          className="button button--icon text-fg-muted"
        >
          <CloseCircleIcon className="size-4" aria-hidden="true" />
        </button>
      </div>
      <p className="text-body text-gold mb-3">
        Copy it now. This is the only time the full key is shown. It is stored hashed and cannot be recovered.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 rounded-button border border-border bg-code-bg px-3 py-2 text-code font-mono text-code-fg overflow-x-auto whitespace-nowrap">
          {rawToken}
        </code>
        <button type="button" onClick={onCopy} className="button button--subtle text-body shrink-0">
          {copied ? (
            <TickCircleIcon className="size-4 text-accent" aria-hidden="true" />
          ) : (
            <CopyIcon className="size-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {copyError ? (
        <p className="field__message field__message--error mt-2">Copying failed. Select and copy the key manually.</p>
      ) : null}
    </output>
  );
}
