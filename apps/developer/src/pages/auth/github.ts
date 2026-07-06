import { ENDPOINTS } from "@musiccloud/shared";
import type { APIRoute } from "astro";
import { backendUrl, internalHeaders } from "@/lib/api";

export const prerender = false;

/**
 * Name of the short-lived, httpOnly cookie that carries the OAuth `state` nonce
 * between this redirect and the `/auth/github/callback` handler. Compared
 * against the `state` query parameter GitHub echoes back to defend against
 * cross-site request forgery on the callback (see `github/callback.ts`).
 */
const STATE_COOKIE_NAME = "mc_dev_oauth_state";

/** State-cookie lifetime in seconds: long enough to complete the GitHub consent screen and short enough to bound replay. */
const STATE_COOKIE_MAX_AGE = 600;

/** Where the developer lands when the OAuth start cannot be initiated. */
const LOGIN_OAUTH_ERROR = "/login?error=oauth";

/**
 * `GET /auth/github`: the entry point of the GitHub OAuth flow.
 *
 * Calls the backend `start` endpoint server-to-server (never exposing the
 * internal key to the browser) to mint a signed, short-lived `state` and the
 * GitHub authorize URL. The `state` is stored in the httpOnly
 * `mc_dev_oauth_state` cookie so the callback can prove the round-trip
 * originated here (CSRF defence), then the visitor is redirected to GitHub.
 *
 * On any backend failure (non-200, malformed payload, transport error) the
 * developer is sent back to `/login?error=oauth` rather than to a broken GitHub
 * URL, so the failure surfaces as an inline notice on the sign-in page.
 *
 * @param context - Astro API route context; `cookies` sets the state cookie,
 *   `clientAddress` is forwarded so the backend rate-limits per visitor, and
 *   `redirect` issues the 302.
 * @returns A redirect to the GitHub authorize URL, or to the login page on error.
 */
export const GET: APIRoute = async (context) => {
  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.auth.github.start), {
      headers: internalHeaders(context.clientAddress),
    });
    if (!res.ok) return context.redirect(LOGIN_OAUTH_ERROR);

    const data = (await res.json()) as { authorizeUrl?: string; state?: string };
    if (!data.authorizeUrl || !data.state) return context.redirect(LOGIN_OAUTH_ERROR);

    context.cookies.set(STATE_COOKIE_NAME, data.state, {
      httpOnly: true,
      secure: import.meta.env.PROD,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_COOKIE_MAX_AGE,
    });

    return context.redirect(data.authorizeUrl);
  } catch {
    return context.redirect(LOGIN_OAUTH_ERROR);
  }
};
