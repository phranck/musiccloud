# Form-System Backend — lmaa-Port Teil 1 (Phase B1) — Implementation Plan

Plan-Nr.: MC-082

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task (TDD), nicht hier vorab. Port-Quelle ist lmaa.space; beim Portieren Datei für Datei lesen, nicht blind kopieren.

**Goal:** Das in lmaa.space produktive Form-System-Backend nach musiccloud portieren: Tabellen, Admin-CRUD-Routen, Feld-Validierung, Submission-Pipeline (store + email-Step über das musiccloud-Template-System) und öffentliche Submit-Route. Danach funktioniert das Anlegen/Verwalten von Formularen im Dashboard (behebt den 404-Bug der FormBuilder-Liste); der Editor selbst folgt in MC-083.

**Architecture:** Contract-Typen wandern nach `@musiccloud/shared` (Backend braucht sie für jsonb-Typisierung + Pipeline). Persistenz nach musiccloud-Muster: DTOs im `AdminRepository`-Interface, Implementierung in einem neuen Postgres-Adapter. Pipeline als eigener Service; `email`-Step rendert via `renderEmailTemplate` (Formularfelder = Variablen) und fällt ohne Template auf eine Plain-HTML-Tabelle zurück. Öffentliche Submit-Route validiert gegen die Felddefinitionen (handgerollt, kein zod — musiccloud-Konvention) und ist rate-limitiert.

**Tech Stack:** Fastify, Drizzle (Postgres), `@musiccloud/shared`, TanStack Query (Dashboard-Hooks), vitest, Biome.

**Port-Quelle (Referenz, nicht Ziel):** `/Users/phranck/Sites/lmaa.space/WebApp` — dort Hono + zod; musiccloud-Äquivalente verwenden.

---

## Design-Entscheidungen

- **Contract nach shared:** `apps/dashboard/src/shared/contracts/form-builder.ts` (identisch mit lmaa `packages/contracts/src/form-builder.ts`, nur ohne TSDoc) zieht nach `packages/shared/src/form-builder.ts` — inkl. der lmaa-TSDoc-Kommentare. `SubmissionStepCreateShopSuggestion` wird NICHT portiert (kein Shop; Union bleibt erweiterbar für spätere Domain-Steps wie `create-api-token-request`). Zusätzlich entfallen `optionsSource`/`FieldOptionsSource` ("categories"/"regions" sind lmaa-Shop-Datenquellen ohne musiccloud-Pendant; grep-verifiziert ohne Konsumenten) und lmaas `check-shop`-ButtonAction. Dashboard-Datei ist Re-Export geworden.
- **DSGVO-ready Schema (Abweichung von lmaa):** `form_submissions` bekommt zusätzlich `submitter_email` (text, nullable, indiziert) und `developer_account_id` (text, nullable, indiziert, FK auf `developer_accounts` mit `on delete set null`) — Grundlage für Export/Erase in Phase D. `submitter_email` wird beim Submit aus dem Feld gezogen, das der `email`-Step als `toFieldId`/`replyToFieldId` referenziert bzw. dem ersten `email`-Feld.
- **Kein zod:** Backend hat kein zod (verifiziert); Validierung handgerollt nach lmaa-Spec (`form-validation.ts`): pro Feld required/min/max/pattern/email-Format/options-Membership/multi-select-Max; unbekannte Keys verwerfen. Nur echte Input-Felder validieren (display-only Typen `richtext`/`headline`/`separator`/`paragraph`/`button` übersprungen).
- **Pipeline:** `executeSubmissionChain(config, data, formMeta)` sequenziell; Step `store` → Insert; Step `email` → `to` fest oder aus `toFieldId`, `replyTo` aus `replyToFieldId`, bei `templateId` Render über `getManagedEmailTemplateById` + `renderEmailTemplate` (Template-Branding + Global-Branding + `PUBLIC_URL`), sonst Plain-Tabelle (HTML-escaped). Step-Fehler propagieren (kein Silent-Skip).
- **Routen** (Fastify, im `adminRoutes`-Block mit `authenticateAdmin`): GET `/api/admin/forms`, POST `/api/admin/forms` (409 name/slug), GET `/api/admin/forms/:name`, PUT `/api/admin/forms/:name` (Payload-Upsert, 409 slug), PATCH `/api/admin/forms/:name` (`{ isActive }` — passend zum bestehenden Dashboard-Hook), DELETE `/api/admin/forms/:name`, POST `/api/admin/forms/import` (Overwrite-Flag, 409). Öffentlich: POST `/api/forms/:slug/submit` (nur aktive Forms, 404 sonst; Rate-Limit per Route-Config analog lmaa 20/h).
- **ENDPOINTS/ROUTE_TEMPLATES** in `packages/shared/src/endpoints.ts` ergänzen (`admin.forms.*`, `forms.submit`); `useFormConfig.ts` stellt von Legacy-Pfaden auf ENDPOINTS um.
- **Kein öffentlicher Form-RENDERER in diesem Plan** (Astro-Island fürs Ausfüllen auf Website/Developer-Portal) — eigener Folge-Plan, wenn das erste echte Formular gebaut wird (YAGNI).

