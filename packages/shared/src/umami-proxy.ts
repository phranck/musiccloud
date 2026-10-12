/**
 * @file The same-origin proxy for Umami, which the site and the developer
 * portal both serve under `/api/mc`.
 *
 * The browser loads the Umami script from the page's own origin and posts its
 * events there, and the host passes both on to {@link UMAMI_ORIGIN}. Routing
 * tracking through first-party paths keeps the script and its beacons out of
 * reach of the blocklists that drop a third-party request, and keeps the
 * content policy free of an analytics host.
 *
 * ## Why the visitor's address travels in vendor headers
 *
 * Umami resolves a visitor's country, region and city from the source address
 * of the event request when it stores the event. This proxy re-issues that
 * request from the server, so without help every event would geolocate to the
 * server's own address.
 *
 * The reverse proxy in front of the Umami instance overwrites the standard
 * forwarding headers (`X-Forwarded-For`, `X-Real-IP`, `X-Client-IP`) with its
 * immediate peer before Umami reads them. It passes `True-Client-IP` and
 * `CF-Connecting-IP` through untouched, and Umami prefers those for
 * geolocation, so the visitor's address goes into both. `X-Forwarded-For` is
 * kept for any other consumer that reads it. This behaviour was measured
 * against the live instance.
 *
 * The visitor is the first hop of the incoming `X-Forwarded-For` chain, which
 * the host's own ingress sets, with the connection's address as the fallback
 * where the header is absent, as in local development. Any proxy that drops
 * the visitor's address breaks every consumer downstream that reads it.
 */

import { UMAMI_ORIGIN } from "./security-headers.js";

/** How long a request to Umami may take before the proxy gives up on it. */
const UMAMI_TIMEOUT_MS = 5000;

/** How long a browser may cache the proxied script. */
const SCRIPT_CACHE_SECONDS = 86_400;

/**
 * Fetches the Umami tracking script for a same-origin route.
 *
 * A failure answers with an empty 204, so a page whose analytics are down
 * loads as if it had none rather than logging a script error. The 204 carries
 * a `null` body, because the runtime refuses to build a 204 with any body at
 * all, even an empty string.
 *
 * @returns The script with a day of caching, or an empty 204.
 */
export async function proxyUmamiScript(): Promise<Response> {
  try {
    const upstream = await fetch(`${UMAMI_ORIGIN}/script.js`, { signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS) });
    if (!upstream.ok) return new Response(null, { status: 204 });
    return new Response(await upstream.text(), {
      status: 200,
      headers: {
        "Content-Type": "application/javascript",
        "Cache-Control": `public, max-age=${SCRIPT_CACHE_SECONDS}`,
      },
    });
  } catch {
    return new Response(null, { status: 204 });
  }
}

/**
 * Forwards one Umami event with the visitor's address where Umami reads it.
 *
 * @param request - The browser's event request, whose body and user agent are passed on.
 * @param clientAddress - The address of the connection, used when `X-Forwarded-For` is absent.
 * @returns Umami's answer, or an empty 204 when Umami could not be reached.
 */
export async function proxyUmamiEvent(request: Request, clientAddress: string | undefined): Promise<Response> {
  try {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const visitorAddress = forwardedFor?.split(",")[0]?.trim() || clientAddress;
    const upstream = await fetch(`${UMAMI_ORIGIN}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": request.headers.get("user-agent") ?? "",
        ...(visitorAddress
          ? {
              "X-Forwarded-For": forwardedFor ?? visitorAddress,
              "True-Client-IP": visitorAddress,
              "CF-Connecting-IP": visitorAddress,
            }
          : {}),
      },
      body: await request.text(),
      signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response(null, { status: 204 });
  }
}
