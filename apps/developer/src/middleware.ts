import { defineMiddleware } from "astro:middleware";

import { PortalGateMode, renderPortalGateHtml } from "./lib/coming-soon";
import { getPortalAvailability } from "./lib/portal-availability";

const API_REFERENCE_PATH = "/docs/api";
const ALWAYS_REACHABLE_PATHS = new Set([API_REFERENCE_PATH, "/developer-theme.css", "/favicon.svg"]);

function isAlwaysReachable(pathname: string): boolean {
  return (
    ALWAYS_REACHABLE_PATHS.has(pathname) || pathname === `${API_REFERENCE_PATH}/` || pathname.startsWith("/_astro/")
  );
}

/**
 * Global request gate. The API reference and its built assets remain available
 * in every state. All other routes fail closed to Coming Soon if the internal
 * state cannot be read. Maintenance deliberately preserves the original URL
 * and uses 503 so browsers, caches, and monitors understand it is temporary.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  if (isAlwaysReachable(context.url.pathname)) {
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
});
