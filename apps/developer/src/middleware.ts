import { defineMiddleware } from "astro:middleware";
import {
  applySecurityHeaders,
  buildEnforcedContentSecurityPolicy,
  ENDPOINTS,
  hashesFromAstroPolicy,
  SurfaceExposure,
} from "@musiccloud/shared";

import { PORTAL_GATE_CONTENT_SECURITY_POLICY, PortalGateMode, renderPortalGateHtml } from "./lib/coming-soon";
import { PORTAL_FONT_FACE_HASH } from "./lib/fonts";
import { getPortalAvailability } from "./lib/portal-availability";
import { createRenderedPageCache } from "./lib/rendered-page-cache";

const DOCUMENTATION_PATH = "/docs";
const ALWAYS_REACHABLE_PATHS = new Set(["/developer-theme.css", "/favicon.svg"]);

/** The API reference's address, with and without its trailing slash. */
const API_REFERENCE_PATHS = new Set([`${DOCUMENTATION_PATH}/api`, `${DOCUMENTATION_PATH}/api/`]);

/**
 * How long the rendered API reference is reused: long enough to spare the
 * server the render, short enough for a navigation change to show.
 */
const API_REFERENCE_CACHE_MS = 5 * 60 * 1000;

const apiReferenceCache = createRenderedPageCache(API_REFERENCE_CACHE_MS);

/**
 * Whether a path stays reachable whatever state the portal is in.
 *
 * The gate pages load the theme, the fonts under `/_astro/` and the analytics
 * proxy from this origin, so those have to pass the gate, or it would answer
 * each of them with its own page.
 */
function isAlwaysReachable(pathname: string): boolean {
  return (
    ALWAYS_REACHABLE_PATHS.has(pathname) ||
    pathname === DOCUMENTATION_PATH ||
    pathname.startsWith(`${DOCUMENTATION_PATH}/`) ||
    pathname.startsWith("/_astro/") ||
    pathname.startsWith(`${ENDPOINTS.frontend.umami}/`)
  );
}

/**
 * The gate page as a response, uncached and with its own complete content
 * policy, which the shared headers then leave alone.
 *
 * @param mode - Which gate page to render.
 * @param status - 200 while the portal is closed, 503 during maintenance.
 * @param extraHeaders - Headers only one of the two states sends.
 * @returns The response for any gated route.
 */
function gateResponse(mode: PortalGateMode, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(renderPortalGateHtml(mode), {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": PORTAL_GATE_CONTENT_SECURITY_POLICY,
      ...extraHeaders,
    },
  });
}

/**
 * The matched route's response, with the content policy Astro wrote replaced
 * by the portal's complete one.
 *
 * Astro lists the hashes of the scripts and styles it emits. The layout writes
 * its `@font-face` block inline, and that hash comes from the constant the
 * layout renders. Highlighted code and editorial content carry `style`
 * attributes. A response without Astro's policy, such as an endpoint, keeps
 * the shared reported one.
 *
 * @param next - Continues to the matched route.
 * @returns The route's response.
 */
async function routeResponse(next: () => Promise<Response>): Promise<Response> {
  const response = await next();
  const astroPolicy = response.headers.get("content-security-policy");
  if (astroPolicy) {
    const { scriptHashes, styleHashes } = hashesFromAstroPolicy(astroPolicy);
    response.headers.set(
      "content-security-policy",
      buildEnforcedContentSecurityPolicy(SurfaceExposure.Public, {
        scriptHashes,
        styleHashes: [...styleHashes, PORTAL_FONT_FACE_HASH],
        styleAttributes: true,
      }),
    );
  }
  return response;
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
  if (API_REFERENCE_PATHS.has(pathname)) {
    return apiReferenceCache(() => routeResponse(next));
  }
  if (isAlwaysReachable(pathname)) {
    return routeResponse(next);
  }

  const availability = await getPortalAvailability();

  if (availability?.maintenance) {
    return gateResponse(PortalGateMode.Maintenance, 503, { "retry-after": "300" });
  }

  if (!availability?.public) {
    return gateResponse(PortalGateMode.ComingSoon, 200);
  }

  return routeResponse(next);
}

/**
 * Runs the availability gate, then attaches the browser-boundary headers.
 *
 * The headers are applied to whatever the gate returns, so the Coming Soon and
 * Maintenance pages carry them too. Those are the states in which the portal is
 * most likely to be poked at, which is the wrong moment to be the one host
 * without a policy. The gate pages bring their own complete content policy,
 * which the shared headers keep.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await gateRequest(context.url.pathname, next);
  applySecurityHeaders(response.headers, SurfaceExposure.Public);
  return response;
});
