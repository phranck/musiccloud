# Signup-/Signin-Flow-Redesign (ohne Polar) — Implementierungsplan

Plan-Nr.: MC-109

> **Für agentische Worker:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Task für Task umzusetzen. Steps nutzen Checkbox-Syntax (`- [x]`).

**Goal:** Den Developer-Portal-Signup/-Signin so umbauen, dass jeder Account immer einen Tier hat, ein GitHub-Neuuser ohne Account nicht mehr ins Dashboard rutscht, und tier-lose Altlasten auf `tier_free` gebackfillt werden — alles ohne Polar.

**Architecture:** Der GitHub-OAuth-`state` (signiertes `@fastify/jwt`) trägt zusätzlich ein `intent` (`login`|`signup`). Der Exchange-Handler legt bei `intent=login` für einen unbekannten Nutzer **keinen** Account mehr an (409 → BFF leitet auf `/pricing`), bei `intent=signup` legt er ihn **mit `tier_free`** an. Email-Signup weist ebenfalls immer mindestens `tier_free` zu. Frontend-Gates (`/signup`, Dashboard) und eine Backfill-Migration schließen den tier-losen Zustand. Bezahl-Tiers sind mangels Polar automatisch nicht zuweisbar; `tier`/`interval` im State folgen erst in Plan C.

**Tech Stack:** Fastify + `@fastify/jwt` (Backend), Astro (developer-App BFF), Drizzle (Postgres-Migration), Vitest (Backend-Tests).

**Referenz-Spec:** `docs/superpowers/specs/2026-07-08-signup-flow-polar-billing-design.md` (Sektion 1 „Flow“, Sektion 2 „Sicherheitsmodell“, Plan A im Plan-Split).

---

## Verifizierte Fakten (2026-07-08, per Read/grep)

- **OAuth-State-Signierung:** `apps/backend/src/routes/developer-github.ts:44-48` — `app.jwt.sign({ nonce, kind: GitHubOAuth.StateKind }, { expiresIn: "10m" })`. Payload heute **nur** `{ nonce, kind }`. `GitHubOAuth.StateKind = "gh_oauth_state"` (`:32`).
- **State-Validierung (Exchange):** `developer-github.ts:60-65` — `app.jwt.verify(body.state)`, prüft Signatur/Expiry + `kind`. CSRF-Cookie-Match liegt im BFF: `apps/developer/src/pages/auth/github/callback.ts:73`.
- **Endpunkte:** `GET /api/dev/auth/github/start` → `{ authorizeUrl, state }` (`developer-github.ts:44`); `POST /api/dev/auth/github/exchange` body `{ code, state }` → `{ account }` + `Set-Cookie: mc_dev_session` (`:50`). Konstanten `ENDPOINTS.dev.auth.github.{start,exchange}` — `packages/shared/src/endpoints.ts:429,431`.
- **Exchange-Branches:** returning identity `:78-83`; existing-email-link `:93-112`; **brand-new `:113-141`** mit `repo.createDeveloperAccount({ email, displayName, avatarUrl })` (`:115-119`) **ohne `tierId`** = der Bug. `NO_VERIFIED_EMAIL`-Guard `:87-91`; Session-Mint `:154-155`.
- **`createDeveloperAccount`-Signatur:** `apps/backend/src/db/developer-repository.ts:118-124` — `{ email; passwordHash?; displayName?; avatarUrl?; tierId? }`, `tierId` default `null` (Adapter `apps/backend/src/db/adapters/postgres-developer.ts:249`).
- **Email-Signup-Tierlogik:** `apps/backend/src/routes/developer-auth.ts:202-212` — `tierId` bleibt `null`, wenn `body.tierId` fehlt/ungültig/nicht `enabled`; Übergabe `:229`.
- **`/me` liefert nur `tierName`, nicht `tierId`:** `developer-auth.ts:445-461`; `buildAccountResponse` (`:151-162`) lässt `tierId` weg. → Frontend-Gate kann nur `tierName == null` prüfen.
- **Session-DTO:** `apps/developer/src/lib/session.ts:26-51` — `Account` hat `tierName: string|null`, kein `tierId`.
- **Dashboard-Auth-Check:** `apps/developer/src/pages/dashboard/index.astro:21-22` — `const account = await getDeveloperSession(Astro); if (!account) return Astro.redirect("/login");`.
- **Signup-Tier-Gate heute:** `apps/developer/src/pages/signup.astro:39-52` — liest `?tier=`, validiert gegen `enabled`; bei fehlend/ungültig **kein** Redirect (rendert Plain-Signup). Nutzt hardcodierten String `"/api/v1/tiers"` (`:43`); Konstante `ENDPOINTS` dafür: `packages/shared/src/endpoints.ts:124`.
- **GitHub-Button:** `apps/developer/src/components/auth/GitHubButton.astro:17-23` — statisches `<a href="/auth/github">`, keine Props. Genutzt in `login.astro:36` und `signup.astro`.
- **`/auth/github` (BFF):** `apps/developer/src/pages/auth/github.ts:39-61` — liest **keinen** Query-Param, ruft Backend-Start server-to-server, setzt Cookie `mc_dev_oauth_state` (`:49-55`), redirectet auf `authorizeUrl`.
- **Callback:** `apps/developer/src/pages/auth/github/callback.ts:67-95` — CSRF-Match `:73`, Exchange `:78-82`, Session-Relay + Redirect `DASHBOARD_PATH = "/dashboard"` (`:17`, `:86-91`).
- **Migration-Pattern:** hand-geschriebenes SQL, angewandt via `apps/backend/src/db/run-migrations.ts` (`migrate(db, …)`, crasht bei Fail `:60-61`). Anwendungs-Script im **Repo-Root**: `pnpm db:migrate` = `node scripts/migrate.mjs`; `db:generate` (drizzle-kit) nur für Schema-Diffs, nicht für reine Daten-Migrationen. Seed `tier_free` in `0058_white_puff_adder.sql:17-18`; Backfill-Vorbild `0061_lowly_kylun.sql` (`UPDATE developer_accounts SET tier_id = …`). Letzte Migration `0066`; jede braucht Journal-Eintrag in `meta/_journal.json`. Spalte SQL-seitig `tier_id`.
- **Tests:** Vitest; `test:run` = `vitest run` (in `apps/backend`). Muster: Fastify + `app.inject` + `vi.mock("../db/index.js")` (Repo gestubbt). Bestes Vorbild: `apps/backend/src/routes/developer-github.test.ts` (testet bereits alle drei Branches).

