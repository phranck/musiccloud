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

- [x] **Task 1 — UI-Kit-Inventar** *(Ergebnis 2026-07-04):*
  - **Vorhanden in musiccloud:** `HeaderBackButton`, `DashboardSection`, `ContentUnavailableView`, `TableActionButton`, `PageHeader`, `Dialog` (`shared/ui/Dialog`), `formInputClass` (`shared/ui/FormPrimitives`), `DashboardInput`/`DashboardField`/`DashboardActionButton`/`DashboardIconButton` (`@musiccloud/dashboard-ui`), dnd-kit, Phosphor, `useEmailTemplates`, `useFormConfig`, `useI18n`.
  - **Fehlend → Minimal-Port beim jeweiligen Task:** `FlowConnector` (Step-Verbinder im SubmissionConfigPanel), `ToggleSwitch` (`@lmaa/ui/toggle-switch`), `useDashboardSortableSensors` (trivial; alternativ musiccloud-Muster `useSensors(PointerSensor, KeyboardSensor)` aus `BlockEditor.tsx`).
  - **Weitere lmaa-Imports, Mapping beim Port je Datei:** `DeleteConfirmDialog`/`OverlayCard` → musiccloud `Dialog`; `Dropdown`, `SegmentSwitch`, `Table`, `@lmaa/ui/form-primitives` → musiccloud-Äquivalente bzw. Minimal-Port; `useImportQueue` + `formConfigExport` → Muster: Email-Template-Import/Export (`EmailTemplateImportConflictDialog` + hooks). `IconPicker` taucht in den form-builder-Imports NICHT auf (buttonIcon-Auswahl steckt in `FieldConfigPanel`-Internals; beim Port konkret prüfen).
- [x] **Task 2 — Hooks erweitern:** `useFormConfig.ts` um `useFormConfig(name)` (GET by name) + `useSaveFormConfig` (PUT Payload) + `useImportFormConfig` ergänzen (ENDPOINTS aus MC-082).
- [x] **Task 3 — Palette + Canvas:** `FieldPalette.tsx`, `BuilderCanvas.tsx`, `BuilderRow.tsx`, `BuilderField.tsx` portieren (dnd-kit, FieldTypeIcon-Mapping auf Phosphor-Duotone).
- [x] **Task 4 — FieldConfigPanel:** *(Abweichungen: native Selects statt Icon-Dropdown/Combobox, DashboardSegmentedControl statt Button-Reihen, buttonIcon/buttonDisplay bewusst NICHT portiert — braucht kuratierte Icon-Lib, kommt mit dem Renderer-Plan)* portieren (alle Feldtypen inkl. Validation-Felder, options/optionsSource, button-Config); bei >600 Zeilen entlang Sektionen aufteilen.
- [x] **Task 5 — SubmissionConfigPanel:** *(ohne Shop-Step; native Selects; SegmentedControl statt SegmentSwitch; NEU: Reply-To-Feldauswahl ergänzt (Contract/Pipeline konnten es schon, lmaa-UI bot es nie an); FlowConnector + useDashboardSortableSensors minimal portiert)* portieren ohne Shop-Step; email-Step mit Template-Picker (`useEmailTemplates`), `toFieldId`/`replyToFieldId`-Feldauswahl aus den Formularfeldern; Success-Config (headline/message/redirect).
- [x] **Task 6 — EditPage + Route:** *(inkl. Import-Flow auf der ListPage: useImportQueue + ImportConflictDialog + Datei-Parse; Export-Single in der EditPage. Abweichungen: TextTokensHelp NICHT portiert — dokumentiert Renderer-Tokens, die musiccloud nicht hat; Export-All weggelassen (YAGNI); ToggleSwitch/downloadJson minimal portiert)* `FormBuilderEditPage.tsx` (Reducer, dnd-Verdrahtung, Save via PUT, Dirty-State) portieren; `TextTokensHelp.tsx`, `ImportConflictDialog.tsx` + Export/Import-Helper; `routes.tsx:63` auf die echte Seite; Stub-Referenz entfernen, falls ungenutzt.
- [x] **Task 7 — i18n:** *(Keys wurden je Task inline gepflegt: fieldTypes, canvas/palette/preferences, inputType*, buttonAction*, emailReplyTo*, successText, import*/export* — Interface + de + en synchron, TSC-bewiesen)* fehlende `formBuilder`-Keys (de+en) aus lmaa portieren; Interface + beide Sprachen synchron.
- [x] **Task 8 — Verifikation:** *(Gates grün 2026-07-04: dashboard tsc EXIT 0, `pnpm lint` 939 Files clean (12 a11y-Fehler gefixt: BuilderField auf echtes `<button>`+Sibling-Delete, Panel-Labels via htmlFor/id), doctor:diff 0 Issues, dashboard-Tests 61/61, Vite HTTP 200. Backend/frontend/shared seit MC-082-Gates unverändert. Interaktiver dnd-Smoke + visuelle Abnahme: User auf http://localhost:4500/forms)* Typecheck dashboard, `pnpm lint`, `pnpm doctor:diff` (0 Issues), `pnpm test:run`; Dashboard-Smoke: Form anlegen → Felder per dnd bauen → konfigurieren → Pipeline (store+email mit Template) setzen → speichern → reload → identischer Zustand; Export/Import-Roundtrip.

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
