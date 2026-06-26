# Developer-Portal GitHub-OAuth Implementation Plan

Plan-Nr.: MC-065

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps nutzen `- [ ]`-Checkboxen.

**Goal:** GitHub als zweite Login-Methode für externe Developer-Accounts: "Sign in with GitHub" legt einen Account an (oder verknüpft per GitHub-verifizierter E-Mail) und stellt dieselbe `mc_dev_session`-Cookie aus wie der E-Mail-Login.

**Architecture:** BFF-Modell (wie `apps/frontend`, festgelegt in der Projekt-Memory). Der OAuth-Redirect/Callback landet auf der Developer-Astro-App (MC-066, `developer.musiccloud.io/auth/github/callback`); MC-065 liefert nur die **geheimnis-tragende Backend-Hälfte**: `GET /api/dev/auth/github/start` (signierter State + Authorize-URL) und `POST /api/dev/auth/github/exchange` (Code → GitHub-Token → GitHub-User → Account finden/anlegen → Session-Cookie). Kein neues DB-Schema — wiederverwendet `developer_identities`/`developer_accounts` aus MC-064. CSRF über ein signiertes, kurzlebiges State-JWT. Account-Verknüpfung ausschließlich über die **GitHub-verifizierte Primär-E-Mail**.

**Tech Stack:** Fastify, `@fastify/jwt` (State-JWT + Session-JWT), `nanoid`, raw `fetch` gegen GitHub (kein `@octokit`), Drizzle (bestehende Tabellen), vitest.

**Verwandt:** [[developer-site]], MC-064 (Developer-Account-Backend), MC-066 (Auth-UI, baut die Astro-Hälfte).

---

## Verifizierte Fakten (2026-06-27)

Alle Refs gegen den aktuellen `main` (nach MC-064-Merge) grep-/Read-verifiziert.

- **Service-Bausteine** `apps/backend/src/services/developer-auth.ts`: `SessionKind = { Developer: "developer" }` (`:64-67`), `AuthProvider = { Email:"email", GitHub:"github" }` (`:91-96`), `SESSION_COOKIE_NAME = "mc_dev_session"` (`:47`), `sessionCookieOptions()` (`:181-189`). MC-065 importiert + verwendet diese unverändert.
- **Login-/Session-Muster** `apps/backend/src/routes/developer-auth.ts:286-293`: `const token = app.jwt.sign({ sub: account.id, kind: SessionKind.Developer }, { expiresIn: "7d" }); reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions()); repo.updateDeveloperLastLogin(account.id).catch(() => undefined);`. `buildAccountResponse(account)` (`:142-152`) — wird nach MC-065 geteilt (Export, siehe Task 4).
- **Repository** `apps/backend/src/db/developer-repository.ts`: `createDeveloperAccount({ email, passwordHash?, displayName?, avatarUrl? })` (`:115-120`, `passwordHash` optional → OAuth-Account ohne Passwort), `findDeveloperIdentity(provider, providerUserId): Promise<DeveloperIdentity|null>` (`:188`), `createDeveloperIdentity({ accountId, provider, providerUserId? })` (`:174-178`), `findDeveloperAccountByEmail(email)` (`:136`), `findDeveloperAccountById(id)` (`:128`), `markDeveloperEmailVerified(id)` (`:145`). Adapter `db/adapters/postgres-developer.ts` (`findDeveloperIdentity` `:295-308`, `createDeveloperAccount` `:180-197`). Accessor `getDeveloperRepository()` aus `db/index.js`.
- **Endpoints** `packages/shared/src/endpoints.ts`: `ENDPOINTS.dev.auth` (`:328-345`) mit `signup/verifyEmail/login/requestReset/resetPassword/logout/me`. Neue Untergruppe `github: { start, exchange }` hier ergänzen. Statische Pfade, keine `ROUTE_TEMPLATES`-Twins nötig (kein Param-Pfad).
- **Server-Registrierung** `apps/backend/src/server.ts:41` (Import `devAuthRoutes`), `:441` (`await app.register(devAuthRoutes);`). Neue `devGitHubRoutes` analog (public, root-scope). CORS `:94-103` (`credentials: true`, `origin: requireEnvList("CORS_ORIGIN")`).
- **Env**: `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` in `apps/backend/.env.local` gesetzt (Key-Namen verifiziert). `DEVELOPER_URL` existiert (MC-064). `requireEnv` aus `lib/env.js`. `zerops.yml`: GitHub-Env-Kommentar fehlt → ergänzen.
- **Kein User-OAuth-Pattern vorhanden**: nur Client-Credentials (`routes/auth.ts:40-78`, `lib/infra/token-manager.ts:87`). GitHub-OAuth ist neu. Kein `@octokit` in `package.json` → raw `fetch`.
- **Rate-Limit** `lib/infra/rate-limiter.ts` `RateLimiter` + `lib/infra/rate-limit-response.js` `sendRateLimitError` (von `developer-auth.ts` genutzt). Für `/github/exchange` denselben dedizierten Limiter-Stil.
- [x] Refs vor dem ersten Edit erneut grep-verifiziert (am Execute-Time).

