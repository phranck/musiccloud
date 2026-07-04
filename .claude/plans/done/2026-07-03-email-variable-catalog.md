# Email-Variablen-Katalog mit Scopes (Phase A) — Implementation Plan

Plan-Nr.: MC-081

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task (TDD), nicht hier vorab.

**Goal:** Template-Variablen gehören dem System, nicht mehr der Action: ein zentraler Katalog mit drei Scopes (System aus Env, Empfänger aus dem Adressaten, Kontext vom Ereignis). Actions deklarieren nur noch ihre Kontext-Extras. Die zwei hartkodierten Developer-Mails wandern auf die Action-Registry. Der Template-Editor zeigt alle verfügbaren Variablen als klickbare Chips (Insert), markiert unbekannte Variablen rot.

**Architecture:** Katalog + Verfügbarkeits-Helper in `@musiccloud/shared` (eine Quelle der Wahrheit für Namen, Scope, Beschreibung, Beispielwert). Auflösung der Werte (Env, Empfänger) im Backend-Resolver-Service. `triggerEmailAction` merged System ∪ Empfänger ∪ Kontext; Gates prüfen gegen die Verfügbarkeitsmenge statt gegen Action-deklarierte Listen. Dashboard konsumiert den Katalog für Panel + Validierung.

**Tech Stack:** `@musiccloud/shared`, Fastify, Drizzle (Postgres, Seed-Migration), React (Dashboard), vitest, Biome.

---

## Design-Entscheidungen

- **Scopes** (PascalCase-Namespaces per Doctor-Regel `domain-literals`): `EmailVariableScope.System | Recipient | Context`; `EmailRecipientKind.AdminUser | DeveloperAccount`.
- **Katalog** `EMAIL_VARIABLES` lebt in `packages/shared/src/email-variables.ts` (Datei existiert; hält weiterhin `extractEmailTemplateVariables` — Domäne identisch). Jede Variable: `name`, `scope`, `description` (EN), `sampleValue` (für Test-Send/Preview).
  - System: `websiteUrl` (PUBLIC_URL), `dashboardUrl` (DASHBOARD_URL), `developerUrl` (DEVELOPER_URL), `loginUrl` (DASHBOARD_URL + `/login`).
  - Empfänger AdminUser: `username`, `email`, `role`. Empfänger DeveloperAccount: `username` (= `displayName`, Fallback Localpart der Email), `email`.
  - Kontext: `inviteUrl`, `verifyUrl`, `resetUrl`.
- **`EmailActionMeta`**: `variables` → `contextVariables: string[]`; NEU `recipientKind: EmailRecipientKind`. Registry-Einträge: `adminInviteSent` (AdminUser, `["inviteUrl"]`), NEU `developerVerificationRequested` (DeveloperAccount, `["verifyUrl"]`, required), NEU `developerPasswordResetRequested` (DeveloperAccount, `["resetUrl"]`, required).
- **Verfügbarkeits-Helper** in shared: `listAvailableEmailVariables(recipientKind, contextVariables)` → Namensmenge für Gates + Editor.
- **Resolver** (neu, Backend): `services/email-variable-resolver.ts` — `resolveSystemVariables()` (aus Env), `resolveRecipientVariables(kind, recipient)`. Kein Env-Zugriff in shared.
- **`TriggerEmailActionInput`**: `{ to, recipient, context }` statt `variables` (Call-Sites liefern nur noch Kontext + Empfänger-Objekt). Send-Gate prüft extrahierte Template-Variablen ⊆ gemergte Auflösung.
- **Bind-Gate** (`admin-email-actions.ts`): extrahierte Variablen ⊆ `listAvailableEmailVariables(meta.recipientKind, meta.contextVariables)`.
- **Prod-Safety Seed:** Da beide Developer-Actions `required: true` sind, MUSS die Migration zwei Default-Templates (Copy aus `developer-email.ts` übernommen: Heading/Body/Button mit `{{verifyUrl}}` bzw. `{{resetUrl}}`) plus enabled Bindings seeden — sonst wirft der Signup-/Reset-Flow nach Deploy. Präzedenz für INSERT-Migrationen: `0004`, `0018`, `0021`.
- **Test-Send + Preview**: System + Empfänger (Caller) echt auflösen; danach noch fehlende extrahierte Variablen aus `sampleValue` füllen.
- **Editor-Panel** ersetzt `DetectedVariables` (Anzeige-Teil): Gruppen System/Empfänger/Kontext als klickbare Chips (Insert an Cursor-Position in Betreff-Input bzw. MarkdownEditor; MarkdownEditor bekommt dafür eine kleine imperative Insert-API als optionalen Prop — Detail beim Task per TDD), erkannte unbekannte Variablen als rote Warn-Chips. Kontext-Gruppe zeigt die Kontext-Variablen der Actions, an die das Template gebunden ist (via `useEmailActions`); ungebunden → nur System/Empfänger + Hinweis.
- **EmailActionsPage**: zeigt `contextVariables` + statischen Hinweis, dass System-/Empfänger-Variablen immer verfügbar sind.
- **`developer-email.ts` wird gelöscht** (beide Call-Sites auf `triggerEmailAction` umgestellt); Doku/TSDoc im selben Schritt aktualisieren.

