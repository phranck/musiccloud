# Auto-Extraktion der Email-Template-Variablen — Implementation Plan

Plan-Nr.: MC-080

> Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task, nicht hier vorab.

**Goal:** Die „Erwarteten Variablen" einer Email-Vorlage werden nicht mehr von Hand gepflegt, sondern automatisch aus Betreff + Body-Blöcken extrahiert (`{{var}}`). Die manuelle `description` je Variable entfällt komplett; der Editor zeigt die erkannten Variablen nur noch als read-only Chips.

**Architecture:** Eine reine Shared-Funktion `extractEmailTemplateVariables(subject, blocks)` wird zur einzigen Quelle der Variablenmenge. Backend-Gates (Bind-Zeit + Sende-Zeit) und Dashboard-Editor konsumieren sie. Der gespeicherte `required_variables`-Zustand (inkl. `EmailTemplateVariable`-Typ und DB-Spalte) wird ersatzlos entfernt.

**Tech Stack:** `@musiccloud/shared`, Fastify, Drizzle (Postgres), React (Dashboard), vitest, Biome.

**User-Entscheidung 2026-07-03:** Beschreibungen ganz weglassen (nur im Editor angezeigt, nirgends sonst); read-only Chips; DB-Spalte droppen.

---

## Verifizierte Fakten (2026-07-03)

- **Plan-Nr.** `MC-080` via `plans next`.
- **Interpolation** `apps/backend/src/services/email-renderer.ts`: `VAR_REGEX = /\{\{(\w+)\}\}/g` (`:21`); `interpolate` wird angewandt auf Text-Block `markdown`, Button-Block `url` und den Betreff (`renderEmailTemplate`), NICHT auf Button-`label`. Footer-Text ist Branding (separat), NICHT Teil der Template-Variablen.
- **`EmailTemplateVariable`** (`{name, description}`) definiert in `apps/backend/src/db/admin-repository.ts:122` und (dashboard-lokal) `apps/dashboard/src/shared/contracts/admin-email-templates.ts:12`. Nur email-template-bezogen genutzt.
- **`requiredVariables`-Konsumenten** (grep-verifiziert, ausserhalb Tests):
  - Backend Typen: `admin-repository.ts:158,171` (`EmailTemplateRow`/`EmailTemplateWriteData`).
  - Schema: `postgres.ts:971` `requiredVariables: jsonb("required_variables").notNull().default([])`.
  - Adapter `postgres-content-email.ts`: SqlRow-Mapping `:105`, insert `:204`, update columnMap `:240` + jsonbColumns `:243`.
  - Routen `admin-email-templates.ts`: `validateRequiredVariables` (`:101-115`), create-Body `:131-137`, update-Body `:169-172`; Interface `EmailTemplateCreateBody.requiredVariables` `:25`.
  - **Bind-Zeit-Gate** `admin-email-actions.ts:118`: `template.requiredVariables.find((rv) => !meta.variables.includes(rv.name))`.
  - **Sende-Zeit-Gate** `email-actions.ts:81`: `template.requiredVariables.find((rv) => !(rv.name in input.variables))`.
  - Service `email-templates.ts:18,32` (`EmailTemplate`-DTO + `rowToEmailTemplate`).
  - Dashboard `EmailTemplateEditPage.tsx`: `TemplateFormFields.requiredVariables` (`:50`), Form-State (`:89,116,126`), `RequiredVariablesEditor`-Komponente (`:376-462` inkl. Add/Remove-Row-Logik), Grid-Einhängung (`:392-398`); `Sidebar.tsx:479` (Duplizieren-Payload); Contract `admin-email-templates.ts:51`.
  - EmailActionsPage.tsx: nur ein Kommentar (`:288`), keine Anzeige der `description`.
  - i18n `messages.ts`: `requiredVariablesTitle` (`:648,1398,2149`), `requiredVariableName` (`:649,1399,2150`), `requiredVariableDescription` (`:650,1400,2151`), `addRequiredVariable` (Interface + de/en).