**Verifikations-Checkliste:**
- [x] Alle Code-Referenzen vor Task-Start re-verifiziert (Funktionen, Endpunkte, Pfade, Migration-Nummer, `plans next`).

## Dateistruktur

**Backend (Fastify):**
- `apps/backend/src/routes/developer-github.ts` — Start-Endpoint um `intent` erweitern; Exchange: `intent` lesen, Brand-new-Branch nach `intent` verzweigen.
- `apps/backend/src/services/developer-github.ts` — `GitHubOAuth`-State-Typ um `intent` erweitern (Konstanten/Typen).
- `apps/backend/src/services/signup-tier.ts` — **neu**: `resolveSignupTierId(requestedTierId)` (Single Source für „welcher Tier ist zuweisbar“; in Plan A: nur `tier_free`).
- `apps/backend/src/routes/developer-auth.ts` — Email-Signup: `resolveSignupTierId` statt der bisherigen null-Default-Logik.
- `apps/backend/src/db/migrations/postgres/0067_backfill_accounts_tier_free.sql` — **neu**: Backfill.
- `apps/backend/src/db/migrations/postgres/meta/_journal.json` — Journal-Eintrag idx 67.

**Frontend (Astro developer-App):**
- `apps/developer/src/components/auth/GitHubButton.astro` — `intent`-Prop → `href="/auth/github?intent=…"`.
- `apps/developer/src/pages/login.astro` — `<GitHubButton intent="login" />`.
- `apps/developer/src/pages/signup.astro` — `<GitHubButton intent="signup" />`; Tier-Gate (nicht-zuweisbarer/fehlender Tier → `/pricing`); Konstante statt String.
- `apps/developer/src/pages/auth/github.ts` — `intent` aus Query lesen + an Backend-Start weiterreichen.
- `apps/developer/src/pages/auth/github/callback.ts` — 409 `NO_ACCOUNT` → Redirect `/pricing?signup=required`.
- `apps/developer/src/pages/dashboard/index.astro` — Tier-Gate: `tierName == null` → `/pricing`.
- `apps/developer/src/pages/pricing.astro` — kleiner Hinweis-Banner bei `?signup=required`.