## Task-Checkliste

- [x] **Task 1 — Contract nach shared:** `packages/shared/src/form-builder.ts` (lmaa-Fassung inkl. TSDoc, ohne Shop-Step) + Re-Export in `index.ts`; Dashboard-Importe umstellen (`useFormConfig.ts`, `FormBuilderListPage.tsx`, `shared/contracts/form-builder.ts` + `contracts/index.ts`; `NavManagerPage.tsx`-Treffer prüfen). Shared bauen, Typecheck.
- [x] **Task 2 — Schema + Migration:** `form_configs` (name unique, slug unique nullable, `config` jsonb `FormConfigPayload`, isActive, createdAt/updatedAt) + `form_submissions` (formConfigId FK cascade, `data` jsonb, `submitter_email` nullable idx, `developer_account_id` nullable idx FK set-null, createdAt) in `postgres.ts`; `pnpm db:generate` + lokal `pnpm db:migrate`.
- [x] **Task 3 — Repository-Interface:** `FormConfigDto`/`FormConfigWriteData`/`FormSubmissionInsert` + Methoden (`listFormConfigs`, `getFormConfigByName`, `getActiveFormConfigBySlug`, `createFormConfig`, `saveFormConfigPayload`, `setFormConfigActive`, `deleteFormConfig`, `importFormConfig`, `insertFormSubmission`) in `admin-repository.ts` (Konflikt-Signale name/slug als Result, Muster wie bestehende Email-Template-Methoden).
- [x] **Task 4 — Postgres-Adapter (TDD):** neue Datei `apps/backend/src/db/adapters/postgres-forms.ts` (Muster: `postgres-content-email.ts`); Verdrahtung in `adapters/postgres.ts`; Integrationstests (CRUD, Konflikte, Cascade).
- [x] **Task 5 — Feld-Validierung (TDD):** `apps/backend/src/services/form-validation.ts` handgerollt nach lmaa-Spec; Tests: required, min/max (text vs. number), pattern, email-Format, select/multi-select-Options, unbekannte Keys, display-only übersprungen.
- [x] **Task 6 — Submission-Pipeline (TDD):** `apps/backend/src/services/form-submission.ts` (`executeSubmissionChain`); Tests mit gemocktem `sendEmail`: store-Insert, email mit `toFieldId`-Auflösung, `replyTo`, Template-Render (Formularfelder als Variablen), Plain-Tabellen-Fallback (escaped), Step-Fehler propagiert, `submitter_email`-Ermittlung.
- [x] **Task 7 — ENDPOINTS:** `admin.forms.*` + `forms.submit` in `packages/shared/src/endpoints.ts` (+ `ROUTE_TEMPLATES`); shared bauen.
- [x] **Task 8 — Admin-Routen (TDD):** `apps/backend/src/routes/admin-forms.ts` (7 Endpunkte, Body-Validierung handgerollt, 409-Semantik) + Registrierung in `server.ts` `adminRoutes`-Block (`:663ff`); Route-Tests.
- [x] **Task 9 — Public Submit (TDD):** `apps/backend/src/routes/forms-public.ts` (aktiv-Check, Validierung, Pipeline, Rate-Limit-Route-Config) + Registrierung; Tests inkl. 404 inactive/unknown, 400 invalid, 429-Konfiguration vorhanden.
- [x] **Task 10 — Dashboard-Hooks:** `useFormConfig.ts` auf ENDPOINTS; Anlegen/Löschen/Aktiv-Toggle end-to-end grün (404-Bug behoben); Fehlerpfade 409 name/slug im Dialog wie vorgesehen (`FormBuilderListPage` erwartet `status`/`responseMessage`).
- [x] **Task 11 — Verifikation:** *(Gates grün: lint 924 Files, doctor 0 Issues, Tests backend 1345 / dashboard 61 / shared 83, 3× Typecheck; Live-Smoke: Form via API angelegt → Payload gespeichert → Public Submit → DB-Row mit GDPR-Anker → Validierungs-Issues → Delete cascade. UI-Abnahme (Anlegen im Dashboard): User.)* Typecheck (backend+dashboard+frontend), `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`); Smoke: Form im Dashboard anlegen → per curl Submit gegen aktive Form mit store-Step → Row in `form_submissions`.

