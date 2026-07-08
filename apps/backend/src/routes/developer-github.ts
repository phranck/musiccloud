/**
 * @file GitHub OAuth routes for the developer portal (MC-065). The
 * browser-facing redirect/callback live on the Astro app (BFF); these two
 * endpoints are the secret-bearing backend half. `start` mints a signed,
 * short-lived state JWT and the authorize URL; `exchange` verifies the state,
 * trades the code with GitHub, resolves (find/link/create) the developer
 * account and issues the same `mc_dev_session` cookie as email login.
 */
import crypto from "node:crypto";
import { EmailAction, EmailRecipientKind, ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DeveloperAccount } from "../db/developer-repository.js";
import { getDeveloperRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import { AuthProvider, SESSION_COOKIE_NAME, SessionKind, sessionCookieOptions } from "../services/developer-auth.js";
import {
  buildGitHubAuthorizeUrl,
  exchangeGitHubCode,
  fetchGitHubProfile,
  GitHubOAuth,
  type GitHubOAuthIntent,
} from "../services/developer-github.js";
import { triggerEmailAction } from "../services/email-actions.js";
import { resolveSignupTierId } from "../services/signup-tier.js";
import { buildAccountResponse } from "./developer-auth.js";

/** Dedicated per-IP throttle for the OAuth exchange (20/min), separate from the global apiRateLimiter. */
const githubExchangeRateLimiter = new RateLimiter(20, 60_000);

/** `preHandler` throttling `/github/exchange` per client IP. */
async function throttleExchange(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const check = githubExchangeRateLimiter.check(request.ip);
  if (check.limited) {
    await sendRateLimitError(reply, check);
  }
}

/**
 * Registers `/api/dev/auth/github/start` and `/api/dev/auth/github/exchange`.
 *
 * @param app - Fastify instance (needs `@fastify/jwt`, `@fastify/cookie`).
 */
export async function devGitHubRoutes(app: FastifyInstance) {
  /** GET /github/start — mint signed state + authorize URL. */
  app.get(ENDPOINTS.dev.auth.github.start, async (request, reply) => {
    const query = request.query as { intent?: string };
    // Whitelist the intent: anything other than "signup" defaults to "login"
    // so a forged or missing query value never grants unintended signup paths.
    const intent: GitHubOAuthIntent = query.intent === "signup" ? "signup" : "login";
    const nonce = crypto.randomBytes(16).toString("base64url");
    const state = app.jwt.sign({ nonce, kind: GitHubOAuth.StateKind, intent }, { expiresIn: "10m" });
    return reply.send({ authorizeUrl: buildGitHubAuthorizeUrl(state), state });
  });

  /** POST /github/exchange — verify state, trade code, resolve account, set session. */
  app.post(ENDPOINTS.dev.auth.github.exchange, { preHandler: throttleExchange }, async (request, reply) => {
    const body = request.body as { code?: string; state?: string } | null;
    if (!body?.code || !body?.state) {
      return reply.status(400).send({ error: "INVALID_REQUEST", message: "code and state are required." });
    }

    // Defense-in-depth: the Astro callback already compared state-cookie vs
    // state-query (CSRF); re-verify the signature/kind/expiry here so a forged
    // state cannot reach the code exchange even if the BFF is bypassed.
    let intent: GitHubOAuthIntent;
    try {
      const payload = app.jwt.verify(body.state) as { kind?: string; intent?: string };
      if (payload.kind !== GitHubOAuth.StateKind) throw new Error("wrong kind");
      // Read intent from the VERIFIED payload only, never from the request body
      // or query string, so the caller cannot forge or escalate their own intent.
      intent = payload.intent === "signup" ? "signup" : "login";
    } catch {
      return reply.status(401).send({ error: "INVALID_STATE", message: "OAuth state is invalid or expired." });
    }

    let profile: Awaited<ReturnType<typeof fetchGitHubProfile>>;
    try {
      const accessToken = await exchangeGitHubCode(body.code);
      profile = await fetchGitHubProfile(accessToken);
    } catch (err) {
      app.log.warn(`[Developer] GitHub OAuth exchange failed: ${(err as Error).message}`);
      return reply.status(502).send({ error: "GITHUB_ERROR", message: "Could not complete GitHub sign-in." });
    }

    const repo = await getDeveloperRepository();

    // 1) Returning GitHub user: identity already linked.
    let account: DeveloperAccount | null = null;
    const identity = await repo.findDeveloperIdentity(AuthProvider.GitHub, profile.id);
    if (identity) {
      account = await repo.findDeveloperAccountById(identity.accountId);
    }

    // 2/3) First GitHub login: need a verified primary email to link or create.
    if (!account) {
      if (!profile.email) {
        return reply
          .status(422)
          .send({ error: "NO_VERIFIED_EMAIL", message: "Your GitHub account has no verified primary email." });
      }
      const email = profile.email.trim().toLowerCase();
      const existing = await repo.findDeveloperAccountByEmail(email);
      if (existing) {
        // Link GitHub to the existing email account (GitHub proved mailbox ownership).
        await repo.createDeveloperIdentity({
          accountId: existing.id,
          provider: AuthProvider.GitHub,
          providerUserId: profile.id,
        });
        // If the account was still unverified, any password on it was set without
        // proven mailbox ownership and has no trust value (an attacker could have
        // pre-seeded it before the real owner arrived via GitHub). GitHub now
        // proves ownership, so discard the unproven password and mark the email
        // verified. A verified account's password was set legitimately (genuine
        // second account of the same person), so leave it — and the verification
        // state — untouched.
        if (existing.emailVerifiedAt === null) {
          await repo.clearDeveloperPassword(existing.id);
          await repo.markDeveloperEmailVerified(existing.id);
        }
        account = existing;
      } else {
        // Brand-new GitHub identity with no existing account.
        if (intent === "login") {
          // Login intent must not auto-create an account: the user chose "sign
          // in" but has no account yet. Return 409 so the frontend can redirect
          // to the pricing page instead of silently creating a tier-less record.
          return reply.status(409).send({
            error: "NO_ACCOUNT",
            message: "No developer account for this GitHub identity. Choose a plan to sign up.",
          });
        }
        // Signup intent: create the account and always assign a tier so the
        // account is never left tier-less.
        const tierId = await resolveSignupTierId(undefined);
        const created = await repo.createDeveloperAccount({
          email,
          displayName: profile.name ?? profile.login,
          avatarUrl: profile.avatarUrl,
          tierId,
        });
        await repo.createDeveloperIdentity({
          accountId: created.id,
          provider: AuthProvider.GitHub,
          providerUserId: profile.id,
        });
        await repo.markDeveloperEmailVerified(created.id);
        // Optional welcome notification — must never fail the OAuth signup.
        try {
          await triggerEmailAction(EmailAction.DeveloperAccountCreated, {
            to: { email: created.email },
            recipient: {
              kind: EmailRecipientKind.DeveloperAccount,
              email: created.email,
              displayName: created.displayName,
            },
            context: {},
          });
        } catch (error) {
          request.log.error({ err: error }, "failed to send account-created notification");
        }
        account = created;
      }
    }

    if (!account) {
      return reply.status(502).send({ error: "GITHUB_ERROR", message: "Account resolution failed." });
    }

    // Mirror the authenticateDeveloper guard: a suspended account must not be
    // able to mint a fresh session via OAuth either.
    if (account.status !== "active") {
      return reply.status(403).send({ error: "ACCOUNT_SUSPENDED", message: "This account is not active." });
    }

    const token = app.jwt.sign({ sub: account.id, kind: SessionKind.Developer }, { expiresIn: "7d" });
    reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    repo.updateDeveloperLastLogin(account.id).catch(() => undefined);

    return reply.send({ account: buildAccountResponse(account) });
  });
}