## Designentscheidungen

- **BFF, nicht Direct-Call**: Das `mc_dev_session`-Cookie bleibt host-only auf `developer.musiccloud.io`; die Astro-SSR relayed das `Set-Cookie` aus dem Backend (wie `apps/frontend`). Deshalb landet der GitHub-Callback auf der **Astro-App** (`${DEVELOPER_URL}/auth/github/callback`), nicht auf dem Backend. Kein `domain=.musiccloud.io`, kein cross-subdomain.
- **Aufgabenteilung**: Backend (MC-065) = `start` (Authorize-URL bauen, State signieren) + `exchange` (Code einlösen, Account, Session). Astro (MC-066) = Button-Redirect, State-Cookie auf `developer.musiccloud.io` setzen/prüfen, Callback-Seite, BFF-Call auf `exchange`, Cookie-Relay.
- **CSRF/State**: `start` erzeugt `nonce = crypto.randomBytes(16).toString("base64url")` und signiert ein kurzlebiges JWT `app.jwt.sign({ nonce, kind: GitHubOAuth.StateKind }, { expiresIn: "10m" })`. Dieses State-JWT geht als `state`-Query-Param zu GitHub UND wird von der Astro-App als httpOnly-Cookie gesetzt. Beim Callback prüft die Astro-App Cookie==Query (CSRF), dann reicht sie `state` an `exchange` weiter; das Backend verifiziert die JWT-Signatur + `kind` + Ablauf erneut (Defense-in-Depth). Kein DB-/Redis-State nötig.
- **redirect_uri**: konstant `${DEVELOPER_URL}/auth/github/callback`, identisch in Authorize-URL und Token-Exchange (GitHub verlangt Übereinstimmung). **Externer Config-Handoff**: diese URL (prod + `http://localhost:3002/auth/github/callback` für Dev) muss in der GitHub-OAuth-App als Authorization-Callback-URL registriert sein.
- **Scopes**: `read:user user:email` — Profil + E-Mail-Adressen (für die verifizierte Primär-E-Mail).
- **Account-Resolution** (`exchange`, in dieser Reihenfolge):
  1. `findDeveloperIdentity(github, githubUserId)` → vorhanden ⇒ zugehörigen Account laden, einloggen (Stamm-Fall für wiederkehrende GitHub-Logins).
  2. Sonst GitHub-**verifizierte Primär-E-Mail** holen; `findDeveloperAccountByEmail(email)` → vorhanden ⇒ GitHub-Identity an diesen Account hängen (`createDeveloperIdentity`), E-Mail als verifiziert markieren (GitHub hat sie verifiziert), einloggen. (Verknüpfung sicher, weil GitHub den Mailbox-Besitz beweist.)
  3. Sonst neuen Account anlegen (`createDeveloperAccount({ email, displayName: name||login, avatarUrl })`, `passwordHash` weggelassen ⇒ null) + GitHub-Identity + `markDeveloperEmailVerified`. Einloggen.
- **Keine verifizierte Primär-E-Mail** von GitHub ⇒ 422 `NO_VERIFIED_EMAIL` (kein unsicheres Anlegen/Verknüpfen).
- **`passwordHash` bleibt null** bei OAuth-only-Accounts; der E-Mail-Login (`verifyPassword(pw, null)`) schlägt für sie timing-safe fehl — ein reiner GitHub-Account kann nicht per Passwort rein, bis er einen Reset macht. Das ist gewollt.
- **Brute-force/Abuse**: dedizierter `new RateLimiter(20, 60_000)` (`githubExchangeRateLimiter`) als `preHandler` auf `exchange` (pro IP), getrennt vom globalen `apiRateLimiter` (wie `credentialRateLimiter` in MC-064).

## Backend-API

`ENDPOINTS.dev.auth.github.*` ergänzen:

