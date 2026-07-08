/**
 * @file GitHub OAuth HTTP layer for the developer portal (MC-065). Framework-
 * free (no Fastify): builds the authorize URL and performs the two
 * secret-bearing GitHub calls (code→token, token→profile) via raw `fetch`, so
 * the client secret never leaves the backend. The route layer owns state,
 * session issuance and account resolution; this module owns only GitHub I/O.
 */
import { requireEnv } from "../lib/env.js";

/** GitHub OAuth web endpoints (token exchange is on github.com, the API on api.github.com). */
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_USER_EMAILS_URL = "https://api.github.com/user/emails";

/**
 * Per-request timeout (ms) for every outbound GitHub call. Without it a stalled
 * GitHub response would block the OAuth exchange handler indefinitely; the
 * `AbortSignal.timeout` aborts the `fetch` with a `TimeoutError`, which the
 * route layer maps to a `502 GITHUB_ERROR`.
 */
const GITHUB_HTTP_TIMEOUT_MS = 10_000;

/**
 * The caller's declared intent for the OAuth flow, carried as a signed claim
 * inside the state JWT so it survives the round-trip to GitHub without being
 * forgeable or tampered with.
 *
 * - `"login"` — the user wants to sign in to an existing account. If no
 *   account is found for the GitHub identity the exchange returns 409 and
 *   does NOT create an account.
 * - `"signup"` — the user wants to create a new account. If no account is
 *   found the exchange creates one and assigns `tier_free`.
 */
export type GitHubOAuthIntent = "login" | "signup";

/**
 * GitHub-OAuth constants shared between the service and the route layer:
 * the requested scopes and the `kind` discriminant stamped into the signed
 * state JWT (so the produced and checked literal never drift).
 */
export const GitHubOAuth = {
  /** Profile + email-address read scopes. */
  Scope: "read:user user:email",
  /** `kind` claim marking a short-lived OAuth state JWT. */
  StateKind: "gh_oauth_state",
} as const;

/**
 * Normalized GitHub profile the route layer consumes. `email` is the user's
 * verified primary email, or `null` when none is verified (the caller then
 * refuses to create/link an account).
 */
export interface GitHubProfile {
  /** GitHub numeric user id, stringified — persisted as `developer_identities.provider_user_id`. */
  id: string;
  /** GitHub login handle (fallback display name). */
  login: string;
  /** Full name from the profile, or `null`. */
  name: string | null;
  /** Avatar URL, or `null`. */
  avatarUrl: string | null;
  /** Verified primary email, or `null` if GitHub reports none verified. */
  email: string | null;
}

/** The OAuth redirect target on the developer Astro app (must match the GitHub OAuth App registration). */
function redirectUri(): string {
  return `${requireEnv("DEVELOPER_URL")}/auth/github/callback`;
}

/**
 * Builds the GitHub authorize URL the browser is redirected to.
 *
 * @param state - The signed state token (round-tripped for CSRF).
 * @returns The fully-qualified `https://github.com/login/oauth/authorize?…` URL.
 */
export function buildGitHubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv("GITHUB_OAUTH_CLIENT_ID"),
    redirect_uri: redirectUri(),
    scope: GitHubOAuth.Scope,
    state,
    allow_signup: "true",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchanges an authorization code for a GitHub access token.
 *
 * @param code - The `code` GitHub returned to the callback.
 * @returns The access token string.
 * @throws Error when GitHub returns a non-2xx or an error payload (no token).
 */
export async function exchangeGitHubCode(code: string): Promise<string> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: requireEnv("GITHUB_OAUTH_CLIENT_ID"),
      client_secret: requireEnv("GITHUB_OAUTH_CLIENT_SECRET"),
      code,
      redirect_uri: redirectUri(),
    }),
    signal: AbortSignal.timeout(GITHUB_HTTP_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }
  const data = (await response.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!data?.access_token) {
    throw new Error(`GitHub token exchange returned no token: ${data?.error ?? "unknown"}`);
  }
  return data.access_token;
}

/**
 * Fetches the GitHub profile and resolves the verified primary email.
 *
 * The `/user` endpoint's `email` can be `null` (private email), so the
 * verified primary is resolved from `/user/emails` and wins when present.
 *
 * @param accessToken - The access token from {@link exchangeGitHubCode}.
 * @returns The normalized {@link GitHubProfile}.
 * @throws Error when either GitHub call returns a non-2xx response.
 */
export async function fetchGitHubProfile(accessToken: string): Promise<GitHubProfile> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "musiccloud-developer-portal",
  };

  const userRes = await fetch(GITHUB_USER_URL, { headers, signal: AbortSignal.timeout(GITHUB_HTTP_TIMEOUT_MS) });
  if (!userRes.ok) throw new Error(`GitHub user fetch failed (${userRes.status})`);
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    email: string | null;
  };

  const emailsRes = await fetch(GITHUB_USER_EMAILS_URL, {
    headers,
    signal: AbortSignal.timeout(GITHUB_HTTP_TIMEOUT_MS),
  });
  let primaryVerified: string | null = null;
  if (emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    primaryVerified = emails.find((e) => e.primary && e.verified)?.email ?? null;
  }

  return {
    id: String(user.id),
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    email: primaryVerified,
  };
}
