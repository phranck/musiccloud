/**
 * @file What the two sponsorship proxies share: the body limit, the relay of
 * the backend's answer, and the refusals they give themselves.
 *
 * `pages/api/sponsorships.ts` and `pages/api/sponsorships/[reference].ts` differ
 * only in the backend route they call, so both hand their request here.
 */

import { type McErrorCode, PENDING_SPONSORSHIP_BODY_MAX_BYTES } from "@musiccloud/shared";

import { apiErrorResponse, relayHeaders } from "@/api/proxy-response";

/** The status a body above the limit is refused with: 413, as the backend's own body limit answers it. */
const PAYLOAD_TOO_LARGE_STATUS = 413;

/** The code that refusal carries: `MC-REQ-0001`, which is what the backend maps a 413 to. */
const PAYLOAD_TOO_LARGE_CODE: McErrorCode = "MC-REQ-0001";

/** The type every answer of these routes declares where the backend names none: JSON. */
const JSON_CONTENT_TYPE = "application/json";

/**
 * How every answer of these routes may be cached: `no-store`. An answer carries
 * a payment reference, which is the credential to rewrite the request, so no
 * cache along the way may keep it.
 */
const NO_STORE = "no-store";

/**
 * The response headers the backend sets and the proxy passes on unchanged.
 *
 * - `Content-Type`: what the body is.
 * - `Retry-After`: how long a visitor over the rate limit waits.
 */
const FORWARDED_HEADERS = ["Content-Type", "Retry-After"] as const;

/**
 * Answers a request the proxy refuses itself, in the public error envelope, so
 * the form shows it like any refusal from the backend.
 *
 * @param status - The HTTP status.
 * @param code - The `MC-*` code, whose registry sentence becomes the message.
 * @returns The response, with a fresh error ID and `Cache-Control: no-store`.
 */
export function sponsorshipErrorResponse(status: number, code: McErrorCode): Response {
  return apiErrorResponse(status, code, { "Cache-Control": NO_STORE });
}

/**
 * Reads a request body, but no further than a limit.
 *
 * The declared length is checked first, so an honest large body is refused
 * without reading it. A body that declares nothing, or declares less than it
 * sends, is read only until it passes the limit.
 *
 * @param request - The visitor's request.
 * @param maxBytes - The most bytes the body may hold.
 * @returns The body as text, or `null` when it is longer than `maxBytes`.
 */
async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("Content-Length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Relays a sponsorship request to the backend and its answer back to the form.
 *
 * A body longer than `PENDING_SPONSORSHIP_BODY_MAX_BYTES` is refused here with
 * `413` and `MC-REQ-0001`, as the backend would refuse it, without being sent
 * on. Everything else goes to the backend as it arrived. The backend's status,
 * body, `Content-Type` and `Retry-After` reach the browser unchanged, so a
 * refusal keeps its `MC-*` code, its message and its error ID. Every answer
 * carries `Cache-Control: no-store`.
 *
 * @param request - The visitor's request.
 * @param forward - Sends the body to the backend route this proxy stands for,
 *   with the visitor's address.
 * @returns The answer for the browser.
 */
export async function relaySponsorshipRequest(
  request: Request,
  forward: (body: string) => Promise<Response>,
): Promise<Response> {
  const body = await readBoundedBody(request, PENDING_SPONSORSHIP_BODY_MAX_BYTES);
  if (body === null) return sponsorshipErrorResponse(PAYLOAD_TOO_LARGE_STATUS, PAYLOAD_TOO_LARGE_CODE);

  const upstream = await forward(body);
  const headers = relayHeaders(upstream, FORWARDED_HEADERS, {
    "Content-Type": JSON_CONTENT_TYPE,
    "Cache-Control": NO_STORE,
  });
  return new Response(await upstream.text(), { status: upstream.status, headers });
}