## Verifizierte Fakten (2026-07-03)

- Plan-Nr. `MC-082` via `plans next`.
- **musiccloud IST:** `POST /api/admin/forms` → 404 (live geprüft, Port 4000); kein Form-Backend (grep `admin/forms`/`formConfig` in `apps/backend/src` leer); Dashboard-Hooks `apps/dashboard/src/features/templates/hooks/useFormConfig.ts` (GET/POST `/admin/forms`, PATCH+DELETE `/admin/forms/:name`); Contract-Kopie `apps/dashboard/src/shared/contracts/form-builder.ts` (Typnamen identisch zu lmaa, per Diff verifiziert — nur TSDoc fehlt); Editor-Stub `apps/dashboard/src/routes.tsx:63`.
- **lmaa Quelle:** Schema `apps/backend/src/db/schema.ts:571` (`form_configs`), `:589` (`form_submissions`); Admin-Routen `apps/backend/src/routes/admin/form-config.ts` (104 Z., Pfade `/form-configs*`, PUT-Upsert, PATCH `/active`, Import mit 409); Public Submit `apps/backend/src/routes/public.ts:137ff` (`/form/:slug/submit`, `rateLimit({ max: 20, windowMs: 60*60*1000 })`, isActive-Check, zod `safeParse`); Validierung `apps/backend/src/services/form-validation.ts` (zod, `buildFieldSchema:14`); Pipeline `apps/backend/src/services/form-submission.ts` (vollständig gelesen: `executeSubmissionChain:24`, email-Step `:49-64`, `handleEmail:86-118`, Plain-Tabelle `buildPlainTable:76`, Formularfelder→Variablen `:99`); Contract `packages/contracts/src/form-builder.ts` (`SubmissionStepEmail:188` mit `to`/`toFieldId`/`subject`/`replyToFieldId`/`templateId`).
- **musiccloud Bausteine für den Port:** kein zod in `apps/backend/package.json` (grep leer); Rate-Limit-Plugin registriert `server.ts:225`; `adminRoutes`-Block mit `authenticateAdmin` `server.ts:663-679`; Renderer-Signatur `renderEmailTemplate(payload, templateBranding, globalBranding, variables, baseUrl)` (`services/email-actions.ts:91-97`); Template-Lookup `getManagedEmailTemplateById` (`services/email-templates.ts`, Result-Muster mit `.ok`, genutzt in `routes/admin-email-actions.ts:104-108`); `sendEmail` aus `services/email-provider.ts`; Adapter-Muster `apps/backend/src/db/adapters/postgres-content-email.ts`; `developer_accounts` Tabelle `postgres.ts:1510` (FK-Ziel); Migrations-Head `0053_tearful_bloodstorm.sql` in `apps/backend/src/db/migrations/postgres/`.
- Gates: `tsc --noEmit` je App, `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run` (mit `DATABASE_URL`).
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).

## Offene Punkte

- Existenz eines HTML-Escape-Helpers im musiccloud-Backend (lmaa: `lib/html.ts` `escapeHtml`) — bei Task 6 prüfen (grep `escapeHtml`), sonst minimal anlegen.
- Exakte Migrationsnummer ergibt sich beim `db:generate` (Head kann durch MC-081-Seed wandern).

## Abschluss (nur nach User-OK)

Nicht selbst nach `done/` verschieben. Commit/Push nur auf ausdrückliche Ansage.
