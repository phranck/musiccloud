/**
 * @file The one log line the site's server writes for an error ID it hands to
 * a visitor, so the ID they quote can be found together with its cause.
 *
 * Kept apart from `api/client.ts`, which reads `BACKEND_URL` on import, so the
 * proxy helpers in `api/proxy-response.ts` can log without loading the client.
 */
import type { McErrorCode } from "@musiccloud/shared";

/** The `cause` logged for a thrown value that is not an `Error`, so it has no name. */
const UNKNOWN_CAUSE = "unknown";

/**
 * One incident whose error ID a visitor was shown.
 *
 * @property component - The part of the site that answered, such as `BackendClient`.
 * @property errorCode - The `MC-*` code the visitor was shown.
 * @property errorId - The error ID the visitor was shown.
 * @property operation - What was being done when it failed, such as `backend_request`.
 * @property outcome - How it failed, such as `transport_failed` or `body_interrupted`.
 * @property cause - A stable name for the cause: a Node system error code or an
 *   error's `name`, never its message, which can carry addresses or data.
 */
export interface IncidentLogEntry {
  component: string;
  errorCode: McErrorCode;
  errorId: string;
  operation: string;
  outcome: string;
  cause: string;
}

/**
 * Names a caught value for the `cause` field without reading its message.
 *
 * @param error - Whatever a `catch` received.
 * @returns The error's `name`, or `unknown` for a value that is not an `Error`.
 */
export function errorCauseName(error: unknown): string {
  return error instanceof Error ? error.name : UNKNOWN_CAUSE;
}

/**
 * Writes one incident as a single structured line on `console.error`.
 *
 * @param entry - The incident, with the error ID the visitor was shown.
 */
export function logIncident(entry: IncidentLogEntry): void {
  console.error(JSON.stringify(entry));
}
