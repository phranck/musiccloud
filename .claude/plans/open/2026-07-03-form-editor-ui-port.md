# Form-Editor UI — lmaa-Port Teil 2 (Phase B2) — Implementation Plan

Plan-Nr.: MC-083

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps als `- [ ]`-Checkliste. Schlanker Plan — Code entsteht beim Abarbeiten je Task, nicht hier vorab. Port-Quelle lmaa.space; jede Quelldatei vor dem Portieren vollständig lesen. **Voraussetzung: MC-082 (Form-Backend) ist umgesetzt.**

**Goal:** Der voll funktionsfähige Form-Editor aus lmaa.space ersetzt den `EditorStubPage` unter `/forms/:name`: Feld-Palette, Builder-Canvas mit dnd-Reihen/Feldern, Feld-Konfigurations-Panel, Submission-Pipeline-Panel (store/email mit Template-Picker), Import/Export. Angepasst an musiccloud's UI-Kit (`@musiccloud/dashboard-ui`), i18n und Hooks.

**Architecture:** 1:1-Feature-Port mit Komponenten-Mapping statt Redesign: lmaa-Komponentenzuschnitt bleibt (Canvas/Row/Field/Palette/Panels/EditPage-Reducer), nur UI-Primitives, Icons-Nutzung, i18n-Anbindung und Hook-Endpunkte werden auf musiccloud-Konventionen umgestellt. Keine visuellen Eigenerfindungen — Abweichungen nur, wo musiccloud-Regeln (Token-Verdrahtung, Radius-Kaskade per AGENTS.md, Doctor-Regeln) es verlangen.

**Tech Stack:** React, dnd-kit, `@musiccloud/dashboard-ui`, TanStack Query, `@musiccloud/shared` (Contract aus MC-082), Biome, react-doctor.

**Port-Quelle:** `/Users/phranck/Sites/lmaa.space/WebApp/apps/dashboard/src/features/templates/form-builder/` (~3300 Zeilen, 10 Dateien; Größen: EditPage 818, FieldConfigPanel 653, SubmissionConfigPanel 498, ListPage 481, FieldPalette 280, BuilderField 160, TextTokensHelp 127, BuilderRow 110, ImportConflictDialog 93, BuilderCanvas 73).

---

## Design-Entscheidungen

- **Shop-Step entfällt:** `SubmissionConfigPanel` wird ohne `create-shop-suggestion`-Step portiert (Contract in MC-082 ohne Shop-Step); Step-Auswahl bietet nur store + email.
- **Template-Picker im email-Step** nutzt `useEmailTemplates` (existiert) — Anzeige der Template-Namen, Wert `templateId`.
- **UI-Kit-Mapping:** lmaa importiert `@lmaa/ui/dashboard-section`, `@lmaa/ui/toggle-switch` und lokale Primitives (`DashboardActionButton`, `DashboardIconButton`, `DashboardInput`, `FlowConnector`, `HeaderBackButton`, `useDashboardSortableSensors`, `IconPicker`, `ContentUnavailableView`). musiccloud-Äquivalente verwenden, wo vorhanden (`DashboardSection`, `DashboardActionButton`/`DashboardIconButton`/`DashboardInput` aus `@musiccloud/dashboard-ui`, `ContentUnavailableView`, `PageHeader` existieren — ListPage-Port belegt das). Fehlende Primitives werden in Task 1 inventarisiert und minimal ergänzt (kein Framework-Bau).
- **Sortable-Sensoren:** musiccloud-Muster ist direkte `useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, …))`-Nutzung (siehe `BlockEditor.tsx`); lmaas `useDashboardSortableSensors` wird darauf abgebildet (oder als kleiner Hook übernommen, falls mehrfach gebraucht — DRY beim Task entscheiden).
- **i18n:** `messages.formBuilder` existiert bereits (ListPage nutzt es); fehlende Editor-Keys aus lmaa `messages.ts` nach de+en portieren.
- **Logik/Komponenten-Trennung** (Projektregel): reine Helper (z. B. Export-Serialisierung) nach `features/templates/hooks/` bzw. `lib/`, Komponenten je eigene Datei.
- **Doctor-Regeln aktiv anwenden:** domain-literals (Step-/Feldtyp-Namespaces statt Inline-Literale, soweit Contract-Union-Typen das nicht schon abdecken), keine Datei-Riesen — lmaa-Dateien >600 Zeilen dürfen beim Port entlang bestehender Komponentengrenzen aufgeteilt werden.
- **Route:** `routes.tsx:63` `EditorStubPage` → `FormBuilderEditPage` (lazy, Muster `routeComponents.tsx`).

## Task-Checkliste

