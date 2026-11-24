/**
 * @file How the Astro proxy routes under `pages/api` answer the browser: which
 * backend headers they pass on, how they refuse a request themselves, and the
 * one handler both resolve routes share.
 *
 * Server-only, like `api/client.ts` beside it, because the resolve handler
 * calls the backend through it.
 */
import { createApiErrorBody, type McErrorCode, visitorAddress } from "@musiccloud/shared";
import type { APIRoute } from "astro";

/** The `Content-Type` of every error envelope and of a resolve answer: JSON. */
const JSON_CONTENT_TYPE = "application/json";

/** The status a request the proxy cannot pass on is refused with: 400. */
const BAD_REQUEST_STATUS = 400;

/** The code that refusal carries: `MC-REQ-0001`, the registry's code for an invalid request. */
const BAD_REQUEST_CODE: McErrorCode = "MC-REQ-0001";

/**
 * The backend headers a resolve answer passes on to the browser.
 *
 * - `Retry-After`: how long a visitor over the rate limit waits.
 */
const RESOLVE_FORWARDED_HEADERS = ["Retry-After"] as const;

/**
 * Copies chosen headers of a backend response onto the headers of the answer.
 *
 * The answer starts from `base`. Each name in `names` that the backend sent
 * with a non-empty value then replaces the base value or is added, and a name
 * the backend did not send keeps the base value or stays absent.
 *
 * @param upstream - The backend's response.
 * @param names - The header names to pass on, in any letter case.
 * @param base - The headers the answer carries where the backend sends none,
 *   or nothing when the answer carries only what the backend sent.
 * @returns The headers for the answer.
 */
export function relayHeaders(upstream: Response, names: readonly string[], base?: HeadersInit): Headers {
  const headers = new Headers(base);
  for (const name of names) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

/**
 * Answers a request the proxy refuses itself, in the public error envelope, so
 * the page shows it like any refusal from the backend.
 *
 * @param status - The HTTP status.
 * @param code - The `MC-*` code, whose registry sentence becomes the message.
 * @param extraHeaders - Headers the answer carries beside `Content-Type:
 *   application/json`, such as `Cache-Control`, or nothing.
 * @returns The response, with a fresh error ID.
 */
export function apiErrorResponse(status: number, code: McErrorCode, extraHeaders?: HeadersInit): Response {
  const headers = new Headers({ "Content-Type": JSON_CONTENT_TYPE });
  new Headers(extraHeaders).forEach((value, name) => {
    headers.set(name, value);
  });
  return new Response(JSON.stringify(createApiErrorBody(code, { errorId: crypto.randomUUID() })), {
    status,
    headers,
  });
}

/**
 * Answers a request whose parameters the proxy cannot pass on with `400` and
 * `MC-REQ-0001` in the public error envelope.
 *
 * @param extraHeaders - Headers the answer carries beside `Content-Type:
 *   application/json`, such as `Cache-Control: no-store`, or nothing.
 * @returns The response, with a fresh error ID.
 */
export function badRequestResponse(extraHeaders?: HeadersInit): Response {
  return apiErrorResponse(BAD_REQUEST_STATUS, BAD_REQUEST_CODE, extraHeaders);
}

/**
 * Sends a resolve request to the backend.
 *
 * @param body - The visitor's resolve payload: a free-text `query` or a
 *   `selectedCandidate` picked from a disambiguation list.
 * @param clientIp - The visitor's address, forwarded for the backend's rate limit.
 * @param origin - The `Origin` header of the visitor's request.
 * @returns The backend's response, or the error envelope when none arrived.
 */
export type ResolveFetcher = (
  body: { query?: string; selectedCandidate?: string },
  clientIp?: string,
  origin?: string,
) => Promise<Response>;

/**
 * Builds the `POST` handler of a resolve proxy page.
 *
 * The visitor's JSON body, address and `Origin` go to the backend through
 * `resolve`. The backend's status and body stream back unchanged, with
 * `Content-Type: application/json` and the backend's `Retry-After` when it
 * sent one.
 *
 * @param resolve - The backend call of the resolve family, commercial or
 *   Creative Commons.
 * @returns The handler the page exports as `POST`.
 */
export function createResolveRoute(resolve: ResolveFetcher): APIRoute {
  return async ({ request, clientAddress }) => {
    const body = await request.json();
    const origin = request.headers.get("Origin") ?? undefined;
    const backendResponse = await resolve(body, visitorAddress({ request, clientAddress }), origin);
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: relayHeaders(backendResponse, RESOLVE_FORWARDED_HEADERS, { "Content-Type": JSON_CONTENT_TYPE }),
    });
  };
}