- `GET /api/dev/auth/github/start` — kein Body. Antwort `{ authorizeUrl: string, state: string }`. Die Astro-App setzt `state` als httpOnly-Cookie und 302-redirectet den Browser zu `authorizeUrl`.
- `POST /api/dev/auth/github/exchange` — Body `{ code: string, state: string }`. Verifiziert State-JWT, tauscht Code, holt User, resolved Account (s.o.), setzt `mc_dev_session`-Cookie, Antwort `{ account }` (Shape wie `buildAccountResponse`). Fehler: 400 `INVALID_REQUEST` (fehlende Felder), 401 `INVALID_STATE` (State-JWT ungültig/abgelaufen), 502 `GITHUB_ERROR` (Token-Exchange/User-Fetch scheitert), 422 `NO_VERIFIED_EMAIL`.

## File-Struktur

- **Neu** `apps/backend/src/services/developer-github.ts` — reine GitHub-HTTP-Schicht + URL-Bau (kein Fastify). Exports: `buildGitHubAuthorizeUrl(state)`, `exchangeGitHubCode(code)`, `fetchGitHubProfile(accessToken)`, Konstante `GitHubOAuth` (State-`kind` + Scope), Typen `GitHubProfile`.
- **Neu** `apps/backend/src/services/developer-github.test.ts` — Unit-Tests der HTTP-Schicht (fetch gemockt).
- **Neu** `apps/backend/src/routes/developer-github.ts` — `devGitHubRoutes(app)` mit `start` + `exchange`. Importiert `buildAccountResponse` (jetzt exportiert) aus `routes/developer-auth.ts`.
- **Neu** `apps/backend/src/routes/developer-github.test.ts` — Route-Tests (`app.inject`, GitHub-Service + Repository gemockt).
- **Mod** `apps/backend/src/routes/developer-auth.ts` — `buildAccountResponse` exportieren (von beiden Routen-Dateien geteilt; DRY).
- **Mod** `packages/shared/src/endpoints.ts` — `ENDPOINTS.dev.auth.github`.
- **Mod** `apps/backend/src/server.ts` — `devGitHubRoutes` registrieren.
- **Mod** `apps/backend/.env.local` (lokal, gitignored) + `zerops.yml` (Kommentar) — GitHub-Env dokumentieren.

---

## Task 1: GitHub-HTTP-Service

**Files:**
- Create: `apps/backend/src/services/developer-github.ts`
- Create: `apps/backend/src/services/developer-github.test.ts`

Reine Schicht für die zwei GitHub-Endpunkte + Authorize-URL-Bau. Raw `fetch`, kein SDK. `requireEnv` für Client-ID/Secret + `DEVELOPER_URL`.

- [x] **Step 1: Service schreiben**

```ts
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

  const userRes = await fetch(GITHUB_USER_URL, { headers });
  if (!userRes.ok) throw new Error(`GitHub user fetch failed (${userRes.status})`);
  const user = (await userRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    avatar_url: string | null;
    email: string | null;
  };

  const emailsRes = await fetch(GITHUB_USER_EMAILS_URL, { headers });
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
```

- [x] **Step 2: Tests schreiben** (`developer-github.test.ts`): `fetch` via `vi.fn()`/`vi.stubGlobal` mocken, Env via `vi.stubEnv` (`GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET`, `DEVELOPER_URL`). Fälle:
  - `buildGitHubAuthorizeUrl("st")` enthält `client_id`, `scope=read%3Auser`, `redirect_uri`=`${DEVELOPER_URL}/auth/github/callback`, `state=st`.
  - `exchangeGitHubCode` gibt Token bei `{access_token}`; wirft bei non-2xx; wirft bei `{error}` ohne Token.
  - `fetchGitHubProfile` mappt `/user`-Felder; nimmt verifizierte Primär-E-Mail aus `/user/emails`; `email:null` wenn keine verifiziert; wirft bei `/user`-non-2xx.

- [x] **Step 3: Gates** — `pnpm --filter @musiccloud/backend exec vitest run src/services/developer-github.test.ts` grün, `pnpm --filter @musiccloud/backend typecheck` grün.

- [x] **Step 4: Commit** — `Feat: GitHub OAuth HTTP service for developer portal (MC-065)`

## Task 2: Shared-Endpoints + buildAccountResponse-Export

**Files:**
- Modify: `packages/shared/src/endpoints.ts` (dev.auth-Block)
- Modify: `apps/backend/src/routes/developer-auth.ts:142` (`function buildAccountResponse` → `export function`)

- [x] **Step 1: Endpoints ergänzen** — in `ENDPOINTS.dev.auth` (nach `me`) eine `github`-Untergruppe:

```ts
      /** GitHub OAuth (MC-065). `start` returns the authorize URL + signed state; `exchange` redeems the callback code. */
      github: {
        /** GET: returns `{ authorizeUrl, state }` for the Astro app to redirect to. */
        start: "/api/dev/auth/github/start",
        /** POST: redeems `{ code, state }`, issues the session cookie, returns `{ account }`. */
        exchange: "/api/dev/auth/github/exchange",
      },
```

