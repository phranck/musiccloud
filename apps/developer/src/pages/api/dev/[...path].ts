import type { APIRoute } from "astro";
import { backendUrl, INTERNAL_API_KEY } from "@/lib/api";

export const prerender = false;

/**
 * Response headers that must NOT be copied from the backend onto the relayed
 * response. `content-encoding` / `content-length` describe the upstream byte
 * stream; once we hand the body to a new `Response`, the Node adapter
 * re-derives them, and forwarding the stale values corrupts the transfer.
 */
const STRIPPED_RESPONSE_HEADERS = new Set(["content-encoding", "content-length"]);

/**
 * BFF proxy for the developer portal. Forwards every `/api/dev/*` request to the
 * backend (`BACKEND_URL`), injecting the internal API key and the real client
 * IP, passing the browser `Cookie` header through, and relaying the backend's
 * response — crucially including `Set-Cookie`, so the `mc_dev_session` cookie is
 * set first-party on `developer.musiccloud.io`.
 *
 * ## Auth surface
 *
 * The backend's `/api/dev/*` routes are public (registered with no auth
 * preHandler in `apps/backend/src/server.ts`); the session is the httpOnly
 * `mc_dev_session` cookie carried by this proxy, not the internal key. We attach
 * `X-API-Key` regardless because it is ignored on a public route and keeps the
 * proxy forward-compatible if the backend later guards these paths.
 *
 * ## Cookie relay
 *
 * `request.headers.get("cookie")` carries the browser's `mc_dev_session` /
 * `mc_dev_oauth_state` cookies into the backend so `/me` and `exchange` see the
 * session. On the way back, `Headers.getSetCookie()` (available under the
 * `@astrojs/node` runtime) returns the unfolded `Set-Cookie` list; each entry is
 * appended verbatim so the browser stores them host-only on the portal domain.
 * A `?? []` guard keeps the proxy working on any runtime where the method is
 * absent, in which case the single folded `set-cookie` value (if any) is already
 * copied by the generic header loop below.
 *
 * @param context - Astro API route context: `params.path` is the wildcard tail,
 *   `request` the inbound browser request, `clientAddress` the real visitor IP.
 * @returns The backend's response, streamed back with status + headers intact.
 */
export const ALL: APIRoute = async ({ params, request, clientAddress }) => {
  const path = params.path ?? "";
  const target = backendUrl(`/api/dev/${path}`);

  const headers = new Headers();
  if (INTERNAL_API_KEY) headers.set("X-API-Key", INTERNAL_API_KEY);
  if (clientAddress) headers.set("X-Forwarded-For", clientAddress);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }
  const backendRes = await fetch(target, init);

  // Relay status + headers (including a single folded Set-Cookie, if the runtime
  // lacks getSetCookie) and stream the body back.
  const outHeaders = new Headers();
  backendRes.headers.forEach((value, key) => {
    if (STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) return;
    outHeaders.append(key, value);
  });

  // Re-append every Set-Cookie verbatim so multiple cookies survive (the folded
  // form above merges them with a comma, which breaks dates inside Expires).
  const setCookies = backendRes.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    outHeaders.delete("set-cookie");
    for (const value of setCookies) outHeaders.append("set-cookie", value);
  }

  return new Response(backendRes.body, { status: backendRes.status, headers: outHeaders });
};