## Task-Checkliste

- [x] **Task 1 — Shared Katalog (TDD):** `EmailVariableScope`, `EmailRecipientKind`, `EmailVariableMeta`, `EMAIL_VARIABLES`, `getEmailVariableMeta`, `listAvailableEmailVariables` in `packages/shared/src/email-variables.ts` + Tests (Scope-Mengen, Developer-Kind ohne `role`, Kontext-Zuschnitt). Shared bauen.
- [x] **Task 2 — Shared Registry:** `EmailActionMeta` auf `contextVariables` + `recipientKind` umstellen; drei Registry-Einträge (invite + 2 Developer-Actions); bestehenden Registry-Test (`packages/shared/src/__tests__/email-blocks.test.ts:54` erwartet `meta.variables`) anpassen.
- [x] **Task 3 — Backend Resolver (TDD):** `services/email-variable-resolver.ts` (`resolveSystemVariables`, `resolveRecipientVariables` inkl. Developer-`username`-Fallback) + Tests.
- [x] **Task 4 — Trigger-Umbau (TDD):** `triggerEmailAction` auf `{ to, recipient, context }`; Merge-Reihenfolge System < Empfänger < Kontext; Send-Gate gegen Merge; `email-actions.test.ts` anpassen.
- [x] **Task 5 — Bind-Gate:** `admin-email-actions.ts:119-126` auf `listAvailableEmailVariables`; Fehlermeldung nennt Scope-Erklärung; Route-Test.
- [x] **Task 6 — Invite-Call-Site:** `admin-users.ts:121-130` liefert `recipient` (username/email/role) + `context.inviteUrl`; `loginUrl`-Konstruktion entfällt (System-Scope).
- [x] **Task 7 — Developer-Mails auf Registry:** `developer-auth.ts:227` + `:325` auf `triggerEmailAction`; `services/developer-email.ts` löschen; Tests der Route anpassen.
- [x] **Task 8 — Seed-Migration:** neue SQL-Migration (Nummer via `pnpm db:generate` bzw. Custom-Migration analog Präzedenz `0018`): zwei Default-Templates (Verify/Reset, Text-Block + Button-Block, Betreffe aus `developer-email.ts`) + zwei enabled Bindings; lokal anwenden (`pnpm db:migrate`).
- [x] **Task 9 — Test-Send:** `admin-email-templates.ts` Test-Route auf Resolver (System+Empfänger echt vom Caller) + `applySampleValues` für Kontext-Variablen. *(Befund bei Umsetzung: die Preview-Route interpoliert nie — `renderEmailPreview` nimmt keine Variablen, Platzhalter bleiben by design sichtbar; Preview-Teil daher gegenstandslos.)*
- [x] **Task 10 — Dashboard Variablen-Panel:** `DetectedVariables` (`EmailTemplateEditPage.tsx:410-425`, Einbau `:389`) zu Panel mit Gruppen-Chips, Insert (Betreff + MarkdownEditor-Insert-API), rote Unknown-Chips; Kontext via `useEmailActions`.
- [x] **Task 11 — EmailActionsPage + i18n:** `EmailActionsPage.tsx:184` auf `contextVariables` + Scope-Hinweis; i18n-Keys (de+en) für Panel/Gruppen/Warnung/Hinweis; entfallene Keys aufräumen.
- [x] **Task 12 — Verifikation:** *(Gates grün: 3× Typecheck, lint 913 Files, doctor:diff 0 Issues, Tests shared 83 / backend 1289 / dashboard 61 / frontend 313; API-Smoke: GET /api/admin/email-actions liefert 3 Actions inkl. Seeds live aus der DB. Visuelle Panel-Abnahme im Dashboard: User.)* Typecheck (backend+dashboard+frontend), `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`); Dashboard-Smoke (Panel, Insert, Unknown-Warnung, Actions-Seite); Signup-/Reset-Smoke gegen lokales Backend (Mail-Render ohne Throw).

