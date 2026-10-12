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
 * @property data - The response body as parsed JSON, success or failure, for a
 *   caller that needs more than the outcome. Unset when the body is not JSON.
 */
export interface AuthResult {
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
  errorId?: string;
  data?: unknown;
}

/** The methods the portal's auth surface uses. Anything else is a mistake, not a choice. */
export type AuthRequestMethod = "POST" | "PATCH";

/**
 * Send a JSON body to a same-origin auth endpoint and normalise the result.
 *
 * Sends `credentials: "same-origin"` so the BFF can read and set the
 * `mc_dev_session` cookie. A successful 2xx yields `{ ok: true }`; a non-2xx
 * reads the error body into `code`, `message` and `errorId`; either way the
 * parsed body is `data`. A thrown fetch (offline, DNS, abort) yields
 * `{ ok: false, status: 0 }`. Never throws.
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

    // A body that is not JSON, such as a proxy's 502 page, leaves every field unset.
    const data: unknown = await res.json().catch(() => undefined);
    if (res.ok) return { ok: true, status: res.status, data };

    const errorBody = parseApiErrorResponse(data ?? null);
    return {
      ok: false,
      status: res.status,
      code: errorBody.error,
      message: errorBody.message,
      errorId: errorBody.errorId,
      data,
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