- [ ] **Task 1 — UI-Kit-Inventar:** Alle lmaa-Imports der 10 Quelldateien auflisten; Mapping-Tabelle lmaa→musiccloud; fehlende Primitives identifizieren (`FlowConnector`, `HeaderBackButton`, `ToggleSwitch`, `IconPicker`, `useDashboardSortableSensors` — Existenz in musiccloud per grep prüfen) und Minimal-Ports davon anlegen (mit TSDoc, Token-verdrahtet).
- [ ] **Task 2 — Hooks erweitern:** `useFormConfig.ts` um `useFormConfig(name)` (GET by name) + `useSaveFormConfig` (PUT Payload) + `useImportFormConfig` ergänzen (ENDPOINTS aus MC-082).
- [ ] **Task 3 — Palette + Canvas:** `FieldPalette.tsx`, `BuilderCanvas.tsx`, `BuilderRow.tsx`, `BuilderField.tsx` portieren (dnd-kit, FieldTypeIcon-Mapping auf Phosphor-Duotone).
- [ ] **Task 4 — FieldConfigPanel:** portieren (alle Feldtypen inkl. Validation-Felder, options/optionsSource, button-Config); bei >600 Zeilen entlang Sektionen aufteilen.
- [ ] **Task 5 — SubmissionConfigPanel:** portieren ohne Shop-Step; email-Step mit Template-Picker (`useEmailTemplates`), `toFieldId`/`replyToFieldId`-Feldauswahl aus den Formularfeldern; Success-Config (headline/message/redirect).
- [ ] **Task 6 — EditPage + Route:** `FormBuilderEditPage.tsx` (Reducer, dnd-Verdrahtung, Save via PUT, Dirty-State) portieren; `TextTokensHelp.tsx`, `ImportConflictDialog.tsx` + Export/Import-Helper; `routes.tsx:63` auf die echte Seite; Stub-Referenz entfernen, falls ungenutzt.
- [ ] **Task 7 — i18n:** fehlende `formBuilder`-Keys (de+en) aus lmaa portieren; Interface + beide Sprachen synchron.
- [ ] **Task 8 — Verifikation:** Typecheck dashboard, `pnpm lint`, `pnpm doctor:diff` (0 Issues), `pnpm test:run`; Dashboard-Smoke: Form anlegen → Felder per dnd bauen → konfigurieren → Pipeline (store+email mit Template) setzen → speichern → reload → identischer Zustand; Export/Import-Roundtrip.

## Verifizierte Fakten (2026-07-03)

- Plan-Nr. `MC-083` via `plans next`.
- Quelldateien + Größen: `wc -l` über `/Users/phranck/Sites/lmaa.space/WebApp/apps/dashboard/src/features/templates/form-builder/*.tsx` (Summe 3293).
- lmaa EditPage-Imports (`FormBuilderEditPage.tsx:1-45`): `@dnd-kit/core`, `arrayMove`, Phosphor (`GearIcon`, `HandTapIcon`, `QuestionIcon`), `@lmaa/contracts`, `@lmaa/ui/dashboard-section`, `@lmaa/ui/toggle-switch`, lokale `ContentUnavailableView`/`DashboardActionButton`/`DashboardButton`/`DashboardControls`/`FlowConnector`/`HeaderBackButton`/`PageHeader`/`useDashboardSortableSensors`, form-builder-Geschwisterkomponenten, `formConfigExport`-Helper.
- musiccloud vorhanden: `@musiccloud/dashboard-ui` (`DashboardActionButton`, `DashboardIconButton`, `DashboardInput`, `DashboardSection` — genutzt in `EmailActionsPage.tsx`), `ContentUnavailableView` + `PageHeader` + `Dialog` (genutzt in `FormBuilderListPage.tsx`), dnd-kit-Muster `features/templates/email-templates/BlockEditor.tsx` (`useSensors`/`PointerSensor`/`KeyboardSensor`), `useEmailTemplates` (`features/templates/hooks/`, genutzt in `EmailActionsPage.tsx:20`), i18n `messages.formBuilder` (ListPage `:73`), Routen-Lazy-Muster `routeComponents.tsx:88`.
- Editor-Stub: `apps/dashboard/src/routes.tsx:63` (`EditorStubPage`, definiert `routeComponents.tsx:135`).
- Contract: nach MC-082 in `packages/shared/src/form-builder.ts`; bis dahin Kopie `apps/dashboard/src/shared/contracts/form-builder.ts` (Typnamen-Diff gegen lmaa leer).
- Gates: `tsc --noEmit` dashboard, `pnpm lint`, `pnpm doctor:diff`, `pnpm test:run`.
- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands).

## Offene Punkte

- Existenz von `FlowConnector`/`HeaderBackButton`/`ToggleSwitch`/`IconPicker`/`useDashboardSortableSensors` in musiccloud wird in Task 1 per grep geklärt (bewusst offen, keine Pseudo-Fakten).
- `TextTokensHelp`-Inhalt (welche Tokens dokumentiert es) wird beim Port gelesen und ggf. an musiccloud-Realität angepasst.

## Abschluss (nur nach User-OK)

Nicht selbst nach `done/` verschieben. Commit/Push nur auf ausdrückliche Ansage.
