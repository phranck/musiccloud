# Developer-Portal Auth-UI Implementation Plan

Plan-Nr.: MC-066

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps nutzen `- [ ]`-Checkboxen.

**Goal:** Die Astro-Frontend-Hälfte des Developer-Portals: BFF-Proxy zum Backend (mit Cookie-Relay), Auth-Seiten (Login mit GitHub-zuerst, Signup, Verify, Forgot, Reset) als React-Islands, GitHub-OAuth-UI-Flow, und eine geschützte, eingeloggte Dashboard-Shell mit Overview + Platzhalter-Tabs.

**Architecture:** BFF wie `apps/frontend`: ein Astro-Catch-all `src/pages/api/dev/[...path].ts` proxied alle `/api/dev/*`-Calls server-seitig ans Backend (`BACKEND_URL`), setzt `X-API-Key`/`X-Forwarded-For`, reicht den Browser-`Cookie`-Header durch und **relayed `Set-Cookie`** zurück — so bleibt `mc_dev_session` host-only auf `developer.musiccloud.io`. Interaktive Formulare sind React-Islands (`client:load`), die per `fetch` gegen den BFF gehen. GitHub-OAuth: `/auth/github` (server-seitig `start` aufrufen, State-Cookie setzen, zu GitHub redirecten) + `/auth/github/callback` (State==Query prüfen, `exchange` per BFF, Session-Cookie relayen, zu `/dashboard`). Geschützte Seiten lesen `mc_dev_session` server-seitig und rufen `/me`; ohne Session → Redirect zu `/login`.

**Tech Stack:** Astro 5 (SSR, `@astrojs/node` standalone), `@astrojs/react`, Tailwind 4 (`@theme`-Tokens, vorhanden), `@phosphor-icons/react`, `@musiccloud/shared` (`ENDPOINTS`). Kein i18n (EN-hardcoded — vermeidet den SSR-Island-LocaleProvider-Crash [[ssr_islands_no_locale_provider]]).

**Verwandt:** [[developer-site]], MC-064 (Auth-Backend), MC-065 (GitHub-OAuth-Backend), [Spec](../../../docs/superpowers/specs/2026-06-26-developer-site-design.md).

---

## Verifizierte Fakten (2026-06-27)