- [x] **Step 2: `buildAccountResponse` exportieren** — `function buildAccountResponse` → `export function buildAccountResponse`. (Wird in `developer-github.ts` importiert; DRY statt Re-Implementierung.)

- [x] **Step 3: Shared bauen** — `pnpm --filter @musiccloud/shared build` (Backend importiert das gebaute Paket), dann `pnpm --filter @musiccloud/shared typecheck`.

- [x] **Step 4: Commit** — `Feat: dev.auth.github endpoints + share buildAccountResponse (MC-065)`

## Task 3: GitHub-OAuth-Routen

**Files:**
- Create: `apps/backend/src/routes/developer-github.ts`
- Modify: `apps/backend/src/server.ts` (Import + `await app.register(devGitHubRoutes);` neben `devAuthRoutes`)

- [x] **Step 1: Routen schreiben**

```ts
/**
 * @file GitHub OAuth routes for the developer portal (MC-065). The
 * browser-facing redirect/callback live on the Astro app (BFF); these two
 * endpoints are the secret-bearing backend half. `start` mints a signed,
 * short-lived state JWT and the authorize URL; `exchange` verifies the state,
 * trades the code with GitHub, resolves (find/link/create) the developer
 * account and issues the same `mc_dev_session` cookie as email login.
 */
import crypto from "node:crypto";
import { ENDPOINTS } from "@musiccloud/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getDeveloperRepository } from "../db/index.js";
import { sendRateLimitError } from "../lib/infra/rate-limit-response.js";
import { RateLimiter } from "../lib/infra/rate-limiter.js";
import {
  AuthProvider,
  SESSION_COOKIE_NAME,
  SessionKind,
  sessionCookieOptions,
} from "../services/developer-auth.js";
import { buildAccountResponse } from "./developer-auth.js";
import {
  buildGitHubAuthorizeUrl,
  exchangeGitHubCode,
  fetchGitHubProfile,
  GitHubOAuth,
} from "../services/developer-github.js";

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
  app.get(ENDPOINTS.dev.auth.github.start, async (_request, reply) => {
    const nonce = crypto.randomBytes(16).toString("base64url");
    const state = app.jwt.sign({ nonce, kind: GitHubOAuth.StateKind }, { expiresIn: "10m" });
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
    try {
      const payload = app.jwt.verify(body.state) as { kind?: string };
      if (payload.kind !== GitHubOAuth.StateKind) throw new Error("wrong kind");
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
    let account = null;
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
        if (existing.emailVerifiedAt === null) await repo.markDeveloperEmailVerified(existing.id);
        account = existing;
      } else {
        // Brand-new OAuth-only account (no password).
        const created = await repo.createDeveloperAccount({
          email,
          displayName: profile.name ?? profile.login,
          avatarUrl: profile.avatarUrl,
        });
        await repo.createDeveloperIdentity({
          accountId: created.id,
          provider: AuthProvider.GitHub,
          providerUserId: profile.id,
        });
        await repo.markDeveloperEmailVerified(created.id);
        account = created;
      }
    }

    if (!account) {
      return reply.status(502).send({ error: "GITHUB_ERROR", message: "Account resolution failed." });
    }

    const token = app.jwt.sign({ sub: account.id, kind: SessionKind.Developer }, { expiresIn: "7d" });
    reply.setCookie(SESSION_COOKIE_NAME, token, sessionCookieOptions());
    repo.updateDeveloperLastLogin(account.id).catch(() => undefined);

    return reply.send({ account: buildAccountResponse(account) });
  });
}
```

- [x] **Step 2: Registrieren** — in `server.ts` Import `import { devGitHubRoutes } from "./routes/developer-github.js";` und neben `devAuthRoutes`: `await app.register(devGitHubRoutes);`.

- [x] **Step 3: Gates** — `pnpm --filter @musiccloud/backend typecheck` grün, `pnpm lint` grün.

- [x] **Step 4: Commit** — `Feat: GitHub OAuth start + exchange routes (MC-065)`

## Task 4: Route-Tests

**Files:**
- Create: `apps/backend/src/routes/developer-github.test.ts`

`app.inject`-Setup wie `developer-auth.test.ts` (jwt → authPlugin → cookie → `devGitHubRoutes`). `services/developer-github.js` mocken (`exchangeGitHubCode`, `fetchGitHubProfile`, `buildGitHubAuthorizeUrl` real lassen oder mocken), `db/index.js` (`getDeveloperRepository`) mit Stub-Repo.

