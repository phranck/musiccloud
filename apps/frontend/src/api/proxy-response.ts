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
import { errorCauseName, logIncident } from "./incident-log";

/** The `component` of every incident the proxy routes log themselves. */
const PROXY_COMPONENT = "ApiProxy";

/** The `outcome` of a backend answer whose body broke off before the proxy had read it. */
const BODY_INTERRUPTED_OUTCOME = "body_interrupted";

/** The `Content-Type` of every error envelope and of a resolve answer: JSON. */
const JSON_CONTENT_TYPE = "application/json";

/** The status a request the proxy cannot pass on is refused with: 400. */
const BAD_REQUEST_STATUS = 400;

/** The code that refusal carries: `MC-REQ-0001`, the registry's code for an invalid request. */
const BAD_REQUEST_CODE: McErrorCode = "MC-REQ-0001";

/** The status of an address the proxy knows names nothing, without asking the backend: 404. */
const NOT_FOUND_STATUS = 404;

/** The code that answer carries: `MC-RES-0003`, the registry's code for a resource that was not found. */
const NOT_FOUND_CODE: McErrorCode = "MC-RES-0003";

/** The status of an answer the backend began and did not complete: 503. */
const SERVICE_UNAVAILABLE_STATUS = 503;

/** The code that answer carries: `MC-SYS-0002`, the registry's code for a backend that could not be reached. */
const BACKEND_UNAVAILABLE_CODE: McErrorCode = "MC-SYS-0002";

/**
 * The backend headers a resolve answer passes on to the browser.
 *
 * - `Retry-After`: how long a visitor over the rate limit waits.
 */
const RESOLVE_FORWARDED_HEADERS = ["Retry-After"] as const;

/**
 * The backend headers a relayed error answer passes on to the browser.
 *
 * - `Content-Type`: what the error body is, normally `application/json`.
 * - `Retry-After`: how long a visitor over the rate limit waits.
 */
const ERROR_FORWARDED_HEADERS = ["Content-Type", "Retry-After"] as const;

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
  return errorEnvelopeResponse(status, code, crypto.randomUUID(), extraHeaders);
}

/**
 * Builds a response in the public error envelope under a given error ID.
 *
 * @param status - The HTTP status.
 * @param code - The `MC-*` code, whose registry sentence becomes the message.
 * @param errorId - The error ID the body carries, so a caller that logs it
 *   can log the same one.
 * @param extraHeaders - Headers the answer carries beside `Content-Type:
 *   application/json`, or nothing.
 * @returns The response.
 */
function errorEnvelopeResponse(
  status: number,
  code: McErrorCode,
  errorId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers({ "Content-Type": JSON_CONTENT_TYPE });
  new Headers(extraHeaders).forEach((value, name) => {
    headers.set(name, value);
  });
  return new Response(JSON.stringify(createApiErrorBody(code, { errorId })), { status, headers });
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
 * Answers a request whose address the proxy knows names nothing, such as an id
 * of the wrong shape, with `404` and `MC-RES-0003` in the public error envelope.
 *
 * @returns The response, with a fresh error ID.
 */
export function notFoundResponse(): Response {
  return apiErrorResponse(NOT_FOUND_STATUS, NOT_FOUND_CODE);
}

/**
 * Answers a request whose backend answer broke off before the proxy had read
 * it, with `503` and `MC-SYS-0002` in the public error envelope, and logs the
 * error ID with the route and the cause's name through `logIncident`.
 *
 * A backend that cannot be reached at all is answered by the backend client
 * in `api/client.ts` with the same code, so a route needs this only where it
 * reads the backend's body before answering.
 *
 * @param error - What the route's `catch` received. Only its name is logged.
 * @param operation - The route that failed, as a named constant of that route,
 *   such as `sponsors_proxy`.
 * @returns The response, with a fresh error ID that the log line carries too.
 */
export function backendUnavailableResponse(error: unknown, operation: string): Response {
  const errorId = crypto.randomUUID();
  logIncident({
    component: PROXY_COMPONENT,
    errorCode: BACKEND_UNAVAILABLE_CODE,
    errorId,
    operation,
    outcome: BODY_INTERRUPTED_OUTCOME,
    cause: errorCauseName(error),
  });
  return errorEnvelopeResponse(SERVICE_UNAVAILABLE_STATUS, BACKEND_UNAVAILABLE_CODE, errorId);
}

/**
 * Passes a backend error answer on to the browser: its status, its body as
 * the backend sent it, and its `Content-Type` and `Retry-After`.
 *
 * The body is the backend's error envelope with its own `MC-*` code and error
 * ID, or the envelope the backend client built when no answer arrived, so the
 * page shows the same incident reference the backend logged.
 *
 * @param upstream - The backend's answer, with a status of 400 or above.
 * @returns The response, with the body streamed through unread.
 */
export function relayErrorResponse(upstream: Response): Response {
  return new Response(upstream.body, {
    status: upstream.status,
    headers: relayHeaders(upstream, ERROR_FORWARDED_HEADERS),
  });
}

/**
 * Reads the visitor's resolve payload from the request body.
 *
 * @param request - The visitor's `POST` request.
 * @returns The parsed body, or `undefined` when the body is not JSON.
 */
async function readResolveBody(request: Request): Promise<Parameters<ResolveFetcher>[0] | undefined> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
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
 * sent one. A body that is not JSON is refused with `400` and `MC-REQ-0001`
 * before the backend is asked.
 *
 * @param resolve - The backend call of the resolve family, commercial or
 *   Creative Commons.
 * @returns The handler the page exports as `POST`.
 */
export function createResolveRoute(resolve: ResolveFetcher): APIRoute {
  return async ({ request, clientAddress }) => {
    const body = await readResolveBody(request);
    if (body === undefined) return badRequestResponse();
    const origin = request.headers.get("Origin") ?? undefined;
    const backendResponse = await resolve(body, visitorAddress({ request, clientAddress }), origin);
    return new Response(backendResponse.body, {
      status: backendResponse.status,
      headers: relayHeaders(backendResponse, RESOLVE_FORWARDED_HEADERS, { "Content-Type": JSON_CONTENT_TYPE }),
    });
  };
}
