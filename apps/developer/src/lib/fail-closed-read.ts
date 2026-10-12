/**
 * @file The log line for a backend read the portal's gate could not complete
 * and therefore answered as closed.
 */

/** What a failed read reports beside its operation. */
export interface FailClosedReadFields {
  /** The error's name when the request threw, never its message. */
  cause?: string;
  /** What went wrong: `unexpected_status`, `invalid_payload` or `request_failed`. */
  reason: string;
  /** The backend's status where it answered with one. */
  status?: number;
}

/**
 * Logs a backend read the gate answered as closed.
 *
 * Response bodies, endpoint URLs, headers, cookies and error messages are left
 * out, because each can carry deployment details or credentials. The line
 * stays useful to operators through its stable code and outcome. The code is
 * the registry's own for a first-party app that could not complete a backend
 * request, so a search of the registry for it finds the entry.
 *
 * @param operation - Which read failed, such as `developer_portal_availability_read`.
 * @param fields - Why it failed.
 */
export function logFailClosedRead(operation: string, fields: FailClosedReadFields): void {
  console.warn(JSON.stringify({ errorCode: "MC-SYS-0002", operation, outcome: "fail_closed", ...fields }));
}
