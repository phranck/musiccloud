# E-Mail-Provider-Abstraktion (Brevo → SMTP2GO) Implementation Plan

Plan-Nr.: MC-063

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development oder superpowers:executing-plans. Steps nutzen `- [ ]`-Checkboxen.

**Goal:** Den transaktionalen E-Mail-Versand von Brevo auf SMTP2GO umstellen, hinter einer schlanken Provider-Abstraktion, ohne die Signatur oder das Verhalten von `sendTemplatedEmail` zu ändern.

**Architecture:** Neue `email-provider.ts` kapselt den reinen HTTP-Versand (sender, to, subject, html). `email-sender.ts` rendert weiter über das Managed-Template-System und ruft nur noch den Provider — Brevo-Code entfällt. Die beiden Konsumenten (`admin-users.ts`, `admin-email-templates.ts`) bleiben unverändert.

**Tech Stack:** Fastify-Backend, SMTP2GO `/v3/email/send` (EU-Endpoint), vitest.

**Verwandt:** [Developer-Site-Spec](../../../docs/superpowers/specs/2026-06-26-developer-site-design.md), Memory `email-smtp2go`.

---

## Verifizierte Fakten (2026-06-27)

- **SMTP2GO Send-API** (Doku verifiziert): `POST https://eu-api.smtp2go.com/v3/email/send` (EU-Datenresidenz Amsterdam). Auth-Header `X-Smtp2go-Api-Key`. Body: `{ sender: "Name <email>", to: ["Name <email>"], subject, html_body, text_body }` — `to` ist ein **String-Array**, nicht Objekte. Erfolg: HTTP 200 **und** `data.succeeded >= 1` und `data.failed === 0` (200 kann Teilfehler mit `failures[]` enthalten). Fehler: `data.error_code` / `data.error`.
- **Ist-Zustand** `apps/backend/src/services/email-sender.ts`: `sendTemplatedEmail({ templateId, to:{email,name?}, variables })` → `getManagedEmailTemplateById` + `renderEmailTemplate(... baseUrl)` → liefert `{ html, subject }` → Brevo-`fetch` (`https://api.brevo.com/v3/smtp/email`, Header `api-key`, body `{ sender:{email,name}, to:[{email,name}], subject, htmlContent }`), Erfolg nur via `response.ok`. Env: `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `PUBLIC_URL`. Hilfen: `requireEnv` aus `lib/env.js`.
- **Konsumenten** (unverändert lassen): `apps/backend/src/routes/admin-users.ts` (Invite-Mail), `apps/backend/src/routes/admin-email-templates.ts` (Test-Send). Beide rufen `sendTemplatedEmail({ templateId, to, variables })`.
- **Env**: `SMTP2GO_API_KEY` liegt in `apps/backend/.env.local` und in der Zerops-Prod-Env (Backend). `zerops.yml:48` hat noch den `BREVO_API_KEY`-Kommentar.
- [x] Alle Refs vor dem ersten Edit erneut grep-verifiziert.

## Task 1: SMTP2GO-Provider

**Files:** Create `apps/backend/src/services/email-provider.ts`, Test `apps/backend/src/services/email-provider.test.ts`

- [x] **Provider implementieren** — `EmailMessage`-Interface (`to:{email,name?}`, `subject`, `html`, `text?`) und `sendEmail(message)`:
  - Env: `SMTP2GO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` via `requireEnv`.
  - `sender = \`${fromName} <${fromEmail}>\``; `to = [ message.to.name ? \`${name} <${email}>\` : email ]`.
  - `POST https://eu-api.smtp2go.com/v3/email/send`, Header `X-Smtp2go-Api-Key` + `Content-Type: application/json` + `Accept: application/json`, body `{ sender, to, subject, html_body, ...(text? { text_body }) }`.
  - Robuste Erfolgsprüfung: `!response.ok` → throw mit Status + Body; sonst JSON parsen und bei `data.succeeded < 1 || data.failed > 0` throw mit `data` (inkl. `failures`/`error`).
  - TSDoc auf Interface + Funktion.
- [x] **Unit-Test** (`vitest`, fetch gemockt): verifiziert URL, `X-Smtp2go-Api-Key`-Header, body-Form (`sender`, `to` als String-Array, `subject`, `html_body`); Erfolg bei `data.succeeded:1`; Throw bei `response.ok:false`; Throw bei `200` mit `data.failed:1`.

## Task 2: email-sender.ts auf Provider umstellen

**Files:** Modify `apps/backend/src/services/email-sender.ts`

- [x] Brevo-`fetch`-Block + `BREVO_ENDPOINT` entfernen. `sendTemplatedEmail` rendert weiter (`getManagedEmailTemplateById` + `renderEmailTemplate`), ruft dann `await sendEmail({ to: input.to, subject, html })` aus `email-provider.js`. Signatur `SendTemplatedEmailInput` + Funktionsname unverändert. `requireEnv("BREVO_API_KEY")` entfällt (wandert in den Provider als `SMTP2GO_API_KEY`).

## Task 3: Env-/Config-Aufräumen

**Files:** Modify `zerops.yml`

- [x] `zerops.yml`: den `BREVO_API_KEY`-Kommentar durch `SMTP2GO_API_KEY: <from SMTP2GO -> Settings -> API Keys (send permission)>` ersetzen. (EMAIL_FROM_ADDRESS/NAME bleiben.)

## Tests und Gates

- `pnpm --filter @musiccloud/backend test:run` (neuer Provider-Test grün, bestehende Tests unberührt)
- `pnpm --filter @musiccloud/backend typecheck`
- `pnpm lint`
- grep: kein `brevo`/`BREVO` mehr in `apps/backend/src` (außer ggf. Doku).

## Checkliste

- [x] Task 1: `email-provider.ts` + Unit-Test grün
- [x] Task 2: `email-sender.ts` auf Provider umgestellt, Brevo-Code raus, Signatur unverändert
- [x] Task 3: `zerops.yml`-Kommentar SMTP2GO
- [x] Gates grün (test, typecheck, lint); kein Brevo-Rest im Backend-Code
- [x] Plan nach `done/`, gemergt
