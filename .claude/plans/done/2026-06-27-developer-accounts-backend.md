# Developer-Account-Backend + E-Mail-Auth Implementation Plan

Plan-Nr.: MC-064

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps nutzen `- [ ]`-Checkboxen.

**Goal:** Ein externes Developer-Account-System im Backend (getrennt von `adminUsers`): Registrierung, E-Mail-Verifikation, Login, Passwort-Reset, Logout, `me` — mit httpOnly-Cookie-Session. GitHub-OAuth ist NICHT Teil dieses Plans (Folge-Plan MC-065).

**Architecture:** Drei neue Drizzle-Tabellen (`developer_accounts`, `developer_identities`, `developer_email_tokens`). Eigenes Repository-Interface + Postgres-Sub-Adapter, analog zu `adminUsers`. Auth-Service kapselt Passwort-Hashing (bcrypt 12), E-Mail-Token-Erzeugung/-Hashing (crypto + sha256) und das signierte Session-JWT. Session läuft über ein **httpOnly-Secure-SameSite-Cookie** (`@fastify/cookie` neu) statt Bearer-Header. Neuer Guard `authenticateDeveloper` liest das Cookie und setzt `request.developerAccountId`. Verifikations-/Reset-Mails über die SMTP2GO-Schicht aus MC-063 (`sendEmail`).

**Tech Stack:** Fastify, `@fastify/jwt` (Session-Token-Signatur), `@fastify/cookie` (neu), `bcryptjs@3`, `nanoid`, `node:crypto`, Drizzle, vitest.

**Verwandt:** [Spec](../../../docs/superpowers/specs/2026-06-26-developer-site-design.md), MC-063 (`sendEmail`).

---

## Verifizierte Fakten (2026-06-27)

- **Auth-Plugin** `apps/backend/src/plugins/auth.ts`: drei `app.decorate`-Guards in `declare module "fastify"` (`:45-51`), `fp(authPlugin, { name: "auth" })` (`:159`). `request.user` via `request.jwtVerify()`.
- **Login-Pattern** `admin-auth.ts:157-186`: `bcrypt.compare` mit timing-safe dummy `"$2a$12$invalidhashfortimingprotection0…"`, `app.jwt.sign({ sub, ... }, { expiresIn: "24h" })`. Hash-Erzeugung `bcrypt.hash(pw, 12)`. `me`/`refresh` via `request.jwtVerify()` + payload-Check.
- **Schema** `db/schemas/postgres.ts`: `pgTable("snake", { id: text("id").primaryKey(), ... timestamp(col,{withTimezone:true}) })`, `(table) => [ index(...), check("chk_x", sql\`${table.col} IN ('a','b')\`) ]`. Importe: `text, timestamp, integer, index, check, uniqueIndex` aus `drizzle-orm/pg-core`, `sql` aus `drizzle-orm`. `adminUsers` ist die Vorlage (`:824-839`).
- **Repository** `db/admin-repository.ts`: Interface `AdminRepository` mit `findAdminById/ByUsername`, `createAdminUser`, `updateLastLogin` etc.; DTO `AdminUser` (camelCase, `createdAt: number` ms). Adapter `db/adapters/postgres-admin-users.ts`: `*Row`-Interface (snake), `rowToAdminUser`-Mapper, Funktionen `(pool: Pool, ...)`, `dateToMs` aus `postgres-shared.js`. Delegation in `db/adapters/postgres.ts` (aliased imports + one-line). Accessor `db/index.ts` `getAdminRepository()`.
- **IDs**: `nanoid()` aus `nanoid` (admin-users nutzt `nanoid()`); `generateTrackId/ShortId` in `lib/short-id.ts`.
- **Server** `server.ts`: Plugin-Reihenfolge cors → helmet → sensible → rateLimit → jwt → authPlugin (`:92-156`); `adminAuthRoutes` registriert bei `:419` (public). Neue `devAuthRoutes` + `@fastify/cookie` hier andocken. `requireEnvList("CORS_ORIGIN")`. `@fastify/cookie` NICHT installiert.
- **Endpoints** `packages/shared/src/endpoints.ts`: `admin.auth`-Gruppe (`:176-187`) als Vorlage; param-Pfade als Arrow-Funktion, Colon-Twin in `ROUTE_TEMPLATES` (`:328-385`).
- **E-Mail**: `sendEmail({to,subject,html})` aus `services/email-provider.js` (MC-063). Env `DASHBOARD_URL` existiert für Admin-Invite-Links → analog `DEVELOPER_URL` für Dev-Links nötig.
- **Migration**: `pnpm db:generate` (root). Höchste Nummer vor Implementierung erneut prüfen (`ls apps/backend/src/db/migrations/postgres`), nicht raten.
- [x] Refs vor dem ersten Edit grep-verifiziert (paralleler Pattern-Audit 2026-06-27).

## Designentscheidungen

