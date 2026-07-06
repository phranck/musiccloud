/**
 * @file Browser-side fetch helper for the developer-portal auth forms.
 *
 * The auth forms are React islands that POST JSON to the same-origin BFF
 * (`/api/dev/auth/*`), which proxies to the backend and relays the session
 * cookie. This module centralises that fetch so each form only describes *what*
 * it sends and *how* it reacts, not the transport boilerplate (method,
 * headers, JSON encode/decode, `credentials`, error normalisation).
 */

/**
 * Normalised outcome of an auth POST.
 *
 * @property ok - Whether the response status was 2xx.
 * @property status - The HTTP status code (0 on a transport/network failure).
 * @property code - The backend `error` machine code on failure, if present.
 * @property message - The backend `message`, if present.
 */
export interface AuthResult {
  ok: boolean;
  status: number;
  code?: string;
  message?: string;
}

/**
 * POST a JSON body to a same-origin auth endpoint and normalise the result.
 *
 * Sends `credentials: "same-origin"` so the BFF can read and set the
 * `mc_dev_session` cookie. A successful 2xx yields `{ ok: true }`; a non-2xx
 * parses the `{ error, message }` body into `code` / `message`; a thrown fetch
 * (offline, DNS, abort) yields `{ ok: false, status: 0 }`. Never throws.
 *
 * @param path - The same-origin endpoint path (e.g. `ENDPOINTS.dev.auth.login`).
 * @param body - A JSON-serialisable request body.
 * @param signal - Optional `AbortSignal` to cancel an in-flight request (used by
 *   the verify view's mount effect cleanup).
 * @returns The normalised {@link AuthResult}.
 */
export async function postAuth(path: string, body: unknown, signal?: AbortSignal): Promise<AuthResult> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });

    if (res.ok) return { ok: true, status: res.status };

    let code: string | undefined;
    let message: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; message?: string };
      code = data.error;
      message = data.message;
    } catch {
      // Non-JSON error body (e.g. a proxy 502 HTML page); leave code/message unset.
    }
    return { ok: false, status: res.status, code, message };
  } catch {
    return { ok: false, status: 0 };
  }
}
