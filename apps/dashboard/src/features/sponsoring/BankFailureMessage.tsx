import { dashboardCopy } from "@/copy/dashboard";
import type { ApiRequestError } from "@/shared/utils/api-error";

/** Props of {@link BankFailureMessage}. */
interface BankFailureMessageProps {
  /** What the failure means for the operator, in the bank connection's own words. */
  message: string;
  /** What the request threw, whose code and error id follow the words. */
  error: unknown;
}

/**
 * Says why an action on the bank connection failed.
 *
 * lmaa.space names each failure in its own sentence rather than in the
 * server's, because the sentence says what to do next. musiccloud's error
 * contract adds the stable code and the error id behind it, because those two
 * are what an operator quotes when they report it. The message is an alert,
 * because it appears in answer to a press the operator just made.
 *
 * @param props - See {@link BankFailureMessageProps}.
 * @returns The message.
 */
export function BankFailureMessage({ message, error }: BankFailureMessageProps) {
  const failure = error as ApiRequestError | null;
  const parts = [
    message,
    failure?.errorCode ? `(${failure.errorCode})` : null,
    failure?.errorId ? dashboardCopy.common.errorId.replace("{id}", failure.errorId) : null,
  ];
  return (
    <p role="alert" className="text-sm text-[var(--ds-danger-text)]">
      {parts.filter(Boolean).join(" ")}
    </p>
  );
}