- **IDs**: `text`-PK + `nanoid()` (konsistent mit `adminUsers`; die Spec nannte `uuid`, der Backend-Standard ist `text`+nanoid — bewusste Angleichung).
- **Session**: `app.jwt.sign({ sub: accountId, kind: "developer" }, { expiresIn: "7d" })`, ausgeliefert als Cookie `mc_dev_session` (httpOnly, secure in prod, sameSite "lax", path "/"). `authenticateDeveloper` liest `request.cookies.mc_dev_session`, `app.jwt.verify(...)`, prüft `kind==="developer"`, lädt Account, setzt `request.developerAccountId`. Logout = Cookie löschen.
- **E-Mail-Token**: `crypto.randomBytes(32).toString("base64url")` als Raw-Token; gespeichert als `sha256(raw)`-Hex in `developer_email_tokens`. Raw nur im Mail-Link. Verifikation/Reset prüfen Hash + `expires_at > now` + `consumed_at IS NULL`, setzen `consumed_at`.
- **Passwort**: bcrypt 12. Login timing-safe (dummy-hash). Nur bei verifizierter E-Mail.
- **Verifikations-/Reset-Link**: `${DEVELOPER_URL}/verify?token=…` bzw. `/reset?token=…` (Frontend-Seiten kommen in MC-066; Backend-Routen nehmen den Token per POST entgegen).
- **Login-Bruteforce**: separater `new RateLimiter(...)` (NICHT der globale `apiRateLimiter`) auf `/login` + `/request-reset` pro IP. Falls zu komplex für diesen Plan: globalen 300/min belassen und in MC-Folge härten — im Plan vermerken.

## Datenmodell (`db/schemas/postgres.ts`)

```text
developer_accounts
  id text pk
  email text not null unique
  email_verified_at timestamptz null
  password_hash text null            -- null bei reinem OAuth (MC-065)
  display_name text null
  avatar_url text null
  plan text not null default 'free'  -- check IN ('free')
  status text not null default 'active' -- check IN ('active','suspended')
  created_at timestamptz not null defaultNow
  updated_at timestamptz not null defaultNow
  last_login_at timestamptz null

developer_identities
  id text pk
  account_id text not null references developer_accounts(id) onDelete cascade
  provider text not null             -- check IN ('email','github')
  provider_user_id text null         -- github user id; null bei email
  created_at timestamptz not null defaultNow
  uniqueIndex (account_id, provider)
  uniqueIndex (provider, provider_user_id)  -- nulls distinct in PG, ok

developer_email_tokens
  id text pk
  account_id text not null references developer_accounts(id) onDelete cascade
  purpose text not null              -- check IN ('verify','reset')
  token_hash text not null
  expires_at timestamptz not null
  consumed_at timestamptz null
  created_at timestamptz not null defaultNow
  index (token_hash)
```

Row-Types via `export type DeveloperAccountRow = typeof developerAccounts.$inferSelect` etc.

## Backend-API (`/api/dev/auth/*`)

Shared-Endpoints `ENDPOINTS.dev.auth.*` + `ROUTE_TEMPLATES` ergänzen.

- `POST /api/dev/auth/signup` — `{ email, password, displayName? }` → Account (unverifiziert) + `developer_identities(email)` + Verifikations-Mail. 201, kein Token.
- `POST /api/dev/auth/verify-email` — `{ token }` → `email_verified_at` setzen, Token konsumieren. 200.
- `POST /api/dev/auth/login` — `{ email, password }` → nur bei verifiziert; Session-Cookie setzen. 200 + `{ account }`.
- `POST /api/dev/auth/request-reset` — `{ email }` → Reset-Mail (immer 200, kein Account-Leak).
- `POST /api/dev/auth/reset-password` — `{ token, password }` → Passwort setzen, Token konsumieren. 200.
- `POST /api/dev/auth/logout` — Cookie löschen. 200.
- `GET /api/dev/auth/me` — `authenticateDeveloper` → `{ account }`. 200/401.

`buildAccountResponse(account)` → `{ id, email, emailVerified: bool, displayName, avatarUrl, plan, createdAt }` (kein password_hash).

## Tasks (subagent-driven)

