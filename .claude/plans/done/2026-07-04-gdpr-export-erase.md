# DSGVO Export & Erase (Phase D) — Implementation Plan

Plan-Nr.: MC-085

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task (TDD), nicht hier vorab.

**Goal:** Personenbezogene Daten sind auf Wunsch des Betroffenen als Paket lieferbar (Art. 15/20: Selbstauskunft/Datenübertragbarkeit) und löschbar (Art. 17). Konkret: (1) Self-Service-Export im Developer-Portal (eigene Daten als JSON-Download), (2) der bestehende Danger-Zone-Lösch-Flow wird DSGVO-komplett (Formular-Submissions werden anonymisiert), (3) Admin-Werkzeuge für Subjekte OHNE Account (Kontaktformular-Submitter): Export + Erase per E-Mail-Adresse.

**Architecture:** Ein Export-Service sammelt pro Datendomäne (Account+Identities, API-Access, Form-Submissions) und baut ein versioniertes JSON-Paket. Erase komplettiert die vorhandene DB-Kaskade (`DELETE developer_accounts` räumt Identities/Email-Tokens/Requests/Clients via `ON DELETE CASCADE`; `form_submissions.developer_account_id` ist `SET NULL`) um die Anonymisierung von `submitter_email`. Subjekt-Begriff: `{ developerAccountId?, email }` — deckt Account-Inhaber UND accountlose Submitter.

**Tech Stack:** Fastify, Drizzle/pg (Adapter-Funktionen), `@musiccloud/shared` (ENDPOINTS), vitest.

**Bewusst ausgeklammert (v2):** Retention-Jobs (Auto-Löschung alter Kontaktform-Submissions) und ein Send-Log-Provider (es existiert kein Mail-Send-Log). `api_access_audit_events` behalten (Actor-FKs sind `SET NULL`, nach Erase keine Personenzuordnung mehr).

---

## Design-Entscheidungen

- **Subjekt:** `PersonalDataSubject = { developerAccountId?: string; email: string }`. Submissions matchen auf `developer_account_id = $accountId OR submitter_email = $email` (case-insensitive lower()).
- **Export-Paket** (`buildPersonalDataExport`): `{ version: 1, exportedAt, subject, account?, identities?, apiAccess?: { requests, clients: [{...client, tokens: Metadaten-ohne-Hash}] }, formSubmissions }`. Für accountlose Subjekte bleiben die Account-Sektionen weg.
- **Erase-Semantik:**
  - Self-Service (Danger Zone): `delete-account`-Route ruft VOR `deleteDeveloperAccount` zusätzlich `anonymizeFormSubmissionsBySubject` (Account-ID + Account-Email) — Submissions bleiben fachlich erhalten, verlieren aber jeden Personenbezug (`submitter_email = NULL`; `developer_account_id` nullt die Kaskade).
  - Admin-Erase (per E-Mail, für accountlose Subjekte): anonymisiert NUR Submissions. Existiert zu der Adresse ein Developer-Account, antwortet die Route mit `409 ACCOUNT_EXISTS` — Account-Löschung bleibt bewusst dem Inhaber (Danger Zone) vorbehalten, der Admin löscht keine Accounts über einen Seiten-Kanal.
- **Neue Repo-Methoden:** `listFormSubmissionsBySubject`, `anonymizeFormSubmissionsBySubject` (postgres-forms), `listDeveloperIdentitiesByAccount` (postgres-developer; Identities gehören in die Auskunft — Read fehlt bisher). Interface-Einträge in `AdminRepository` bzw. `DeveloperRepository`.
- **Routen:** Self-Service `GET /api/dev/auth/export` (Session-Cookie, `Content-Disposition: attachment`); Admin `GET /api/admin/gdpr/export?email=` + `POST /api/admin/gdpr/erase` `{ email }` (owner/admin). ENDPOINTS ergänzen.
- **Token-Metadaten im Export:** via `listApiClientTokensByClient` — nie Hashes, nur Prefix/Status/Zeiten (DTO enthält keinen Hash).

## Task-Checkliste