- **Developer-App** (`apps/developer/`): `astro.config.mjs` — `@astrojs/node` standalone, `@astrojs/react`, `@tailwindcss/vite`, Port 3002, Phosphor SSR-prebundled. `src/layouts/BaseLayout.astro` (Slot + head, Titel hardcoded EN), `src/components/DeveloperBackground.astro` (fixed Gradient), `src/styles/global.css` (Token-`@theme`: `--color-fg #ececf1`, `--color-muted #9fb0bc`, `--color-accent #28a8d8`, `--color-on-accent`, `--radius-button .5rem`, `--radius-card .75rem`, `--text-hero/-body/-nav`, `.text-link`-Hover), `src/pages/index.astro` (Landing, Style-Vorlage). KEINE Form-/Input-/Button-Komponenten, KEIN i18n.
- **Env** `apps/developer/.env.local`: `PORT=3002`, `BACKEND_URL=http://localhost:4000`, `INTERNAL_API_KEY=dev-internal-key-change-in-production`.
- **BFF-Vorlage** `apps/frontend/src/api/client.ts`: `BACKEND_URL` aus `process.env`/`import.meta.env`, `INTERNAL_API_KEY` als `X-API-Key`-Header, `X-Forwarded-For` aus `clientAddress`. Proxy-Beispiel `apps/frontend/src/pages/api/resolve.ts` (`APIRoute`, `clientAddress`, Response-Body durchleiten, `Retry-After` relayen). **Set-Cookie wird dort NICHT relayed** (kein Session-Cookie) → MC-066 ergänzt das.
- **Backend-Routen** (`@musiccloud/shared` `ENDPOINTS.dev.auth`): `signup`/`verifyEmail`/`login`/`requestReset`/`resetPassword`/`logout`/`me` + `github.{start,exchange}`. Session = httpOnly-Cookie `mc_dev_session`. `/me` braucht das Cookie (Guard `authenticateDeveloper`). Antworten: signup/login/me → `{ account: { id, email, emailVerified, displayName, avatarUrl, plan, createdAt } }`; verify/reset/logout/request-reset → `{ ok: true }`; github/start → `{ authorizeUrl, state }`; github/exchange → `{ account }` + Set-Cookie. Fehler-Shape `{ error, message }` (Codes: `INVALID_REQUEST`, `EMAIL_TAKEN`, `INVALID_TOKEN`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `INVALID_STATE`, `GITHUB_ERROR`, `NO_VERIFIED_EMAIL`, `ACCOUNT_SUSPENDED`).
- **Form-Styles als Referenz**: `packages/dashboard-ui/src/primitives/FieldPrimitives.tsx` + `ButtonPrimitive.tsx` (React, für Dashboard-SPA). Nicht direkt importierbar (anderes Token-/Build-Setup) — die Developer-App baut eigene, schlanke Islands mit ihren `global.css`-Tokens. Klassen-Logik als Stil-Vorlage lesbar.
- [x] Refs am Execute-Time erneut verifiziert. **Befund:** `/api/dev/*` ist backend-seitig PUBLIC (kein `authenticateInternal`/`authenticatePublic`; `devAuthRoutes`/`devGitHubRoutes` am Root-Scope, server.ts:454-469); Session = `mc_dev_session`-Cookie. `Headers.getSetCookie()` unter `@astrojs/node` verfügbar (Node v26, gibt unfolded Array). `buildAccountResponse`-Shape bestätigt. Cookie-Name `mc_dev_session` aus `SESSION_COOKIE_NAME`.

## Designentscheidungen

