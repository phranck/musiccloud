# Lifecycle-Bestätigungsmails als Registry-Actions (Phase C) — Implementation Plan

Plan-Nr.: MC-084

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task (TDD), nicht hier vorab.

**Goal:** Die vom User gewünschten Bestätigungs-/Benachrichtigungsmails für Developer-Account-Lifecycle-Ereignisse als neue Actions der `EMAIL_ACTIONS`-Registry: Account gelöscht, API-Zugang genehmigt/abgelehnt, API-Token erstellt. Alle **optional** (`required: false`) — ohne gebundenes Template wird still nichts gesendet, der Admin bindet Templates bei Bedarf im Dashboard; dadurch ist KEINE Seed-Migration nötig.

**Architecture:** Vier Registry-Einträge (recipientKind `DeveloperAccount`) + zwei neue Kontext-Variablen im Katalog (`appName`, `reviewNote`). An den existierenden Code-Trigger-Punkten je ein `triggerEmailAction`-Aufruf in try/catch (Mail-Fehler dürfen die Flows nicht brechen — Muster der Invite-Route). Dashboard (Actions-Seite, Variablen-Panel) übernimmt alles automatisch aus der Registry.

**Tech Stack:** `@musiccloud/shared`, Fastify, vitest.

**Bewusst KEINE Action:** „Name geändert" — es existiert kein Update-Flow für `displayName` (ENDPOINTS.dev.auth hat keine Update-Route); Actions sind Code-Trigger-Punkte, ohne Flow keine Action.

---

## Design-Entscheidungen

- **Neue Actions** (alle `recipientKind: DeveloperAccount`, `required: false`):
  - `developerAccountDeleted` — Kontext: keiner. Trigger VOR der Löschung (Account-Daten für den Empfänger-Scope sind dann noch da), Mail geht an die bisherige Adresse.
  - `developerApiAccessApproved` — Kontext: `appName`.
  - `developerApiAccessRejected` — Kontext: `appName`, `reviewNote` (Reject-Body verlangt `reviewNote` bereits).
  - `developerApiTokenCreated` — Kontext: `appName`. Eine Action für alle vier Token-Erzeugungswege (Self-Service create + rotate, Admin-issued create + rotate): fachlich identische Benachrichtigung „für deinen Client wurde ein neuer Token erstellt".
- **Katalog:** `appName` + `reviewNote` als Context-Scope-Einträge mit `description` + `sampleValue`.
- **Empfänger-Auflösung an den Call-Sites:** Request/Client tragen `developerAccountId` → `getDeveloperRepository().findDeveloperAccountById(...)`; `to`/`recipient` aus dem Account (`email`, `displayName`). Fehlt der Account (gelöscht), wird der Trigger übersprungen.
- **Fehler-Semantik:** jeder Trigger-Call in try/catch + `request.log.error` (Muster `admin-users.ts` Invite) — der Fachfluss (Löschen, Approve, Token) schlägt nie wegen Mail-Problemen fehl.
- **Trigger-Skip-Verhalten absichern:** Test im Trigger-Service, dass eine `required: false`-Action ohne enabled Binding still returnt (bislang ungetestet).

## Task-Checkliste

- [x] **Task 1 — Shared (TDD):** Katalog +`appName`/`reviewNote` (Context-Scope, sampleValues); Registry +4 Actions inkl. `EmailAction`-Namespace-Einträge; Tests in `email-blocks.test.ts`/`email-variables.test.ts` erweitern (Kontext-Katalog-Abdeckung prüft alle Actions generisch mit). Shared bauen.
- [x] **Task 2 — Trigger-Skip-Test (TDD):** `email-actions.test.ts`: `required:false`-Action + 0 Bindings → kein Throw, kein Send.
- [x] **Task 3 — delete-account (TDD):** `developer-auth.ts:433` triggert `developerAccountDeleted` vor `deleteDeveloperAccount` (try/catch+log); Route-Test in `developer-auth.test.ts` (Trigger-Mock existiert dort schon).
- [x] **Task 4 — approve/reject (TDD):** `admin-api-access.ts:119` + `:154` triggern approved/rejected mit `appName`(/`reviewNote`); Account-Lookup via `findDeveloperAccountById`; Tests in `admin-api-access.test.ts` (Mocks für `email-actions.js` + ggf. Developer-Repo ergänzen).
- [x] **Task 5 — Token-Notifications (TDD):** vier Call-Sites (`dev-api-access.ts:146,187`; `admin-api-access.ts:215,253`) triggern `developerApiTokenCreated` mit `appName`; Tests in beiden Route-Suiten.
- [x] **Task 6 — Verifikation:** *(Gates grün 2026-07-04: backend tsc EXIT 0, lint 941 Files, doctor Full-Scan 0 Issues, Backend-Suite 1355/1355; Live-Smoke: GET /api/admin/email-actions listet 7 Actions mit korrekten required/recipientKind/contextVariables)* Typecheck backend, `pnpm lint`, `pnpm run doctor` clean, Backend-Tests grün; Smoke: `GET /api/admin/email-actions` listet 7 Actions (3 bestehende + 4 neue) inkl. `contextVariables`/`recipientKind`.

## Nachtrag (2026-07-04, User-Wunsch)

- **`developerAccountCreated`** ergänzt (required:false, Kontext leer): getriggert an BEIDEN Anlegepfaden — Email-Signup (`developer-auth.ts`, try/catch nach der Verify-Mail) und GitHub-Signup (`developer-github.ts`, Brand-new-Zweig nach `markDeveloperEmailVerified`). Registry damit 8 Actions.
- Actions-Liste im Dashboard linksbündig (`text-left` auf `DashboardSection.Item` — neutralisiert das Browser-Default `text-align: center` der Button-Variante).

## Verifizierte Fakten (2026-07-04)

- Plan-Nr. `MC-084` via `plans next`.
- **Kein Flow sendet heute Mails**: grep `sendEmail|triggerEmailAction` in `dev-api-access.ts`/`admin-api-access.ts` leer.
- Trigger-Punkte: delete-account `apps/backend/src/routes/developer-auth.ts:433` (preHandler `authenticateDeveloper`); approve `apps/backend/src/routes/admin-api-access.ts:119`, reject `:154` (reject-Body verlangt `reviewNote`), admin clientCreateToken `:215`, admin tokenRotate `:253`; self-service create `apps/backend/src/routes/dev-api-access.ts:146`, rotate `:187`.
- DTOs: `ApiAccessRequest` (`api-access-repository.ts:28`) mit `developerAccountId`/`appName`/`contactEmail`/`reviewNote`; `ApiClient` (`:58`) mit `developerAccountId`/`appName`; `findDeveloperAccountById` (`developer-repository.ts:128`).
- Trigger-Semantik `required:false` + 0 Bindings = silent return: `services/email-actions.ts` (`if (bindings.length === 0) return;`).
- Invite-try/catch-Muster: `admin-users.ts:120-146`.
- `developer-auth.test.ts` mockt `../services/email-actions.js` bereits (Umbau MC-081); `admin-api-access.test.ts` + `dev-api-access.test.ts` existieren.
- Registry/Katalog: `packages/shared/src/email-actions.ts`, `email-variables.ts` (MC-081-Stand mit `contextVariables`/`recipientKind`).
- Gates: `tsc --noEmit` backend, `pnpm lint`, `pnpm run doctor` (Full-Scan, pre-commit-Gate), `pnpm test:run` mit `DATABASE_URL`.
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).

## Abschluss (nur nach User-OK)

Nicht selbst nach `done/` verschieben. Commit/Push nur auf ausdrückliche Ansage.