**Tests:**
- `apps/backend/src/routes/developer-github.test.ts` — erweitern (intent-Branches).
- `apps/backend/src/routes/developer-auth.test.ts` — erweitern (Email-Signup default `tier_free`).
- `apps/backend/src/services/signup-tier.test.ts` — **neu**.

---

## Task 1: `resolveSignupTierId`-Helper (Single Source für Tier-Zuweisung)

**Files:**
- Create: `apps/backend/src/services/signup-tier.ts`
- Test: `apps/backend/src/services/signup-tier.test.ts`

Zweck: In Plan A ist der einzige **zuweisbare** Tier `tier_free`. Ein angefragter Bezahl-Tier (oder ein unbekannter/fehlender) fällt sicher auf `tier_free` zurück — nie tier-los, nie ein Gratis-Bezahl-Tier. Plan C erweitert die Zuweisbarkeit auf kaufbare Bezahl-Tiers.

- [x] **Step 1: Failing test schreiben** — `signup-tier.test.ts`: `resolveSignupTierId(undefined)` → `"tier_free"`; `resolveSignupTierId("tier_free")` → `"tier_free"`; ein angefragter Bezahl-Tier (gemockte `listTiers`) → `"tier_free"`. Repo/Tier-Repo via `vi.mock` stubben (Muster aus `developer-auth.test.ts`).
- [x] **Step 2: Test laufen lassen, muss failen** — `pnpm --filter @musiccloud/backend test:run signup-tier` → FAIL (Modul fehlt).
- [x] **Step 3: Implementieren.** `TIER_FREE_ID = "tier_free"` (vorher grep, ob es bereits eine Free-Tier-Konstante gibt — falls ja, wiederverwenden). `resolveSignupTierId(requestedTierId?: string | null): Promise<string>`: `listTiers()`; wenn ein Tier mit `id === requestedTierId` existiert **und** `isAssignablePlanA(tier)` (Plan A: `tier.id === TIER_FREE_ID`), dessen id zurückgeben, sonst `TIER_FREE_ID`. TSDoc mit Begründung (warum Fallback auf Free, warum kein Gratis-Paid).
- [x] **Step 4: Tests grün** — `pnpm --filter @musiccloud/backend test:run signup-tier` → PASS.
- [x] **Step 5: Commit** — `Refactor: add resolveSignupTierId helper (always assigns a tier)`.

## Task 2: OAuth-State um `intent` erweitern

**Files:**
- Modify: `apps/backend/src/services/developer-github.ts` (State-Typ/Konstante)
- Modify: `apps/backend/src/routes/developer-github.ts:44-48` (Start signiert `intent`), `:60-65` (Exchange liest `intent`)
- Test: `apps/backend/src/routes/developer-github.test.ts`

- [x] **Step 1: Failing test** — Start mit `?intent=signup` aufrufen (`app.inject`), zurückgegebenen `state` mit dem Test-JWT verifizieren, `payload.intent === "signup"` erwarten. Default-Test: ohne Query → `intent === "login"`.
- [x] **Step 2: Fails** — `pnpm --filter @musiccloud/backend test:run developer-github` → FAIL.
- [x] **Step 3: Implementieren.** Start-Handler: `const intent = request.query.intent === "signup" ? "signup" : "login";` (Whitelist, Default `login`) und in `app.jwt.sign({ nonce, kind, intent }, …)`. Exchange: nach der bestehenden `verify`/`kind`-Prüfung `intent` aus dem Payload lesen (`payload.intent === "signup" ? "signup" : "login"`). State-Typ in `services/developer-github.ts` um `intent: "login" | "signup"` ergänzen (TSDoc: warum im **signierten** State — Tamper-Schutz, Sektion 2).
- [x] **Step 4: Grün** — Test PASS.
- [x] **Step 5: Commit** — `Feat: carry signed intent in GitHub OAuth state (MC-109)`.

