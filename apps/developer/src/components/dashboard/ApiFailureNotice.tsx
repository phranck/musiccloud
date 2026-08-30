import { useCallback, useState } from "react";
import { CopyIcon } from "@/lib/icons";

/**
 * Props for {@link ApiFailureNotice}.
 */
export interface ApiFailureNoticeProps {
  /** The stable `MC-*` code the backend answered with, if it sent one. */
  code?: string;
  /** The safe message the backend answered with. */
  message?: string;
  /** The backend's unique id for the failed request, if it sent one. */
  errorId?: string;
  /** On a `429`, how long the backend asked the caller to wait. */
  retryAfterSeconds?: number;
}

/** Shown when the backend sent nothing usable, such as after a transport failure. */
const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/**
 * The standard way this portal reports a failed request.
 *
 * It shows the message, the stable code, and the error id, and it makes the
 * id copyable in one click. The id is the only thing that connects what a
 * developer saw to the one backend log line that explains it, so a report
 * that quotes it is answerable and one that does not is guesswork.
 *
 * @param props - See {@link ApiFailureNoticeProps}.
 * @returns The failure notice.
 */
export function ApiFailureNotice({ code, message, errorId, retryAfterSeconds }: ApiFailureNoticeProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    if (!errorId) return;
    await navigator.clipboard.writeText(errorId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [errorId]);

  return (
    <div role="alert" className="surface-card surface-card--danger px-4 py-3 flex flex-col gap-1">
      <p className="text-body text-fg">{message ?? FALLBACK_MESSAGE}</p>
      {retryAfterSeconds !== undefined && (
        <p className="text-nav text-fg-subtle">Try again in {retryAfterSeconds} seconds.</p>
      )}
      {(code || errorId) && (
        <p className="text-nav text-fg-subtle flex items-center gap-2 flex-wrap">
          {code && <span>{code}</span>}
          {errorId && (
            <>
              <span className="font-mono">{errorId}</span>
              <button
                type="button"
                onClick={onCopy}
                aria-label={copied ? "Error id copied" : "Copy the error id"}
                title={copied ? "Copied" : "Copy the error id"}
                className="text-fg-subtle hover:text-accent transition-colors"
              >
                <CopyIcon className="size-4" aria-hidden="true" />
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
}
