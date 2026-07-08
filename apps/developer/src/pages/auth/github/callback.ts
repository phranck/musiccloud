import { ENDPOINTS } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { backendUrl, internalHeaders } from "@/lib/api";

export const prerender = false;

/**
 * Name of the short-lived, httpOnly cookie set by `/auth/github` carrying the
 * OAuth `state` nonce. Must match `STATE_COOKIE_NAME` in `../github.ts`.
 */
const STATE_COOKIE_NAME = "mc_dev_oauth_state";

/** Where the developer lands when the OAuth callback fails CSRF or exchange. */
const LOGIN_OAUTH_ERROR = "/login?error=oauth";

/** Where the developer lands after a successful exchange. */
const DASHBOARD_PATH = "/dashboard";

/**
 * `Set-Cookie` value that immediately clears the state cookie, mirroring the
 * `path` it was set with so the browser drops the right one. `Max-Age=0` expires
 * it at once; the state is single-use and must not outlive the round-trip.
 */
const CLEAR_STATE_COOKIE = `${STATE_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;

/**
 * Build a 302 redirect carrying an explicit set of `Set-Cookie` headers.
 *
 * The callback must emit several cookies at once: the backend's `mc_dev_session`
 * (relayed verbatim so its httpOnly/secure/SameSite flags survive) plus the
 * state-cookie clear. Astro's `context.cookies` store only applies to responses
 * Astro itself produces, so we construct the `Response` directly (the pattern
 * used by `apps/frontend/src/pages/api/redirect.ts`) and append each cookie as a
 * raw header, the one place where all outgoing cookies are guaranteed to land.
 *
 * @param location - The redirect target (`Location` header).
 * @param setCookies - Raw `Set-Cookie` header values to append verbatim.
 * @returns A 302 `Response` with `Location` and every supplied cookie set.
 */
function redirectWithCookies(location: string, setCookies: string[]): Response {
  const headers = new Headers({ Location: location });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * `GET /auth/github/callback`: the completion of the GitHub OAuth flow.
 *
 * GitHub redirects here with `code` + `state`. CSRF defence: the `state` query
 * parameter must match the httpOnly `mc_dev_oauth_state` cookie set by
 * `/auth/github`; a missing cookie or mismatch means the callback was not
 * initiated by this browser session, so we bounce to `/login?error=oauth`
 * without ever touching the code.
 *
 * On a valid state the `code` + `state` are exchanged server-to-server at the
 * backend `exchange` endpoint (the secret-bearing half). A non-200 likewise
 * bounces to the error page. On success the backend's `Set-Cookie` for
 * `mc_dev_session` is relayed verbatim onto the redirect so the session is
 * stored first-party on the portal domain, the now-spent state cookie is
 * cleared, and the developer is sent to `/dashboard`.
 *
 * @param context - Astro API route context; `url` carries the query params,
 *   `cookies` reads the state cookie, `clientAddress` is forwarded for rate
 *   limiting.
 * @returns A redirect to `/dashboard` on success, or to `/login?error=oauth`.
 */
export const GET: APIRoute = async (context) => {
  const code = context.url.searchParams.get("code");
  const state = context.url.searchParams.get("state");
  const stateCookie = context.cookies.get(STATE_COOKIE_NAME)?.value;

  // CSRF: the echoed state must match the cookie minted at /auth/github.
  if (!code || !state || !stateCookie || stateCookie !== state) {
    return redirectWithCookies(LOGIN_OAUTH_ERROR, [CLEAR_STATE_COOKIE]);
  }

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.auth.github.exchange), {
      method: "POST",
      headers: internalHeaders(context.clientAddress),
      body: JSON.stringify({ code, state }),
    });

    // HTTP 409 with error "NO_ACCOUNT": a GitHub identity attempted to sign in
    // but has no registered developer account. Redirect to pricing so the
    // visitor can start a signup flow from there. The state cookie is cleared;
    // no session is set.
    if (res.status === 409) {
      let isNoAccount = false;
      try {
        const body = (await res.json()) as { error?: string };
        isNoAccount = body.error === "NO_ACCOUNT";
      } catch {
        // Unparseable body; fall through to the generic error path below.
      }
      if (isNoAccount) {
        return redirectWithCookies("/pricing?signup=required", [CLEAR_STATE_COOKIE]);
      }
    }

    if (!res.ok) return redirectWithCookies(LOGIN_OAUTH_ERROR, [CLEAR_STATE_COOKIE]);

    // Relay the backend session cookie(s) verbatim, then clear the spent state.
    const sessionCookies = res.headers.getSetCookie?.() ?? [];
    const single = res.headers.get("set-cookie");
    const relayed = sessionCookies.length > 0 ? sessionCookies : single ? [single] : [];

    return redirectWithCookies(DASHBOARD_PATH, [...relayed, CLEAR_STATE_COOKIE]);
  } catch {
    return redirectWithCookies(LOGIN_OAUTH_ERROR, [CLEAR_STATE_COOKIE]);
  }
};