## Task 3: Brand-new + `intent=login` → 409 `NO_ACCOUNT` (kein Account)

**Files:**
- Modify: `apps/backend/src/routes/developer-github.ts:113-141`
- Test: `apps/backend/src/routes/developer-github.test.ts`

- [x] **Step 1: Failing test** — Exchange mit brand-new Profile (kein Identity, keine Email-Match; Repo-Stubs `findDeveloperIdentity`→null, `findDeveloperAccountByEmail`→null) und State mit `intent=login`: erwarte Status **409**, Body `{ error: "NO_ACCOUNT" }`, **kein** `createDeveloperAccount`-Call, **kein** `Set-Cookie: mc_dev_session`.
- [x] **Step 2: Fails** — Test PASS heute (Account wird angelegt) → also rot gegen die neue Erwartung.
- [x] **Step 3: Implementieren.** Im Brand-new-Branch ganz am Anfang: `if (intent === "login") return reply.status(409).send({ error: "NO_ACCOUNT", message: "No developer account for this GitHub identity. Choose a plan to sign up." });` — vor jeder Account-Erstellung.
- [x] **Step 4: Grün** — Test PASS; bestehende returning-/email-link-Tests weiter grün.
- [x] **Step 5: Commit** — `Fix: GitHub login for unknown user no longer auto-creates an account (MC-109)`.

## Task 4: Brand-new + `intent=signup` → Account mit `tier_free`

**Files:**
- Modify: `apps/backend/src/routes/developer-github.ts:115-119`
- Test: `apps/backend/src/routes/developer-github.test.ts`

- [x] **Step 1: Failing test** — Exchange brand-new + `intent=signup`: erwarte `createDeveloperAccount` aufgerufen mit `tierId: "tier_free"`, Status 200, `Set-Cookie: mc_dev_session` gesetzt.
- [x] **Step 2: Fails** — heute wird ohne `tierId` angelegt → rot.
- [x] **Step 3: Implementieren.** `const tierId = await resolveSignupTierId(undefined);` (Plan A trägt keinen Tier im State → Free) und `createDeveloperAccount({ email, displayName, avatarUrl, tierId })`. Import aus `services/signup-tier.js`.
- [x] **Step 4: Grün** — Test PASS.
- [x] **Step 5: Commit** — `Fix: GitHub signup assigns a tier (never tier-less) (MC-109)`.

## Task 5: Email-Signup weist immer einen Tier zu

**Files:**
- Modify: `apps/backend/src/routes/developer-auth.ts:202-229`
- Test: `apps/backend/src/routes/developer-auth.test.ts`

- [x] **Step 1: Failing test** — Signup ohne `tierId` (und mit unbekanntem `tierId`): erwarte `createDeveloperAccount` mit `tierId: "tier_free"` (heute: `null`).
- [x] **Step 2: Fails** — rot.
- [x] **Step 3: Implementieren.** Den Block `:207-212` ersetzen durch `const tierId = await resolveSignupTierId(body.tierId);`. Übergabe `:229` bleibt (`tierId` nun garantiert gesetzt). Veralteten Kommentar (`account then simply starts unassigned`) korrigieren (Kommentar-IST-Regel).
- [x] **Step 4: Grün** — Test PASS.
- [x] **Step 5: Commit** — `Fix: email signup always assigns a tier (MC-109)`.

## Task 6: Migration 0067 — tier-lose Accounts auf `tier_free` backfillen

**Files:**
- Create: `apps/backend/src/db/migrations/postgres/0067_backfill_accounts_tier_free.sql`
- Modify: `apps/backend/src/db/migrations/postgres/meta/_journal.json`