- [x] **Step 1: Tests schreiben** — Fälle:
  - **start**: 200, `authorizeUrl` enthält `github.com/login/oauth/authorize` + `state`; `state` ist ein per `app.jwt.verify` gültiges JWT mit `kind==="gh_oauth_state"`.
  - **exchange — fehlende Felder**: 400 `INVALID_REQUEST`.
  - **exchange — ungültiger State**: `{ code:"c", state:"garbage" }` → 401 `INVALID_STATE`; ebenso ein mit falschem `kind` signiertes JWT → 401.
  - **exchange — GitHub-Fehler**: `exchangeGitHubCode` wirft → 502 `GITHUB_ERROR`.
  - **exchange — returning user**: `findDeveloperIdentity` gibt Identity → Account geladen, Session-Cookie gesetzt (`set-cookie` enthält `mc_dev_session`), `{account}` ohne `passwordHash`. `createDeveloperAccount` NICHT aufgerufen.
  - **exchange — link existing email**: Identity null, `fetchGitHubProfile` liefert verifizierte E-Mail, `findDeveloperAccountByEmail` gibt (unverifizierten) Account → `createDeveloperIdentity(github)` + `markDeveloperEmailVerified` aufgerufen, Cookie gesetzt.
  - **exchange — create new**: Identity null, E-Mail unbekannt → `createDeveloperAccount` (ohne `passwordHash`) + `createDeveloperIdentity` + `markDeveloperEmailVerified`, Cookie gesetzt.
  - **exchange — keine verifizierte E-Mail**: Identity null, `profile.email===null` → 422 `NO_VERIFIED_EMAIL`, kein `createDeveloperAccount`.
  - State-Signatur in Tests: mit derselben `app.jwt.sign({nonce,kind:"gh_oauth_state"})` erzeugen, mit der die Test-App registriert ist. `DISABLE_RATE_LIMIT=true` via `vi.stubEnv` (wie in `developer-auth.test.ts`).

- [x] **Step 2: Gates** — `vitest run src/routes/developer-github.test.ts` grün, dann volle Suite `pnpm --filter @musiccloud/backend test:run` grün, `typecheck` grün, `pnpm lint` grün.

- [x] **Step 3: Commit** — `Test: GitHub OAuth route tests (MC-065)`

## Task 5: Env-Dokumentation

**Files:**
- Modify: `apps/backend/.env.local` (lokal, nur falls Keys fehlen — sie sind gesetzt)
- Modify: `zerops.yml` (Backend-Env-Kommentare)

- [x] **Step 1: `zerops.yml`** — bei den Backend-Env-Kommentaren ergänzen:
  ```
  # GITHUB_OAUTH_CLIENT_ID: <from GitHub OAuth App; developer-portal sign-in>
  # GITHUB_OAUTH_CLIENT_SECRET: <from GitHub OAuth App>
  ```
- [x] **Step 2: Commit** — `Chore: document GitHub OAuth env in zerops.yml (MC-065)`

## Tests und Gates

- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm lint`
- `pnpm doctor:diff` (Backend-only ⇒ keine React-Änderungen erwartet)

## Checkliste

- [x] Task 1: GitHub-HTTP-Service + Unit-Tests
- [x] Task 2: Shared-Endpoints `github.*` + `buildAccountResponse`-Export
- [x] Task 3: Routen `start` + `exchange` + Server-Registrierung
- [x] Task 4: Route-Tests grün
- [x] Task 5: Env-Doku (`zerops.yml`)
- [x] Gates grün (typecheck backend+shared, test:run, lint, doctor:diff)
- [ ] Plan nach `done/`, gemergt

## Externer Handoff (Config, nicht Code)

- **GitHub-OAuth-App Callback-URL**: `https://developer.musiccloud.io/auth/github/callback` (prod) + `http://localhost:3002/auth/github/callback` (Dev) als Authorization-Callback-URL registrieren (ggf. zweite OAuth-App für localhost).
- **Zerops Backend-Env**: `GITHUB_OAUTH_CLIENT_ID` + `GITHUB_OAUTH_CLIENT_SECRET` (User: laut Memory schon eingetragen — verifizieren), `DEVELOPER_URL=https://developer.musiccloud.io`, und `https://developer.musiccloud.io` in `CORS_ORIGIN`.
- **MC-066** baut die Astro-Hälfte: Button → `/auth/github` (Astro, ruft `start`, setzt State-Cookie, redirect zu GitHub), Callback-Seite `/auth/github/callback` (State-Cookie==Query prüfen, `exchange` per BFF, Set-Cookie relayen).