- [x] **Task 1 — Repo-Methoden (TDD, Integration):** `listFormSubmissionsBySubject` + `anonymizeFormSubmissionsBySubject` in `postgres-forms.ts` (+ `AdminRepository`-Interface + `adapters/postgres.ts`-Wiring); `listDeveloperIdentitiesByAccount` in `postgres-developer.ts` (+ `DeveloperRepository` + Wiring); Integrationstests in `postgres-forms.integration.test.ts` (Subjekt-Match accountId ODER email, Anonymisierung nullt nur `submitter_email`).
- [x] **Task 2 — Export-Service (TDD):** `services/gdpr-export.ts` `buildPersonalDataExport(subject)` mit gemockten Repos; Fälle: Account-Subjekt (alle Sektionen, Tokens ohne Hash), accountloses Subjekt (nur Submissions), leere Domänen.
- [x] **Task 3 — Erase-Service (TDD):** `services/gdpr-erase.ts` `erasePersonalData(subject)` (anonymize + optional account delete für Self-Service-Pfad); `delete-account`-Route nutzt ihn (Route-Test: Submissions-Anonymisierung wird mit Account-ID + Email aufgerufen, Löschung weiterhin ok).
- [x] **Task 4 — Self-Service-Export-Route (TDD):** `GET /api/dev/auth/export` in `developer-auth.ts` (authentifiziert, attachment-Header, Dateiname `musiccloud-data-export.json`); ENDPOINT `dev.auth.export`; Route-Tests.
- [x] **Task 5 — Admin-GDPR-Routen (TDD):** *(inkl. Extraktion getAdminCaller/requireOwnerOrAdmin nach lib/admin-caller.ts, admin-api-access nutzt sie jetzt auch)* neue Datei `routes/admin-gdpr.ts` (Export by email, Erase by email mit `409 ACCOUNT_EXISTS`-Guard), Registrierung im `adminRoutes`-Block, ENDPOINTS `admin.gdpr.*`; Route-Tests.
- [x] **Task 6 — Verifikation:** *(Gates grün 2026-07-04: backend tsc EXIT 0, lint 948 Files, doctor Full-Scan 0 Issues, Backend-Suite 1370/1370; Live-Smoke: Submission → Admin-Export enthält sie (case-insensitive Match) → Erase anonymisiert 1 → Export leer, submitter_email NULL, Daten erhalten)* Typecheck backend, `pnpm lint`, `pnpm run doctor`, Backend-Suite grün; Live-Smoke: Test-Submission anlegen → Admin-Export per email enthält sie → Admin-Erase → Export leer + `submitter_email` genullt.

## Verifizierte Fakten (2026-07-04)

- Plan-Nr. `MC-085` via `plans next`.
- Lösch-Kaskade: `deleteDeveloperAccount` = `DELETE FROM developer_accounts` (`postgres-developer.ts:280`); FKs `onDelete: cascade` für `developer_identities:1602`, `developer_email_tokens:1630`, `api_access_requests:1659`, `api_clients:1695`; `api_access_audit_events` Actor-FKs `SET NULL` (`:1768ff`); `form_submissions.developer_account_id` `SET NULL` (MC-082, `postgres.ts:1094`).
- `form_submissions` hat `submitter_email` (nullable, idx) — bleibt bei Account-Löschung heute stehen (die Erase-Lücke).
- Reads vorhanden: `findDeveloperAccountById` (`developer-repository.ts:128`), `findDeveloperAccountByEmail` (developer-auth nutzt es), `listApiAccessRequestsByDeveloperAccount` (`api-access-repository.ts:144`), `listApiClientsByDeveloperAccount` (`:176`), `listApiClientTokensByClient` (`:196`, DTO ohne Hash); FEHLEND: Identities-List, Submissions-by-Subject.
- Routen-Muster: `developer-auth.ts` (Session-Cookie, `app.authenticateDeveloper`), `adminRoutes`-Block `server.ts:663ff`; Test-Muster: `developer-auth.test.ts` (Cookie-Session), `admin-api-access.test.ts` (Bearer + Repo-Mocks).
- ENDPOINTS-Registry: `packages/shared/src/endpoints.ts` (`dev.auth.*`, `admin.*`).
- Gates: `tsc --noEmit` backend, `pnpm lint`, `pnpm run doctor`, `pnpm test:run` mit `DATABASE_URL`.
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).

## Abgeschlossen (2026-07-04)

Checkliste 100 %, alle Deliverables gegen den aktuellen Code verifiziert (`services/gdpr-export.ts`, `services/gdpr-erase.ts`, `routes/admin-gdpr.ts`, Self-Service-Export + Erase-Integration), Gates grün, in Produktion. Nach `done/` verschoben auf ausdrückliche User-Ansage vom 2026-07-04.
