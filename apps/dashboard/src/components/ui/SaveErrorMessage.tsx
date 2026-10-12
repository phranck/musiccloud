import { dashboardCopy } from "@/copy/dashboard";
import { type ApiRequestError, describeRequestFailure } from "@/shared/utils/api-error";

/** Props for {@link SaveErrorMessage}. */
export interface SaveErrorMessageProps {
  /** What the failed request threw. */
  error: unknown;
  /** Classes for where the message sits, such as `mr-auto` in a section footer. */
  className?: string;
}

/**
 * Says why a save was refused, in the server's own words.
 *
 * The server's message ends with its error code, and the error id follows
 * where the response carried one, because those two are what an operator
 * quotes when they report it. Anything thrown that is not an error falls back
 * to the generic sentence. The message is an alert because it appears in
 * answer to a press the operator just made.
 *
 * @param props - See {@link SaveErrorMessageProps}.
 * @returns The message.
 */
export function SaveErrorMessage({ error, className = "" }: SaveErrorMessageProps) {
  return (
    <p role="alert" className={`text-sm text-[var(--ds-danger-text)] ${className}`}>
      {error instanceof Error
        ? describeRequestFailure(error as ApiRequestError, dashboardCopy.common.errorId)
        : dashboardCopy.common.saveError}
    </p>
  );
}
