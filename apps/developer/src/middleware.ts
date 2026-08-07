import { defineMiddleware } from "astro:middleware";
import { applySecurityHeaders, SurfaceExposure } from "@musiccloud/shared";

import { PortalGateMode, renderPortalGateHtml } from "./lib/coming-soon";
import { getPortalAvailability } from "./lib/portal-availability";

const DOCUMENTATION_PATH = "/docs";
const ALWAYS_REACHABLE_PATHS = new Set(["/developer-theme.css", "/favicon.svg"]);

function isAlwaysReachable(pathname: string): boolean {
  return (
    ALWAYS_REACHABLE_PATHS.has(pathname) ||
    pathname === DOCUMENTATION_PATH ||
    pathname.startsWith(`${DOCUMENTATION_PATH}/`) ||
    pathname.startsWith("/_astro/")
  );
}

/**
 * Global request gate. The system documentation namespace and built assets remain available
 * in every state. All other routes fail closed to Coming Soon if the internal
 * state cannot be read. Maintenance deliberately preserves the original URL
 * and uses 503 so browsers, caches, and monitors understand it is temporary.
 *
 * @param pathname - Request path, deciding whether the gate applies at all.
 * @param next - Continues to the matched route.
 * @returns Either the gate page or whatever the route produced.
 */
async function gateRequest(pathname: string, next: () => Promise<Response>): Promise<Response> {
  if (isAlwaysReachable(pathname)) {
    return next();
  }

  const availability = await getPortalAvailability();

  if (availability?.maintenance) {
    return new Response(renderPortalGateHtml(PortalGateMode.Maintenance), {
      status: 503,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "300",
      },
    });
  }

  if (!availability?.public) {
    return new Response(renderPortalGateHtml(PortalGateMode.ComingSoon), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  return next();
}

/**
 * Runs the availability gate, then attaches the browser-boundary headers.
 *
 * The headers are applied to whatever the gate returns, so the Coming Soon and
 * Maintenance pages carry them too. Those are the states in which the portal is
 * most likely to be poked at, which is the wrong moment to be the one host
 * without a policy.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await gateRequest(context.url.pathname, next);
  applySecurityHeaders(response.headers, SurfaceExposure.Public);
  return response;
});
