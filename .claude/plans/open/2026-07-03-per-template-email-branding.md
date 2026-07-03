# Per-Template Email-Branding + Tag/Nacht-Himmel-Hintergrund — Implementation Plan

Plan-Nr.: MC-079

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Der volle Design-Code liegt im Spec: [2026-07-02-per-template-email-branding-design.md](../../../docs/superpowers/specs/2026-07-02-per-template-email-branding-design.md). Diese Plan-Datei ist bewusst schlank — sie listet die verifizierten Fakten und die Task-Reihenfolge, nicht den kompletten Ziel-Code (der steht im Spec bzw. wird beim Umsetzen geschrieben).

**Goal:** Branding (Header-Bild, Footer-Bild, Footer-Text) wird pro Email-Vorlage überschreibbar (globale Branding-Seite bleibt Default-Vorbelegung), plus ein neuer Tag/Nacht-Himmel-Hintergrund (Gradient immer + optional Bild) für jede Vorlage und den globalen Default. Shared-Assets-Picker (Bild-Wiederverwendung ohne Re-Upload) und Gradient-Vorauswahl-Swatches.

**Architecture:** Additive, nullable Spalten auf `email_templates` (9) und `email_branding` (6, davon 4 Gradient NOT NULL mit Shader-Default-Farben). Reine Merge-Funktion `resolveBranding(overrides, global)` im Renderer, aufgerufen auf Send- UND Preview-Pfad, damit Versand und Vorschau nie divergieren. Hintergrund auf der äußeren `<td>`-Zelle (`.em-page-bg`), Dark-Mode per `@media` (Send) bzw. erzwungenem Basis-Style (Preview). Dashboard: wiederverwendbarer `AssetPicker` + `GradientColorFields`, aufklappbarer Branding-Bereich im Vorlagen-Editor mit Pro-Feld-Override-Toggle.

**Tech Stack:** Fastify, Drizzle (Postgres), `@musiccloud/shared`, React + TanStack Query (Dashboard), vitest, Biome, react-doctor. Migration via `pnpm db:generate` + `pnpm db:migrate`.

**Revidiert:** MC-078s „Branding ist rein global"-Entscheidung wird gezielt zu einem Override-Modell erweitert. Phase 2 aus MC-078 (Developer-Portal-Auth-Mails) bleibt unberührt.

---

## Verifizierte Fakten (2026-07-03)

Alle Referenzen per direktem Read/Grep gegen den aktuellen Code (HEAD `84aee806`, working tree clean) verifiziert.