- **Action-Registry** `packages/shared/src/email-actions.ts`: `EmailActionMeta.variables: string[]` (nur Namen). Aktuell eine Action `adminInviteSent` (username/email/role/inviteUrl/loginUrl).
- **Migration:** höchste `0052_minor_miek.sql`; nächste generierte `0053`. `pnpm db:generate` + lokal `pnpm db:migrate` (DATABASE_URL aus `apps/backend/.env.local`).
- **Tests:** `email-actions.test.ts` — `makeTemplateRow` setzt `requiredVariables` + Test „throws when a bound template requires a variable the action did not supply" (`:174-191`) hängt an `requiredVariables`; muss auf body-getriebene Extraktion umgestellt werden. Bind-Gate hat evtl. keinen eigenen Route-Test.
- **Gates:** `tsc --noEmit` (backend+dashboard+frontend), `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`).
- [x] Alle Referenzen verifiziert vor Task-Start.

---

## Task-Checkliste

- [x] **Task 1 — Shared Extractor (TDD):** `extractEmailTemplateVariables(subject: string, blocks: EmailBlock[]): string[]` (dedupliziert, first-seen-Reihenfolge; scannt Betreff + Text-`markdown` + Button-`url` via `\{\{(\w+)\}\}`). In `@musiccloud/shared` (neue Datei `email-variables.ts` + Re-Export) + Test. Shared bauen.
- [x] **Task 2 — Sende-Zeit-Gate** (`email-actions.ts`): Variablenmenge via `extractEmailTemplateVariables(template.subject, template.blocks)` statt `template.requiredVariables`; fehlende gegen `input.variables` prüfen. Doku aktualisieren.
- [x] **Task 3 — Bind-Zeit-Gate** (`admin-email-actions.ts`): Kompatibilität via `extractEmailTemplateVariables(...)` gegen `meta.variables`. Doku aktualisieren.
- [x] **Task 4 — Backend-Typen/Adapter/Schema:** `EmailTemplateVariable` + `requiredVariables` aus `admin-repository.ts` (Row/WriteData), `email-templates.ts` (DTO+Mapper), Adapter (SqlRow/Mapper/insert/update) entfernen; `required_variables`-Spalte aus `postgres.ts` entfernen → Migration `0053` (DROP COLUMN) generieren + lokal anwenden.
- [x] **Task 5 — Route `admin-email-templates.ts`:** `validateRequiredVariables` + `requiredVariables` aus Create/Update-Body + Interface entfernen.
- [x] **Task 6 — Backend-Tests:** `email-actions.test.ts` `makeTemplateRow` (kein `requiredVariables` mehr) + „missing variable"-Test body-getrieben (Template-Body referenziert eine nicht gelieferte `{{var}}`); ggf. weitere.
- [x] **Task 7 — Dashboard Contract/Hooks:** `EmailTemplateVariable`/`requiredVariables` aus `contracts/admin-email-templates.ts` (+ `EmailTemplate`/`EmailTemplateInput`) und Hook-Typen entfernen.
- [x] **Task 8 — Dashboard Editor:** `RequiredVariablesEditor` entfernen; stattdessen read-only Chips der erkannten Variablen (live aus `extractEmailTemplateVariables(subject, blocks)`), inkl. Leer-Zustand-Hinweis. `TemplateFormFields`/Payload/Sidebar-Duplizieren-Payload bereinigen.
- [x] **Task 9 — i18n:** `requiredVariablesTitle` behalten (Titel), Hinweis-Key ergänzen (z.B. „automatisch aus dem Template erkannt"); `requiredVariableName`/`requiredVariableDescription`/`addRequiredVariable` (Interface + de + en) entfernen.
- [x] **Task 10 — Verifikation:** Typecheck (backend+dashboard+frontend), `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`) grün; Dashboard-Smoke (Editor zeigt erkannte Variablen live, keine Add/Remove-Zeilen mehr).

## Abschluss (nur nach User-OK)

Nicht selbst nach `done/` verschieben. Commit/Push nur auf ausdrückliche Ansage.