- **BFF-Catch-all statt Per-Route-Proxy**: ein `src/pages/api/dev/[...path].ts` deckt ALLE `/api/dev/*`-Calls ab (DRY). Methode, Body, `Cookie`-Header durchreichen; `X-API-Key` + `X-Forwarded-For` setzen; ALLE Response-Header inkl. `Set-Cookie` relayen. (Falls das Backend `INTERNAL_API_KEY` für `/api/dev/*` NICHT verlangt: Header trotzdem setzen, schadet nicht; am Execute-Time prüfen, ob die Dev-Routen public sind.)
- **Formulare = React-Islands** (`client:load`): Login/Signup/Reset brauchen Client-State (Eingabe, Loading, Fehler, Redirect). Die `.astro`-Seite rendert Layout + statischen Text, das Island die Form. `fetch("/api/dev/auth/…", { method, headers:{'Content-Type':'application/json'}, body, credentials:"same-origin" })`.
- **Verify/Reset lesen Token aus der URL**: `/verify?token=…` und `/reset?token=…`. Verify auto-submittet beim Mount; Reset zeigt ein Passwort-Formular.
- **GitHub-OAuth-UI**: `/auth/github` (Astro-GET, server-seitig): BFF-`start` aufrufen → `mc_dev_oauth_state`-Cookie (httpOnly, 10min, sameSite lax) setzen → 302 zu `authorizeUrl`. `/auth/github/callback` (Astro-GET): `state`-Query vs. `mc_dev_oauth_state`-Cookie prüfen (CSRF); Mismatch → `/login?error=oauth`. Sonst BFF-`exchange` `{code,state}` aufrufen, das `Set-Cookie` (mc_dev_session) aus der Backend-Antwort auf die Astro-Response übertragen, State-Cookie löschen, 302 zu `/dashboard`.
- **Geschützte Seiten**: ein Server-Helper `getDeveloperSession(Astro)` liest `mc_dev_session`, ruft Backend `/me` mit weitergereichtem Cookie, gibt `account|null`. `/dashboard/*` redirecten ohne Session zu `/login`. Login/Signup redirecten MIT Session zu `/dashboard`.
- **Mockup-Treue**: Night-Mode-Gradient (vorhanden), glasige Card (`bg-[--color-surface]`/Hairline-Border — Token-getrieben, kein Hardcode), Brand-Blau-Buttons mit weißem Label (`--color-on-accent`), Phosphor-Icons. Login: **GitHub-Button zuerst, Divider, dann E-Mail/Passwort** (Spec verbindlich). Alle Paddings/Radii/Typo aus Tokens (AGENTS.md-Geometrie-Regeln).
- **Dashboard-Shell**: Sidebar-Nav (Overview, API access, API keys, Usage), Header mit Account (Avatar/E-Mail) + Logout. Overview = Account-Summary + Begrüßung. API access/keys/usage = Platzhalter-Panels („Coming soon", Sub-Projekt 3). Logout = POST BFF `/logout` → Cookie weg → `/`.
- **Kein i18n**: EN-hardcoded, keine `useT`/`useLocale` (Provider-Crash-Risiko). Texte später extrahierbar.
- **Avatar/Gravatar**: `avatarUrl` aus dem Account anzeigen; Fallback Initiale/Phosphor-`UserIcon` (Gravatar-Logik ist Backend/Account-Sache, hier nur Anzeige).

## File-Struktur (`apps/developer/src/`)

- **BFF/Session**: `pages/api/dev/[...path].ts` (Catch-all-Proxy), `lib/session.ts` (`getDeveloperSession`, `requireDeveloperSession`), `lib/api.ts` (`backendUrl`, Header-Helper — aus `apps/frontend`-Pattern abgeleitet).
- **Form-Islands** (`components/auth/`): `AuthCard.astro` (glasige Card-Hülle + Logo + Titel + Slot), `TextField.tsx` (Island-Input mit Label/Error), `SubmitButton.tsx` (Island-Button mit Loading), `GitHubButton.astro` (Link zu `/auth/github`, Phosphor-`GithubLogoIcon`), `LoginForm.tsx`, `SignupForm.tsx`, `VerifyView.tsx`, `ForgotForm.tsx`, `ResetForm.tsx`.
- **Auth-Seiten** (`pages/`): `login.astro`, `signup.astro`, `verify.astro`, `forgot.astro`, `reset.astro`, `auth/github.ts` (GET-Endpoint), `auth/github/callback.ts` (GET-Endpoint).
- **Dashboard** (`pages/dashboard/`): `index.astro` (= Overview, protected), `components/dashboard/DashboardLayout.astro` (Sidebar+Header+Slot), `LogoutButton.tsx` (Island).
- **Mod**: `layouts/BaseLayout.astro` (ggf. `<slot name="head">`), `.env.example` (falls vorhanden) — Doku.

---

## Task 1: BFF-Proxy + API-/Session-Helper

**Files:** Create `src/lib/api.ts`, `src/pages/api/dev/[...path].ts`, `src/lib/session.ts`

- [x] **Step 1: `lib/api.ts`** — `BACKEND_URL`/`INTERNAL_API_KEY` aus `process.env`/`import.meta.env`, `backendUrl(path)`, `internalHeaders(clientIp, contentType?)` (setzt `X-API-Key`, `X-Forwarded-For`, optional `Content-Type`). TSDoc.

- [x] **Step 2: BFF-Catch-all `pages/api/dev/[...path].ts`** — `ALL`-Handler (`export const ALL: APIRoute`):
  ```ts
  import type { APIRoute } from "astro";
  import { backendUrl } from "../../../lib/api.js";

  /** INTERNAL_API_KEY shared with the backend for the internal API surface. */
  const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY ?? import.meta.env.INTERNAL_API_KEY ?? "";

  /**
   * BFF proxy for the developer portal. Forwards every `/api/dev/*` request to
   * the backend, injecting the internal API key and the real client IP, passing
   * the browser cookie through, and relaying the backend's response — crucially
   * including `Set-Cookie`, so the `mc_dev_session` cookie is set first-party on
   * developer.musiccloud.io.
   */
  export const ALL: APIRoute = async ({ params, request, clientAddress }) => {
    const path = params.path ?? "";
    const target = backendUrl(`/api/dev/${path}`);
    const headers = new Headers();
    headers.set("X-API-Key", INTERNAL_API_KEY);
    if (clientAddress) headers.set("X-Forwarded-For", clientAddress);
    const cookie = request.headers.get("cookie");
    if (cookie) headers.set("cookie", cookie);
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);

    const init: RequestInit = { method: request.method, headers };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = await request.text();
    }
    const backendRes = await fetch(target, init);

    // Relay status + headers (incl. Set-Cookie) and stream the body back.
    const outHeaders = new Headers();
    backendRes.headers.forEach((value, key) => {
      if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") return;
      outHeaders.append(key, value);
    });
    const setCookies = backendRes.headers.getSetCookie?.() ?? [];
    // getSetCookie returns the unfolded list; ensure each is appended verbatim.
    if (setCookies.length > 0) {
      outHeaders.delete("set-cookie");
      for (const c of setCookies) outHeaders.append("set-cookie", c);
    }
    return new Response(backendRes.body, { status: backendRes.status, headers: outHeaders });
  };
  ```
  (Am Execute-Time prüfen: `request.headers.get("cookie")`-Forwarding + `getSetCookie()` unter dem Node-Adapter. Falls `getSetCookie` fehlt, `backendRes.headers.get("set-cookie")` als Fallback.)

- [x] **Step 3: `lib/session.ts`** — `getDeveloperSession(Astro): Promise<Account|null>`: liest `Astro.cookies.get("mc_dev_session")`; ohne Cookie → null. Sonst `fetch(backendUrl("/api/dev/auth/me"), { headers: { "X-API-Key": KEY, cookie: "mc_dev_session=…" } })`; bei 200 → `account`, sonst null. `requireDeveloperSession(Astro)` → bei null `return Astro.redirect("/login")` (Caller gibt das Redirect zurück). `Account`-Typ lokal definieren (Shape wie Backend `buildAccountResponse`). TSDoc.

- [x] **Step 4: Commit** — `Feat: developer-portal BFF proxy + session helper (MC-066)` (5ad2c814)

## Task 2: Form-Island-Primitive + AuthCard

**Files:** Create `src/components/auth/TextField.tsx`, `SubmitButton.tsx`, `AuthCard.astro`, `GitHubButton.astro`

- [x] **Step 1: `TextField.tsx`** (React-Island-Baustein, KEIN `client:` hier — wird in Formularen genutzt): kontrolliertes `<input>` mit Label, optionalem Error-Text, `type`, `name`, `value`, `onChange`, `autoComplete`, `required`. Styling token-getrieben (Tailwind-Klassen gegen `global.css`-Tokens: Hintergrund glasig, Border Hairline, Radius `--radius-button`, Focus-Ring Brand-Blau, Error-Border rot). TSDoc + Props-Interface.

- [x] **Step 2: `SubmitButton.tsx`**: Button mit `loading`-Prop (Spinner/disabled), `children`, `variant` (primary=Brand-Blau+weißes Label / secondary). Weißes Label auf Accent (`--color-on-accent`). TSDoc. (Variant via `ButtonVariant`-`as const`-Namespace in `lib/buttonVariant.ts` — Doctor-Rules `no-inline-discriminant-literals` + non-component-export beachtet.)

- [x] **Step 3: `AuthCard.astro`**: zentrierte, glasige Card (max-w ~`28rem`), Logo/Wortmarke oben (wie `index.astro`), `title`-Prop (h1, kleiner als Hero), optionaler `subtitle`-Slot, `<slot />` für die Form, Footer-Slot für Links. Token-getriebene Paddings/Radien.

- [x] **Step 4: `GitHubButton.astro`**: voll-breiter Link-Button zu `/auth/github` mit Phosphor-`GithubLogoIcon` (`weight="fill"`) + Label „Continue with GitHub". Sekundär-Stil (nicht Brand-Blau, sondern neutrale glasige Fläche mit Border).

- [x] **Step 5: Commit** — `Feat: developer-portal auth form primitives + AuthCard (MC-066)` (8a3831e9)

## Task 3: Login + Signup

**Files:** Create `src/components/auth/LoginForm.tsx`, `SignupForm.tsx`; `src/pages/login.astro`, `signup.astro`

- [x] **Step 1: `LoginForm.tsx`** (Island): E-Mail + Passwort, Submit → `POST /api/dev/auth/login`. Bei 200 → `window.location.href = "/dashboard"`. Bei 401 `INVALID_CREDENTIALS` → Inline-Fehler „Invalid email or password." Bei 403 `EMAIL_NOT_VERIFIED` → Hinweis. Loading-State. „Forgot password?"-Link zu `/forgot`. (4 `useState`, unter dem `prefer-useReducer`-Threshold.)

- [x] **Step 2: `login.astro`**: redirect zu `/dashboard` wenn schon eingeloggt (`getDeveloperSession`). `AuthCard title="Sign in"` → **`GitHubButton` zuerst**, „or"-Divider (`OrDivider.astro`), dann `<LoginForm client:load />`. Footer: „No account? Sign up" → `/signup`. `?error=oauth` (vom Callback) als Inline-Hinweis.

- [x] **Step 3: `SignupForm.tsx`** (Island): Display-Name (optional), E-Mail, Passwort (8–128, Client-Hinweis). Submit → `POST /api/dev/auth/signup`. Bei 201 → Erfolgs-State (`AuthStatus` Info-Tone „Check your email"). Bei 409 `EMAIL_TAKEN` → Inline-Fehler am E-Mail-Feld. Bei 400 → Passwort-Feldfehler. State via `useReducer` (6 Felder → 1 Atom, klärt `prefer-useReducer`).

- [x] **Step 4: `signup.astro`**: redirect wenn eingeloggt. `AuthCard title="Create your developer account"` → `GitHubButton` zuerst, Divider, `<SignupForm client:load />`. Terms/Privacy-Hinweis. Footer: „Already have an account? Sign in" → `/login`.

- [x] **Step 5: Gates** — `pnpm --filter @musiccloud/developer build` grün, `pnpm lint`, `pnpm doctor:diff` + Full-Scan (0 issues), `astro check` (0/0/0). MC-066-Doctor-Override-Block komplett entfernt (alle Scaffolding-Files haben jetzt Consumer); dead `requireDeveloperSession`-Export aus `session.ts` entfernt statt suppressed. Commit `Feat: developer-portal login + signup pages (MC-066)`.

## Task 4: Verify + Forgot + Reset

**Files:** Create `src/components/auth/VerifyView.tsx`, `ForgotForm.tsx`, `ResetForm.tsx`; `src/pages/verify.astro`, `forgot.astro`, `reset.astro`

- [x] **Step 1: `VerifyView.tsx`** (Island): `token`-Prop. Beim Mount `POST /api/dev/auth/verify-email {token}` via `AbortController` (Cleanup bricht in-flight ab, kein State-Update nach Unmount). States: „Verifying…" (Spinner) → Erfolg „Email verified" (`AuthStatus` Success, Link `/login`) → Fehler „Verification failed" (`AuthStatus` Error, Signup-Hinweis).

- [x] **Step 2: `verify.astro`**: liest `Astro.url.searchParams.get("token")`. Ohne Token → Fehlertext. Mit Token → `AuthCard title="Verify email"` + `<VerifyView client:load token={token} />`.

- [x] **Step 3: `ForgotForm.tsx`** (Island): E-Mail, Submit → `POST /api/dev/auth/request-reset`. IMMER Erfolgs-State „If an account exists for that address, a password-reset link is on its way." (kein Account-Leak; nur Transport-Fail status 0 → Retry-Hinweis).

- [x] **Step 4: `forgot.astro`**: `AuthCard title="Reset password"` + Subtitle + `<ForgotForm client:load />`. Footer: „Back to sign in".

- [x] **Step 5: `ResetForm.tsx`** (Island): `token`-Prop, Passwort + Confirm (Client-Match-Check vor dem Request), Submit → `POST /api/dev/auth/reset-password {token,password}`. Bei 200 → „Password updated" (`AuthStatus` Success, Link `/login`). Bei 400 `INVALID_TOKEN`/Validation → Inline-Fehler am Confirm-Feld.

- [x] **Step 6: `reset.astro`**: liest `token` aus Query. Ohne Token → Fehlertext mit `/forgot`-Link. Mit Token → `AuthCard title="Set a new password"` + `<ResetForm client:load token={token} />`.

- [x] **Step 7: Gates + Commit** — Build ✓, `astro check` 0/0/0 ✓, `pnpm lint` ✓, Full-Doctor-Scan + `doctor:diff` (0 issues) ✓, shared-typecheck ✓. `Feat: developer-portal verify + reset flow pages (MC-066)`.

## Task 5: GitHub-OAuth-UI-Flow

**Files:** Create `src/pages/auth/github.ts`, `src/pages/auth/github/callback.ts`

- [x] **Step 1: `auth/github.ts`** (`GET`): `start` server-seitig via `fetch(backendUrl(ENDPOINTS.dev.auth.github.start), { headers: internalHeaders(clientAddress) })` → `{authorizeUrl, state}`. `context.cookies.set("mc_dev_oauth_state", state, { httpOnly:true, secure: import.meta.env.PROD, sameSite:"lax", path:"/", maxAge:600 })`. `return context.redirect(authorizeUrl)`. Fehler/non-200/leerer Payload → `context.redirect("/login?error=oauth")`. `export const prerender = false`.

- [x] **Step 2: `auth/github/callback.ts`** (`GET`): `code` + `state` aus `context.url.searchParams`. `mc_dev_oauth_state`-Cookie lesen; fehlt/`!== state` → `/login?error=oauth`. Sonst `POST backendUrl(ENDPOINTS.dev.auth.github.exchange)` mit `internalHeaders()` + JSON-Body `{code, state}`. Non-200 → `/login?error=oauth`. Bei 200: Backend-`Set-Cookie` (`res.headers.getSetCookie()`, Fallback `get("set-cookie")`) raw weiterreichen + State-Cookie löschen → `/dashboard`. **Cookie-Relay-Lösung:** deterministische `new Response(null, { status:302, headers })` mit `headers.append("set-cookie", …)` (Repo-Pattern aus `apps/frontend/src/pages/api/redirect.ts`), da Astros `context.cookies`-Store nicht auf manuell konstruierte Responses angewandt wird — State-Delete daher als raw `Set-Cookie; Max-Age=0`-Header in derselben Response. TSDoc erklärt CSRF + Relay.

- [x] **Step 3: Gates + Commit** — Build ✓, astro check 0/0/0 ✓, shared-typecheck ✓, `pnpm lint` (837 files) ✓, `doctor:diff` 0 issues ✓, Full-Doctor-Scan (251 files, 4 workspaces) 0 issues ✓. `Feat: developer-portal GitHub OAuth UI flow (MC-066)`.

## Task 6: Dashboard-Shell + Logout

**Files:** Create `src/components/dashboard/DashboardLayout.astro`, `src/components/dashboard/LogoutButton.tsx`, `src/pages/dashboard/index.astro`

- [ ] **Step 1: `DashboardLayout.astro`**: Props `account`, `active` (Tab-Key). Sidebar-Nav: Overview (`/dashboard`), API access, API keys, Usage (letztere drei als deaktivierte/„Coming soon"-Items). Header: Wortmarke + Account (Avatar aus `avatarUrl` oder Initiale, E-Mail) + `<LogoutButton client:load />`. `<slot />` für Panel-Inhalt. Token-getrieben, glasig.

- [ ] **Step 2: `LogoutButton.tsx`** (Island): Button → `POST /api/dev/auth/logout` → `window.location.href = "/"`.

- [ ] **Step 3: `dashboard/index.astro`** (Overview, protected): `const account = await getDeveloperSession(Astro); if (!account) return Astro.redirect("/login");`. `DashboardLayout account={account} active="overview"` → Begrüßung („Welcome, {displayName||email}"), Account-Summary-Karte (E-Mail, Plan, verifiziert-Status, Mitglied seit `createdAt`), Platzhalter „Get started"-Hinweis (API access folgt).

- [ ] **Step 4: Gates + Commit** — Build/Lint/Doctor grün. `Feat: developer-portal dashboard shell + overview (MC-066)`.

## Task 7: Lokale Verifikation (Browser)

- [ ] **Step 1:** Dev-Server via `./app start` (developer + backend). Backend braucht lokale DB + `mc_dev_session`-fähige Env.
- [ ] **Step 2: agent-browser** (erste Wahl, [[browser_verification]]): Rendering aller Seiten prüfen (`/login`, `/signup`, `/verify`, `/forgot`, `/reset`, `/dashboard`→redirect). Konsole + Server-Log auf SSR-Island-Fehler prüfen (kein LocaleProvider-Crash, da kein `useT`).
- [ ] **Step 3: E-Mail-Flow lokal** (kein echter Versand nötig fürs Rendering): Signup-Form abschicken → 201-State; Login mit falschen Daten → Fehler-State; Login-Redirect-Logik. **Kein unbeaufsichtigtes Playback/Mailversand** — nur UI-/Status-Verifikation.
- [ ] **Step 4:** Screenshots Login + Signup + Dashboard (Beleg, [[doc_screenshots]] gilt für Doku, hier reicht lokal). Geometrie/Tokens gegen Landing + Spec abgleichen.

## Tests und Gates

- `pnpm --filter @musiccloud/developer build`
- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm lint`
- `pnpm doctor:diff` (React-Islands → Doctor aktiv; Regeln einhalten: stabile Props, keine inline-Discriminant-Literals, Cleanup in Effects)
- Lokale Browser-Verifikation (Task 7)