- **Plan-Nr.** `MC-079` via `~/.local/bin/plans next` (2× geprüft, stabil).
- **Schema** `apps/backend/src/db/schemas/postgres.ts`: `emailTemplates` (`:957-966`, hat id/name/subject/isSystemTemplate/createdAt/updatedAt/blocks/requiredVariables — KEINE Branding-Spalten), `emailBranding` (`:976-982`, headerAssetId/footerAssetId/footerText/updatedAt), `emailAssets` (`:992-997`, id/mimeType/bytes/createdAt), `emailActionBindings` (`:1007-1022`). FK-Referenzen bereits als `text(...).references(() => emailAssets.id, { onDelete: "set null" })` etabliert.
- **Shader-Defaults** `apps/frontend/src/components/background/nightSky/settings.ts:162-167` (exakt): `skyTop="#0b1318"`, `skyBottom="#10273b"`, `skyTopDay="#0076d5"`, `skyBottomDay="#69d1fd"`, `cloudColor="#2c3b47"`, `cloudColorDay="#e6edf3"`. Sternfarben aus Spec: `rgb(0.72,0.82,1.00)`, `rgb(0.95,0.97,1.00)`, `rgb(1.00,0.86,0.68)`; `vignette: 0.1`.
- **Repository-Typen** `apps/backend/src/db/admin-repository.ts`: `EmailTemplateRow` (`:128-137`), `EmailTemplateWriteData` (`:140-146`), `EmailBrandingDto` (`:149-153`, aktuell nur 3 Felder), `EmailAssetDto` (`:156-160`). `AdminRepository`-Interface (`:335-915`) hat `getEmailBranding`/`updateEmailBranding`/`insertEmailAsset`/`getEmailAssetBytes` — KEIN `listEmailAssets`.
- **Adapter** `apps/backend/src/db/adapters/postgres-content-email.ts` (420 Zeilen, komplett gelesen): `EmailTemplateSqlRow`/`rowToEmailTemplate` (`:34-66`), SELECT-Listen (`:79/95/113`), `insertEmailTemplate` (`:133`), `updateEmailTemplate` mit present-keys-only columnMap+jsonbColumns (`:163-214`), `getEmailBranding` (`:241-247`), `updateEmailBranding` present-keys-only (`:263-295`), `insertEmailAsset` (`:308`), `getEmailAssetBytes` (`:325`).
- **Adapter-Verdrahtung** `apps/backend/src/db/adapters/postgres.ts:172-186` (Import-Aliase), `:801-854` (Delegations-Methoden in `PostgresAdapter`).
- **Renderer** `apps/backend/src/services/email-renderer.ts` (287 Zeilen, komplett gelesen): `DARK_RULES` (`:27-37`), `DARK_MODE_CSS` (`:39`), `buildBlockRows(blocks, branding, variables, baseUrl)` (`:135`), `buildEmailHtml(rows, css)` (`:185`, äußere `<td align="center" style="padding:40px 16px;">` bei `:204`), `renderBlocks` (`:229`), `renderEmailTemplate` (`:248`), `renderEmailPreview(blocks, branding, colorScheme)` (`:280`), `assetUrl(assetId, baseUrl|null)` (`:113`).
- **Renderer-Aufrufer:** `apps/backend/src/services/email-actions.ts:69,88` (`repo.getEmailBranding()` + `renderEmailTemplate`), `apps/backend/src/services/email-sender.ts:35,37` (`getManagedEmailBranding()` + `renderEmailTemplate`, nutzt Service-DTO `EmailTemplate` aus `email-templates.ts` — braucht `.branding`).
- **Service** `apps/backend/src/services/email-templates.ts`: `EmailTemplate`-Interface (`:12-21`, KEIN branding), `rowToEmailTemplate` (`:23-34`), `getManagedEmailBranding`/`updateManagedEmailBranding` (`:100-114`), `createManagedEmailAsset`/`getManagedEmailAssetBytes` (`:122-136`).
- **Routen:** `admin-email-templates.ts` (275 Z., Preview-Handler `:205-213` liest global branding + `renderEmailPreview`; Validatoren `validateCreateBody`/`validateUpdateBody`/`validatePreviewBody`), `admin-email-branding.ts` (61 Z., `EmailBrandingUpdateBody`+`validateUpdateBody` mit 3-Feld-Whitelist `:37`), `admin-email-assets.ts` (57 Z., nur POST-Upload), `email-assets.ts` (Root-Scope public GET `:id`). Registrierung `server.ts:670-672` (admin) + `:631` (public serve).
- **Endpoints** `packages/shared/src/endpoints.ts`: `admin.emailAssets` (`:274-279`, hat `upload`+`detail`, KEIN `list`), `admin.emailTemplates` (`:259-272`), `admin.emailBranding.base` (`:280-283`), `ROUTE_TEMPLATES.admin.emailAssets.detail` (`:484`).
- **Email-Blocks** `packages/shared/src/email-blocks.ts` (`EmailBlockType`, `EmailBlock`, `isEmailBlockArray`).
- **Dashboard-Contract** `apps/dashboard/src/shared/contracts/admin-email-templates.ts` (`EmailTemplate`+`EmailTemplateInput`, KEIN branding). **Hooks** `apps/dashboard/src/features/templates/hooks/`: `useEmailTemplates.ts`, `useEmailBranding.ts` (`EmailBranding` 3-Feld-Interface `:11-18`), `useEmailAssets.ts` (nur `useUploadEmailAsset`, kein List-Query). **Seiten** `email-templates/`: `EmailBrandingPage.tsx` (245 Z., `BrandingImageSlot` `:183`, `EMPTY_DRAFT` `:29`, isDirty `:73`, handleSave `:83`), `EmailTemplateEditPage.tsx` (462 Z., `TemplateFormFields` `:42`, `EmailTemplateEditorGrid` `:318`), `EmailPreview.tsx` (68 Z., POST-Body `{ blocks, colorScheme }` `:39`), `BlockEditor.tsx`.
- **UI-Bausteine:** `DashboardSection` (`components/ui/DashboardSection.tsx`, `expanded`-Prop macht collapsible), `Dialog` (`shared/ui/Dialog.tsx`, portal via OverlayCard, `Dialog.Footer`), `SegmentSwitch` (`components/ui/SegmentSwitch.tsx`), `DashboardInput` (`@musiccloud/dashboard-ui`, akzeptiert alle `<input>`-Props inkl. `type="color"`), `useUploadEmailAsset`, `api` (`lib/api.ts` get/post/put/delete). **Icons** ausschließlich `@phosphor-icons/react`.
- **i18n** `apps/dashboard/src/i18n/messages.ts`: Interface-Block `emailTemplates` (`:615-675`), de-Werte (`:1347-1409`), en-Werte (`:2079-2141`). Bestehende Keys `brandingHeaderImage`/`brandingFooterImage`/`brandingImageHint`/`brandingFooterText`/`imageUpload` etc.
- **Migrationen:** höchste `0051_cuddly_dragon_lord.sql`, Journal endet bei `idx: 51`. Nächste generierte `0052`. Config `drizzle.config.postgres.ts` (out → `apps/backend/src/db/migrations/postgres`). `pnpm db:generate` (root, braucht `DATABASE_URL`), `pnpm db:migrate` (`scripts/migrate.mjs`). Lokale DB via `apps/backend/.env.local` (`DATABASE_URL=postgresql://mu...`). Dual-Tracker-Memory beachten: `drizzle.__drizzle_migrations`.
- **Tests:** backend vitest (`apps/backend/vitest.config.ts`, node-env). `email-renderer.test.ts` (3-Feld-branding-Fixtures — brechen bei Signaturänderung), `email-actions.test.ts` (`BRANDING`+`makeTemplateRow`-Fixtures — brechen bei neuem Pflichtfeld). Integrationstest-Konvention `describe.skipIf(!process.env.DATABASE_URL)` (`postgres-cc.integration.test.ts`), eigener Pool aus `process.env.DATABASE_URL`. Backend-Tests: `pnpm --filter @musiccloud/backend test:run`.
- **Tools lokal vorhanden:** `rsvg-convert`, `pngquant`, `magick` (für Task 19 Grafik-Generierung).
- **Gates** (Memory `feedback_pre_push_gates`): `tsc --noEmit` (backend+dashboard), `pnpm lint` (Biome), `pnpm doctor:diff`, `pnpm test:run`. Nach `.ts/.tsx`-Edits sofort `biome check --write` (Memory `feedback_biome_proactive`).
- [x] Alle Code-Referenzen verifiziert (functions, scripts, paths, env vars, package-manager commands) — 2026-07-03 vor Task-Start.