- [x] **Step 1: Migration schreiben.**
```sql
UPDATE "developer_accounts" SET "tier_id" = 'tier_free' WHERE "tier_id" IS NULL;
```
- [x] **Step 2: Journal-Eintrag** anhängen: `{ "idx": 67, "version": "7", "when": <epoch-ms>, "tag": "0067_backfill_accounts_tier_free", "breakpoints": true }` (Format wie `:432-438`).
- [x] **Step 3: Anwenden** — aus dem **Repo-Root** `pnpm db:migrate` (= `node scripts/migrate.mjs`); alternativ greift `runMigrations` beim Backend-Boot. **Kein** `db:generate` (reine Daten-Migration ohne Schema-Diff → hand-geschrieben + Journal-Eintrag).
- [x] **Step 4: Verify** — `psql "$LOCAL_DB_URL" -c "SELECT count(*) FROM developer_accounts WHERE tier_id IS NULL;"` → **0**. Migrations-Tail in `drizzle.__drizzle_migrations` prüfen.
- [x] **Step 5: Commit** — `Feat: backfill tier-less developer accounts to free (MC-109)`.

## Task 7: GitHub-Button trägt `intent`

**Files:**
- Modify: `apps/developer/src/components/auth/GitHubButton.astro`, `apps/developer/src/pages/login.astro:36`, `apps/developer/src/pages/signup.astro`

- [x] **Step 1: Implementieren.** `GitHubButton.astro`: `interface Props { intent?: "login" | "signup" }`; `const { intent = "login" } = Astro.props;` → `href={`/auth/github?intent=${intent}`}`. `login.astro`: `<GitHubButton intent="login" />`. `signup.astro`: `<GitHubButton intent="signup" />`. Props-TSDoc.
- [x] **Step 2: Manuell verifizieren** — dev-Server (per `./app status|start`), Buttons rendern korrekten `href`.
- [x] **Step 3: Commit** — `Feat: GitHub button carries login/signup intent (MC-109)`.

## Task 8: `/auth/github` reicht `intent` an das Backend weiter

**Files:**
- Modify: `apps/developer/src/pages/auth/github.ts:39-61`

- [x] **Step 1: Implementieren.** `intent` aus `context.url.searchParams` lesen (Whitelist, Default `login`) und an den Backend-Start-Endpoint als Query hängen (`backendUrl(ENDPOINTS.dev.auth.github.start) + "?intent=" + intent`). Restliche Logik (State-Cookie, Redirect) unverändert.
- [x] **Step 2: Manuell verifizieren** — `/auth/github?intent=signup` startet den Flow; Backend-State enthält `intent=signup` (im Inspector/Logs sichtbar).
- [x] **Step 3: Commit** — `Feat: forward OAuth intent through the BFF start route (MC-109)`.

## Task 9: Callback behandelt 409 `NO_ACCOUNT` → `/pricing`

**Files:**
- Modify: `apps/developer/src/pages/auth/github/callback.ts:78-95`

- [x] **Step 1: Implementieren.** Nach dem Exchange-`fetch`: wenn `res.status === 409` und Body `error === "NO_ACCOUNT"` → `redirectWithCookies("/pricing?signup=required", [CLEAR_STATE_COOKIE])` (State-Cookie leeren, keine Session). Bestehender Erfolgs-/`error=oauth`-Pfad unverändert.
- [x] **Step 2: Manuell verifizieren** — Neuer GitHub-User über `/login` → landet auf `/pricing?signup=required`, **nicht** im Dashboard.
- [x] **Step 3: Commit** — `Fix: unknown GitHub login redirects to pricing, not dashboard (MC-109)`.

## Task 10: `/signup`-Tier-Gate

**Files:**
- Modify: `apps/developer/src/pages/signup.astro:39-52`

- [x] **Step 1: Implementieren.** Tier-Liste über die Konstante statt Hardcode holen (`ENDPOINTS`-Wert aus `packages/shared/src/endpoints.ts:124`). Gate: wenn `tierParam` fehlt **oder** kein Tier matcht **oder** der Tier nicht zuweisbar ist (Plan A: nicht `tier_free`) → `return Astro.redirect("/pricing")`. Nur ein zuweisbarer Tier rendert die Signup-Seite. Bestehenden already-authenticated-Bounce (`:30-31`) belassen.
- [x] **Step 2: Manuell verifizieren** — `/signup` (ohne Query) → `/pricing`; `/signup?tier=tier_free` → Signup rendert; `/signup?tier=<paid>` → `/pricing`.
- [x] **Step 3: Commit** — `Feat: signup requires a selectable tier, else redirect to pricing (MC-109)`.

## Task 11: Dashboard-Tier-Gate

**Files:**
- Modify: `apps/developer/src/pages/dashboard/index.astro:21-22`