1. **Schema + Migration** — drei Tabellen in `postgres.ts` (Row-Type-Exports, checks, indexes, FKs), `pnpm db:generate` (nächste freie Nummer), Backend-Typecheck. Bei Drizzle-Prompt/Drift stoppen.
2. **Repository + Adapter + Accessor** — `DeveloperAccount`/`DeveloperIdentity`/`DeveloperEmailToken`-DTOs + `DeveloperRepository`-Interface (`db/developer-repository.ts`), `db/adapters/postgres-developer.ts` (Row + Mapper + CRUD: createAccount, findByEmail, findById, markVerified, updateLastLogin, setPassword; createIdentity, findIdentity; createEmailToken, findActiveToken, consumeToken), Delegation in `postgres.ts`, `getDeveloperRepository()` in `db/index.ts`. Unit-Tests gegen einen Test-Pool optional; mind. Typecheck.
3. **Auth-Service + Cookie + Guard** — `services/developer-auth.ts` (hashPassword/verifyPassword, generateEmailToken→{raw,hash}, hashToken, signSession/verifySession, cookie-options-Helper); `pnpm add -w @musiccloud/backend @fastify/cookie`; `@fastify/cookie` in `server.ts` registrieren; `authenticateDeveloper`-Guard in `plugins/auth.ts` (declare-module-Eintrag + decorate, liest Cookie, setzt `request.developerAccountId`). Unit-Tests für Token-Hash + Session-Roundtrip.
4. **Dev-E-Mails** — `services/developer-email.ts`: `sendVerificationEmail(account, rawToken)` + `sendPasswordResetEmail(account, rawToken)` mit schlichtem Inline-HTML (Brand-Blau-Button, Link `${DEVELOPER_URL}/verify?token=` / `/reset?token=`), via `sendEmail`. `DEVELOPER_URL` über `requireEnv`. `.env.local` + `zerops.yml`-Kommentar ergänzen.
5. **Routen + Registrierung** — `routes/developer-auth.ts` (alle sieben Routen, Validierung, bcrypt-timing-safe Login, Session-Cookie set/clear, `authenticateDeveloper` auf `me`/`logout`), `ENDPOINTS.dev.auth.*` + `ROUTE_TEMPLATES`, `devAuthRoutes` + `cookie` in `server.ts` registrieren. CORS: `developer.musiccloud.io` muss in `CORS_ORIGIN` (prod) + Credentials erlauben (`@fastify/cors` `credentials: true` prüfen).
6. **Route-Tests** — vitest: signup legt unverifizierten Account an + sendet Mail (sendEmail gemockt); verify setzt verified; login scheitert unverifiziert, klappt verifiziert, setzt Cookie; reset-Flow; me mit/ohne Cookie; kein password_hash in Responses.

## Tests und Gates

- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm --filter @musiccloud/backend test:run`
- `pnpm --filter @musiccloud/shared typecheck` (Endpoint-Änderungen)
- `pnpm lint`
- Migration: lokal gegen DB anwenden (`./app`-DB oder Test-Migration), Backend startet, `/health/ready` 200.

## Checkliste

- [x] Task 1: Schema + Migration, Typecheck grün
- [x] Task 2: Repository + Adapter + Accessor
- [x] Task 3: Auth-Service + @fastify/cookie + authenticateDeveloper-Guard
- [x] Task 4: Developer-Verifikations-/Reset-Mails (DEVELOPER_URL)
- [x] Task 5: Routen + Shared-Endpoints + Server-Registrierung (+ CORS credentials)
- [x] Task 6: Route-Tests grün
- [x] Gates grün (typecheck backend+shared, test:run 1113, lint, doctor:diff); Migration 0047 lokal angewendet + idempotent (Tracker 48/48), Schema konsistent
- [x] Plan nach `done/`, gemergt

## Completed (2026-06-27)

Alle sechs Tasks umgesetzt und nach `main` gemergt (10 Commits ab `5795edcc`). Gates grün, Migration verifiziert.

**Geliefert:**
- Drei Tabellen (`developer_accounts`/`developer_identities`/`developer_email_tokens`), Migration `0047_lumpy_kulan_gath.sql` — lokal angewendet, `db:migrate` idempotent, Tracker konsistent (48/48).
- `DeveloperRepository` + Postgres-Sub-Adapter + `getDeveloperRepository()`-Accessor (ID-Erzeugung im Adapter via `nanoid`, `RETURNING`).
- Auth-Service `developer-auth.ts` (bcrypt 12, timing-safe, sha256-Token, Cookie-Helper, Discriminant-Namespaces `SessionKind`/`TokenPurpose`/`AuthProvider`), `@fastify/cookie@11.0.2`, Guard `authenticateDeveloper`.
- Verifikations-/Reset-Mails (`developer-email.ts`) über die SMTP2GO-Schicht aus MC-063, `DEVELOPER_URL`.
- Sieben Routen `/api/dev/auth/*` + `ENDPOINTS.dev.auth.*`, registriert in `server.ts`, CORS `credentials: true`.
- **Login-Bruteforce:** separater `credentialRateLimiter` (10/min, eigener Bucket, NICHT der globale `apiRateLimiter`) auf `/login` + `/request-reset` — die primäre Plan-Variante, keine Härtung in Folge-Plan nötig.
- 19 Route-Tests + 7 Service-Tests; volle Backend-Suite 1113 passed | 35 skipped.

**Review-Fixes (kein Merge-Blocker, vorab gefixt):**
- Token-Replay-TOCTOU bei `verify-email`/`reset-password` → claim-then-act (erst `consume`, nur bei `true` die Wirkung); 2 Race-Tests ergänzt.
- Duplicate-Email-Signup-Race → PG-`23505` abgefangen → 409 `EMAIL_TAKEN`.

**Externer Handoff (Config, nicht Code):**
- Prod-`CORS_ORIGIN` (Zerops Secrets / `zerops.yml`) muss `https://developer.musiccloud.io` enthalten, sobald MC-066 (Auth-UI) live gegen das Backend fetcht.
- Backend-Env auf Zerops: `DEVELOPER_URL=https://developer.musiccloud.io` setzen (Verify-/Reset-Links).

**Folge:** MC-065 (GitHub-OAuth), MC-066 (Auth-UI-Seiten).