## Verifizierte Fakten (2026-07-03)

- Plan-Nr. `MC-081` via `plans next`.
- Registry: `packages/shared/src/email-actions.ts` — `EmailActionMeta.variables:20`, `adminInviteSent:27-32`, `EmailAction`-Namespace `:39-41`; Re-Export via `packages/shared/src/index.ts:7-9`.
- Extraktion: `packages/shared/src/email-variables.ts` — `extractEmailTemplateVariables:47`.
- Send-Gate: `apps/backend/src/services/email-actions.ts:82-89`; Renderer-Aufruf `:91-97` (`renderEmailTemplate(payload, template.branding, branding, variables, baseUrl)`); `PUBLIC_URL` via `requireEnv:70`.
- Bind-Gate: `apps/backend/src/routes/admin-email-actions.ts:119-126` (`meta.variables.includes`).
- Invite-Call-Site: `apps/backend/src/routes/admin-users.ts:121-130` (liefert username/email/role/inviteUrl/loginUrl; `DASHBOARD_URL:117`).
- Developer-Mails: `apps/backend/src/services/developer-email.ts` (`sendDeveloperVerificationEmail:76`, `sendDeveloperPasswordResetEmail:103`, `DEVELOPER_URL`-Links); Call-Sites `apps/backend/src/routes/developer-auth.ts:227,325`, Import `:66`.
- `developer_accounts`-Spalten (`postgres.ts:1510ff`): `email` notNull unique, `displayName` nullable, KEIN `role`/`username`.
- Env-Vars existieren: `PUBLIC_URL`, `DASHBOARD_URL`, `DEVELOPER_URL`, `FRONTEND_URL` (grep `requireEnv`/`env.` + `apps/backend/.env.local`).
- Test-Send: `apps/backend/src/routes/admin-email-templates.ts:295-305` (hartkodierte 5 Variablen); Preview `renderEmailPreview:255`, Variablen-Objekt `:298`.
- Dashboard: `DetectedVariables` `apps/dashboard/src/features/templates/email-templates/EmailTemplateEditPage.tsx:410-425`, Einbau `:389`; `EmailActionsPage.tsx:184` (`action.variables.map`); Hook-Typ `EmailActionWithBindings extends EmailActionMeta` (`useEmailActions.ts:25`).
- MarkdownEditor: `apps/dashboard/src/components/ui/MarkdownEditor.tsx` — CodeMirror-basiert (`@uiw/react-codemirror`), vollständig gelesen; Insert-API noch NICHT vorhanden (wird Task 10).
- Shared-Test-Konsument: `packages/shared/src/__tests__/email-blocks.test.ts:54` (`meta!.variables`).
- Migrations-Verzeichnis `apps/backend/src/db/migrations/postgres/`, Head `0053_tearful_bloodstorm.sql`; INSERT-Präzedenz `0004`, `0018`, `0021`.
- Gates: `tsc --noEmit` je App, `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`).
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).

## Offene Punkte

- Exakte Insert-Mechanik der MarkdownEditor-API (ref-Prop vs. Callback-Registrierung) wird in Task 10 per TDD entschieden — kein Fakt, bewusst offen.
- Migrationsnummer der Seed-Migration ergibt sich beim Generieren (Head kann durch MC-082 wandern).

## Abgeschlossen (2026-07-04)

Checkliste 100 %, alle Deliverables gegen den aktuellen Code verifiziert (`EMAIL_VARIABLES` in `packages/shared/src/email-variables.ts`, `services/email-variable-resolver.ts`), Gates grün, in Produktion. Nach `done/` verschoben auf ausdrückliche User-Ansage vom 2026-07-04.