---

## Task-Checkliste

Reihenfolge = Abhängigkeitsreihenfolge (Backend-Datenschicht → Renderer → Routen → Dashboard → Assets → Verifikation). Detail-Code je Task siehe Design-Spec-Sektionen.

- [x] **Task 1 — DB-Schema + Migration:** `emailTemplates` 9 neue nullable Spalten (headerAssetId, footerAssetId, footerText, lightBackgroundAssetId, darkBackgroundAssetId, lightGradientTop/Bottom, darkGradientTop/Bottom); `emailBranding` 6 neue (2 nullable Asset-IDs + 4 NOT NULL Gradient mit Shader-Default-Farben). `pnpm db:generate` → `0052_minor_miek.sql` (15 ADD COLUMN + 6 FK, keine Drift). Lokal `pnpm db:migrate` angewandt + verifiziert: 9 nullable Template-Spalten, 4 Branding-Gradient-Spalten NOT NULL mit Shader-Defaults, Singleton-Zeile backfilled.
- [x] **Task 2 — Repository-Typen** (`admin-repository.ts`): `EmailTemplateBrandingOverrides` (9 required-nullable Felder); `EmailTemplateRow.branding`; `EmailTemplateWriteData.branding?: Partial<...>`; `EmailBrandingDto` +6 Felder (2 nullable, 4 non-null string); `AdminRepository.listEmailAssets(): Promise<EmailAssetDto[]>`.
- [x] **Task 3 — Hex-Color-Validator** (`lib/color.ts`, TDD): `isHexColor()` + Test (inkl. Injection-Regression `#fff;}</style>`). Rot → grün.
- [x] **Task 4 — Adapter** (`postgres-content-email.ts`): SqlRow+Mapper+SELECTs+insert+update um branding-Overrides (present-keys-only, verschachtelt aus `data.branding`); `getEmailBranding`/`updateEmailBranding` +6 Spalten; neue `listEmailAssets(pool)`.
- [x] **Task 5 — listEmailAssets verdrahten** (`adapters/postgres.ts`): Import-Alias + Delegations-Methode in `PostgresAdapter`.
- [x] **Task 6 — Renderer** (`email-renderer.ts`, TDD): `ResolvedBranding`+`resolveBranding(overrides: Partial<EmailTemplateBrandingOverrides>, global)`; Hintergrund-Style-Builder (Basis + Dark-`@media`); `buildBlockRows`/`buildEmailHtml`/`renderBlocks`/`renderEmailTemplate`/`renderEmailPreview` neue Signaturen; `email-renderer.test.ts` erweitern + bestehende Fixtures auf `ResolvedBranding` heben.
- [x] **Task 7 — Renderer-Aufrufer + Tests** : `email-templates.ts` (`EmailTemplate.branding` + `rowToEmailTemplate` + `listManagedEmailAssets`), `email-sender.ts` + `email-actions.ts` (`resolveBranding(template.branding, global)`); `email-actions.test.ts`-Fixtures ergänzen.
- [x] **Task 8 — Route email-branding** (`admin-email-branding.ts`): Body+Validator +6 Felder (Asset-IDs string|null, Gradient hex-validiert via `isHexColor`).
- [x] **Task 9 — Route email-templates** (`admin-email-templates.ts`): `validateBrandingOverrides`-Helper; Create/Update-Body +branding; Preview-Body+Handler +branding-Override (`renderEmailPreview` neue Signatur).
- [x] **Task 10 — Assets-Liste + Endpoint** : `endpoints.ts` `emailAssets.list` (GET, gleicher Pfad wie upload); `admin-email-assets.ts` GET-Handler (`listEmailAssets` → `EmailAssetDto[]`); Dashboard-Hook-Usage nachziehen.
- [x] **Task 11 — Integrationstest present-keys-only** (`postgres-content-email.integration.test.ts`, `skipIf(!DATABASE_URL)`): insert/update branding-Present-Keys (weggelassen=unverändert, `null`=Override gelöscht).
- [x] **Task 12 — Dashboard-Hooks/Contracts** : Contract `EmailTemplateBranding`-Type + `EmailTemplate.branding` + `EmailTemplateInput`; `useEmailBranding` +6 Felder; `useEmailAssets` (`EmailAsset`-Type + `useEmailAssets()`-Query + Endpoint-Rename + Invalidierung nach Upload).
- [x] **Task 13 — AssetPicker** : `AssetPicker.tsx` (Dialog-Galerie bestehender Assets + „Neu hochladen") + `AssetPickerField.tsx` (gelabeltes Feld). Wiederverwendet von Branding-Seite + Template-Editor. TSDoc.
- [x] **Task 14 — GradientColorFields** : `gradientSwatches.ts` (dedupliziert `(top,bottom)`-Paare aus Vorlagen+global) + `GradientColorFields.tsx` (Top/Bottom-Farbwähler + Vorschau-Swatches). TSDoc.
- [x] **Task 15 — i18n** : neue Keys (Interface + de + en) für Tag/Nacht-Hintergrund, AssetPicker, Override-Toggle; `brandingDescription` korrigieren.
- [x] **Task 16 — EmailBrandingPage** : `BrandingImageSlot` → `AssetPickerField`; Tag-/Nacht-Hintergrund-Editoren; Draft/isDirty/handleSave erweitern.
- [x] **Task 17 — TemplateBrandingSection** (neu): aufklappbarer Bereich, Pro-Feld-Override-Toggle („Default" vs „eigener Override" + zurücksetzen auf `null`), 5 Gruppen.
- [x] **Task 18 — EditPage + Preview verdrahten** : `TemplateFormFields.branding`, Section einhängen, Payload, `EmailPreview` +branding-Prop (Preview-POST-Body).
- [x] **Task 19 — Grafiken** : Ursprünglich handgezeichnete SVGs (rsvg-convert) verworfen — User-Korrektur: „genauso wie im WebGL". Stattdessen echte Canvas-Pixel des laufenden `nightSky`-Shaders per `canvas.toDataURL('image/png')` gegriffen (Frontend-Dev-Server, `DayNightSwitcher`-Modus über `localStorage['mc.background.dayNightMode']` erzwungen, Foreground-UI temporär ausgeblendet). `mockups/email-sky-{day,night}.png`, 1680×2240, verlustfrei aus dem echten Shader, pngquant-komprimiert (Banding-Check gegen Raw bestanden — Linien stammen vom Shader selbst, nicht von der Kompression). Kein Auto-Seeding (User lädt bei Gefallen selbst hoch).
- [x] **Task 20 — Verifikation** : Alle automatisierten Gates grün — Backend-Typecheck sauber, Dashboard-Typecheck sauber, `pnpm lint` (Biome, 905 Files) sauber, `pnpm test:run` mit `DATABASE_URL` (shared 7 / dashboard 10 / backend 96 = 1266 Tests / frontend 53 = 313 Tests, Exit 0), `pnpm run doctor` 0 Issues über alle 4 React-Projekte. Nebenbei zwei stale git-Worktrees (`.worktrees/mc-079…`, `.claude/worktrees/nifty-meitner…`) aufgeräumt, die Biome's `.`-Scan lokal brachen (Branches erhalten). **Visueller Dashboard-Smoke bleibt dem User überlassen** (Memory `feedback_browser_verification`).

---

## Testing-Fokus (aus Spec)

- Renderer: `resolveBranding` (Override gewinnt pro Feld unabhängig, `null`/fehlend fällt zurück); Hintergrund-CSS (Gradient immer, Bild-Layer nur wenn gesetzt, Dark-`@media` korrekt).
- Route: Preview mit/ohne `branding`-Override-Body.
- Repository: present-keys-only für neue Template-Override-Spalten (Integrationstest, live DB).

## Rückwärtskompatibilität

Bestehende Vorlagen: alle neuen `email_templates`-Spalten `NULL` → erben unverändert das globale Branding. Globales Branding: 4 Gradient-Spalten bekommen Shader-Default-Farben, Bild-Asset-IDs `NULL` → jede Mail zeigt ab Migration den Gradient-Hintergrund (unaufdringlich), bis der User optional ein Bild ergänzt. Kein Backfill nötig.

## Abschluss (nur nach User-OK)

Nicht selbst nach `done/` verschieben (Memory `feedback_plan_hygiene`). Commit/Push nur auf ausdrückliche Ansage (Memory `feedback_no_auto_push`).
