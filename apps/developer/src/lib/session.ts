/**
 * @file Server-side developer session helpers for protected Astro pages.
 *
 * These run in `.astro` frontmatter (SSR), reading the httpOnly
 * `mc_dev_session` cookie and resolving it against the backend `/me` endpoint.
 * The portal session is a cookie (not a Bearer token), so the browser never
 * sees the account directly — the page asks the backend on every render.
 */
import { ENDPOINTS } from "@musiccloud/shared";
import type { AstroGlobal } from "astro";
import { backendUrl, internalHeaders } from "@/lib/api";

/**
 * Name of the httpOnly session cookie set by the backend on developer login /
 * OAuth exchange. Kept in lockstep with the backend's `SESSION_COOKIE_NAME`
 * (`apps/backend/src/services/developer-auth.ts`).
 */
const SESSION_COOKIE_NAME = "mc_dev_session";

/**
 * Public shape of a developer account as returned by the backend `/me`,
 * `/login` and `/signup` endpoints (mirrors `buildAccountResponse` in
 * `apps/backend/src/routes/developer-auth.ts`). The backend never serializes the
 * password hash, status, or update timestamps onto this payload.
 */
export interface Account {
  /** Stable account identifier (UUID). */
  id: string;
  /** The account's email address. */
  email: string;
  /** Whether the email has been verified via the signup verification link. */
  emailVerified: boolean;
  /**
   * Whether the account has a password set. `false` for a GitHub-only
   * account (no email/password identity) — the dashboard's Danger Zone
   * skips the password-confirmation field for those accounts.
   */
  hasPassword: boolean;
  /** Optional display name; `null` until the developer sets one. */
  displayName: string | null;
  /** Optional avatar URL (e.g. GitHub or Gravatar); `null` when unset. */
  avatarUrl: string | null;
  /**
   * Display name of the account's assigned tier, or `null` when no tier is
   * assigned yet (assignment is an admin action in the dashboard). Only the
   * `/me` endpoint resolves it — which is the endpoint this helper calls.
   */
  tierName: string | null;
  /** Account creation timestamp as an ISO-8601 string. */
  createdAt: string;
}

/**
 * Resolve the current developer account from the request's session cookie.
 *
 * Reads `mc_dev_session` from the incoming request; without it, returns `null`
 * immediately (no backend round-trip). Otherwise calls the backend `/me`
 * server-to-server, forwarding the cookie and the real client IP, and returns
 * the account on `200` or `null` on any non-200 / transport failure. Never
 * throws, so a protected page can branch on `null` without a try/catch.
 *
 * @param astro - The Astro global (page frontmatter) or API context; only
 *   `cookies` and `clientAddress` are read.
 * @returns The authenticated {@link Account}, or `null` when there is no valid
 *   session.
 */
export async function getDeveloperSession(astro: AstroGlobal): Promise<Account | null> {
  const sessionCookie = astro.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!sessionCookie) return null;

  try {
    const res = await fetch(backendUrl(ENDPOINTS.dev.auth.me), {
      headers: internalHeaders(astro.clientAddress, {
        cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}`,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { account: Account };
    return data.account;
  } catch {
    return null;
  }
}
