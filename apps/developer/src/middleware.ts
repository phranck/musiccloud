import { defineMiddleware } from "astro:middleware";
import {
  applySecurityHeaders,
  buildEnforcedContentSecurityPolicy,
  ENDPOINTS,
  hashesFromAstroPolicy,
  SurfaceExposure,
} from "@musiccloud/shared";
import type { APIContext } from "astro";

import { PORTAL_GATE_CONTENT_SECURITY_POLICY, PortalGateMode, renderPortalGateHtml } from "./lib/coming-soon";
import { PORTAL_FONT_FACE_HASH } from "./lib/fonts";
import { readInvitationPass } from "./lib/invitation-pass";
import { getPortalAvailability } from "./lib/portal-availability";
import { createRenderedPageCache } from "./lib/rendered-page-cache";
import { getDeveloperSession } from "./lib/session";

const DOCUMENTATION_PATH = "/docs";

/**
 * Reachable in every state. The invitation page and the call it makes belong
 * here, because an invitation exists to be followed while the portal is shut.
 */
const ALWAYS_REACHABLE_PATHS = new Set([
  "/developer-theme.css",
  "/favicon.svg",
  "/invite",
  ENDPOINTS.dev.auth.redeemInvitation,
]);

/**
 * Reachable by everybody while the portal is closed. A person invited earlier
 * has to be able to sign in on a device they have never used, and the gate
 * cannot know who somebody is before they sign in. Signing in admits nobody:
 * every other page asks for the grant afterwards. Matched exactly, so nothing
 * beneath these paths comes with them.
 */
const SIGN_IN_PATHS = new Set([
  "/login",
  "/forgot",
  "/reset",
  "/verify",
  "/confirm-email",
  "/auth/github",
  "/auth/github/callback",
  ENDPOINTS.dev.auth.login,
  ENDPOINTS.dev.auth.logout,
  ENDPOINTS.dev.auth.me,
  ENDPOINTS.dev.auth.requestReset,
  ENDPOINTS.dev.auth.resetPassword,
  ENDPOINTS.dev.auth.verifyEmail,
  ENDPOINTS.dev.auth.confirmEmailChange,
]);

/** Reachable while the portal is closed by a request carrying a valid invitation pass. */
const SIGN_UP_PATHS = new Set(["/signup", ENDPOINTS.dev.auth.signup]);

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
 * Global request gate. The system documentation namespace, built assets and
 * the invitation page remain available in every state. Maintenance
 * deliberately preserves the original URL and uses 503 so browsers, caches,
 * and monitors understand it is temporary.
 *
 * While the portal is closed, the sign-in paths stay open, a session whose
 * account carries the grant passes, and a valid invitation pass opens
 * sign-up. Everything else meets the Coming Soon page, and so does every path
 * when the availability state cannot be read.
 *
 * The session and the pass are only looked up for a request carrying the
 * cookie, and the session only while the portal is closed, so a public portal
 * costs no extra call. On a sign-up path the pass is read whatever the state,
 * because the page starts its address field with the invited address.
 *
 * @param context - The request's context: its URL, cookies, visitor address and locals.
 * @param next - Continues to the matched route.
 * @returns Either the gate page or whatever the route produced.
 */
async function gateRequest(context: APIContext, next: () => Promise<Response>): Promise<Response> {
  const { pathname } = context.url;
  if (API_REFERENCE_PATHS.has(pathname)) {
    return apiReferenceCache(() => routeResponse(next));
  }
  if (isAlwaysReachable(pathname)) {
    return routeResponse(next);
  }

  const availability = await getPortalAvailability();
  if (!availability) {
    return gateResponse(PortalGateMode.ComingSoon, 200);
  }
  if (availability.maintenance) {
    return gateResponse(PortalGateMode.Maintenance, 503, { "retry-after": "300" });
  }

  const signUp = SIGN_UP_PATHS.has(pathname);
  if (signUp) {
    const invitation = await readInvitationPass(context);
    if (invitation) context.locals.invitation = invitation;
  }

  if (availability.public || SIGN_IN_PATHS.has(pathname) || (signUp && context.locals.invitation)) {
    return routeResponse(next);
  }
  if ((await getDeveloperSession(context))?.portalAccess) {
    return routeResponse(next);
  }
  return gateResponse(PortalGateMode.ComingSoon, 200);
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
  const response = await gateRequest(context, next);
  applySecurityHeaders(response.headers, SurfaceExposure.Public);
  return response;
});
