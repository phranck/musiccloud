/**
 * @file Browser-side fetch helper for the developer-portal auth forms.
 *
 * The auth forms are React islands that POST JSON to the same-origin BFF
 * (`/api/dev/auth/*`), which proxies to the backend and relays the session
 * cookie. This module centralises that fetch so each form only describes *what*
 * it sends and *how* it reacts, not the transport boilerplate (method,
 * headers, JSON encode/decode, `credentials`, error normalisation).
 */

import { parseApiErrorResponse } from "@musiccloud/shared";

/**
 * Normalised outcome of an auth POST.
 *
 * @property ok - Whether the response status was 2xx.
 * @property status - The HTTP status code (0 on a transport/network failure).
 * @property code - The backend `error` machine code on failure, if present.
 * @property message - The backend `message`, if present.
 * @property errorId - The backend's unique id for the failed request, which
 *   connects what a developer reports to the one log line that explains it.
 */
export interface AuthResult {
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
  errorId?: string;
}

/** The methods the portal's auth surface uses. Anything else is a mistake, not a choice. */
export type AuthRequestMethod = "POST" | "PATCH";

/**
 * Send a JSON body to a same-origin auth endpoint and normalise the result.
 *
 * Sends `credentials: "same-origin"` so the BFF can read and set the
 * `mc_dev_session` cookie. A successful 2xx yields `{ ok: true }`; a non-2xx
 * reads the error body into `code`, `message` and `errorId`; a thrown fetch
 * (offline, DNS, abort) yields `{ ok: false, status: 0 }`. Never throws.
 *
 * @param method - The HTTP method to use.
 * @param path - The same-origin endpoint path (e.g. `ENDPOINTS.dev.auth.login`).
 * @param body - A JSON-serialisable request body.
 * @param signal - Optional `AbortSignal` to cancel an in-flight request.
 * @returns The normalised {@link AuthResult}.
 */
export async function sendAuth(
  method: AuthRequestMethod,
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<AuthResult> {
  try {
    const res = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });

    if (res.ok) return { ok: true, status: res.status };

    // A non-JSON error body, such as a proxy's 502 page, leaves every field unset.
    const errorBody = parseApiErrorResponse(await res.json().catch(() => null));
    return {
      ok: false,
      status: res.status,
      code: errorBody.error,
      message: errorBody.message,
      errorId: errorBody.errorId,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * POST a JSON body to a same-origin auth endpoint.
 *
 * @param path - The same-origin endpoint path (e.g. `ENDPOINTS.dev.auth.login`).
 * @param body - A JSON-serialisable request body.
 * @param signal - Optional `AbortSignal` to cancel an in-flight request (used by
 *   the verify view's mount effect cleanup).
 * @returns The normalised {@link AuthResult}.
 */
export function postAuth(path: string, body: unknown, signal?: AbortSignal): Promise<AuthResult> {
  return sendAuth("POST", path, body, signal);
}