- [x] **Step 1: Implementieren.** Direkt nach `if (!account) return Astro.redirect("/login");`: `if (account.tierName == null) return Astro.redirect("/pricing");`. TSDoc/Kommentar: Defense-in-depth — nach Backfill sollte kein tier-loser Account existieren, das Gate fängt jeden künftigen tier-losen Pfad.
- [x] **Step 2: Manuell verifizieren** — normaler Free-Account (`tierName="Free"`) → Dashboard; ein künstlich tier-los gesetzter Account → `/pricing`.
- [x] **Step 3: Commit** — `Feat: dashboard gate redirects tier-less accounts to pricing (MC-109)`.

## Task 12: Pricing-Hinweis bei `?signup=required`

**Files:**
- Modify: `apps/developer/src/pages/pricing.astro`

- [x] **Step 1: Implementieren.** Wenn `Astro.url.searchParams.get("signup") === "required"`, oben einen dezenten Hinweis-Banner rendern („Choose a plan to create your account.“). Bestehende Bedingt-Einblendungs-/Animations-Muster des Projekts wiederverwenden (keine harte Ein-/Ausblendung). Text EN (Portal ist EN-only). Keine Em-Dashes.
- [x] **Step 2: Manuell verifizieren** — `/pricing?signup=required` zeigt den Banner; `/pricing` nicht.
- [x] **Step 3: Commit** — `Feat: pricing shows a notice when signup is required (MC-109)`.

## Task 13: Gesamt-Gates + Flow-Smoke

- [x] **Step 1: Backend-Gates** — `pnpm --filter @musiccloud/backend test:run` grün; Typecheck grün.
- [x] **Step 2: Lint/Doctor** — `pnpm doctor:diff` (bzw. projektüblicher Befehl) ohne neue Findings; Biome sauber auf allen berührten `.ts/.tsx/.astro`.
- [x] **Step 3: Flow-Smoke (manuell, lokal)** — GitHub-Neuuser via `/login` → `/pricing`; via `/signup?tier=tier_free` mit GitHub → Account mit „Free“, Dashboard erreichbar; Email-Signup ohne Tier → Account mit „Free“; `/signup` ohne Tier → `/pricing`; Dashboard ohne Tier → `/pricing`. (Kein unbeaufsichtigtes Audio-Playback nötig; reine Auth-Klickpfade.)
- [x] **Step 4: Alle Refs verifiziert** — Verifikations-Checkliste oben abhaken.

---

## Self-Review (nach Fertigstellung auszufüllen)

- [x] **Spec-Abdeckung:** Sektion-1-Flow (Gate, GitHub-intent, Login-no-account, Dashboard-Gate, Backfill) je einem Task zugeordnet? Sektion-2-Sicherheit (signierter State, server-seitige Tier-Auflösung, kein Gratis-Paid) abgedeckt?
- [x] **Placeholder-Scan:** keine „TBD/TODO/handle edge cases“ ohne konkreten Inhalt.
- [x] **Typ-Konsistenz:** `resolveSignupTierId`, `TIER_FREE_ID`, State-`intent`-Typ, `NO_ACCOUNT`-Code über alle Tasks identisch benannt.

## Abgrenzung (bewusst NICHT in Plan A)

- Kein Polar/Checkout/Webhook (Plan B/C), keine `tier`/`interval` im State (Plan C), kein Master-/`istKaufbar`-Gate und keine „Coming soon“-Darstellung (Plan E). In Plan A ist der einzige zuweisbare Tier `tier_free`; Bezahl-Tiers landen über die Gates auf `/pricing`.

## Completed

Abgeschlossen am 2026-07-08, vom User abgenommen. Alle 13 Tasks implementiert, committet (`a0e14bfb` „carry signed intent" … `50f3b5e7` „pricing notice", plus `2b77a810` Em-Dash-Cleanup) und in Produktion deployt; der Signup-/Tier-Flow ist live. Checkliste am 2026-07-08 an den ausgelieferten Stand angepasst (`b636d9be`). Nachfolger: Plan B (Polar-Fundament) laut Spec `docs/superpowers/specs/2026-07-08-signup-flow-polar-billing-design.md`.