## Checkliste

- [x] Task 1: BFF-Proxy + API-/Session-Helper
- [x] Task 2: Form-Island-Primitive + AuthCard
- [x] Task 3: Login + Signup
- [x] Task 4: Verify + Forgot + Reset
- [ ] Task 5: GitHub-OAuth-UI-Flow
- [ ] Task 6: Dashboard-Shell + Logout
- [ ] Task 7: Lokale Browser-Verifikation grün
- [ ] Gates grün (developer-build, shared-typecheck, lint, doctor:diff)
- [ ] Plan nach `done/`, gemergt

## Externer Handoff (Config, nicht Code)

Damit der LIVE-Flow auf `developer.musiccloud.io` funktioniert (lokales Bauen/Testen geht ohne):
- **GitHub-OAuth-App**: Callback-URL `https://developer.musiccloud.io/auth/github/callback` (+ `http://localhost:3002/auth/github/callback` für Dev) registrieren.
- **Zerops Backend-Env**: `DEVELOPER_URL=https://developer.musiccloud.io`, `https://developer.musiccloud.io` in `CORS_ORIGIN`, `GITHUB_OAUTH_CLIENT_ID`/`_SECRET` (laut Memory schon gesetzt — verifizieren).
- **Zerops Developer-Service-Env**: `INTERNAL_API_KEY` (gleich wie Backend) — der BFF braucht ihn server-seitig.

## Folge (nicht in MC-066)

API-Doku (Astro/MDX), API-access-Antragsformular + MC-025-Admin, API-keys/Usage-Tabs, Account-Seite (Passwort ändern, Account löschen DSGVO), Google/Apple-Login, i18n.
