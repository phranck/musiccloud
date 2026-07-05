# Dashboard i18n-Konsolidierung

Plan-Nr.: MC-093

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Ziel:** `apps/dashboard/src/i18n/messages.ts` von toten Keys befreien, Volltreffer-Duplikate auf `common.*` bzw. shared Namespaces konsolidieren und Übersetzungs-Inkonsistenzen normalisieren.

**Architektur:** Die Messages werden ausschließlich statisch über `messages.<section>.<key>` konsumiert (ein Einstieg: `I18nContext.tsx`). Jede Key-Löschung/-Umbenennung wird vom TypeScript-Compiler vollständig abgesichert — `tsc --noEmit` grün heißt: keine Callsite zeigt ins Leere. Vorgehen pro Task: Callsites greppen → umstellen → Keys aus Interface + `de` + `en` löschen → Gates → Commit.

**Tech Stack:** TypeScript, React, Biome, React Doctor.

---

## Präambel

Audit vom 2026-07-05 (Session-Skript, flatten + Gruppierung über beide Locales):

- 780 Leaf-Keys pro Sprache
- 113 Volltreffer-Gruppen (DE **und** EN identisch), 309 betroffene Keys
- ~111 tote Keys außerhalb `developer.*` (3 komplette Namespaces + 24 Einzel-Keys)
- 34 Teil-Duplikat-Gruppen (eine Sprache gleich, andere divergiert = Inkonsistenzen)

## Nicht-Ziele (bewusst ausgeklammert)

- **`developer.*` komplett** — Sektion ist in aktivem Umbau (Detail-Pages heute committet, [Tier-Editor MC-092](2026-07-05-tier-editor.md) offen, weitere UX-Änderungen angekündigt). Auch die 14 toten developer-Keys (`requestsFilter*`, `statusPending/Approved/Rejected`, `clientsRevokeToken/RotateToken/DeactivateToken`, `overviewCardLabel`, `requestCount`, `accountCount`, `accountDetailDelete`) bleiben bis zum Abschluss des Umbaus.
- **„Keins"/„Keine" für EN „None"** — deutsche Genus-Kongruenz (das Icon → Keins, die Aktion/Vorlage → Keine), keine Redundanz.
- **Sidebar-Label vs. Seitentitel** (z. B. `layout.sidebar.design` vs. `design.title`) — dürfen bewusst divergieren (Präzedenz: „Analyse" vs. „Analytics").
- **`services.enabled/disabled` vs. Status-Badges** — Terminologie-Entscheidung (Enabled vs. Active), nicht mechanisch konsolidierbar.
- **Divergierende Texte** wie `importSuccess` („{n} Formulare…" vs. „{n} Vorlagen…"), `importConflictTitle`, `importConflictHint` — bleiben pro Feature.

---

## Phase 1: Tote Keys löschen

### Task 1: Tote Namespaces löschen

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` (Interface + `de` + `en`)

Komplett löschen (0 Referenzen im gesamten Dashboard- und dashboard-ui-Code, grep-verifiziert):

- `media.*` — alle 32 Keys inkl. `media.table.*`
- `content.footerBuilder.*` — alle 46 Keys inkl. `styleOptions`, `directionOptions`, `colorFields`, `sizeOptions`, `columnSpan`, `blockLabels`
- `content.linkPicker.*` — alle 7 Keys inkl. `groups`
- `layout.sidebar.media`, `layout.sidebar.footerBuilder`

- [x] Task 1: Namespaces aus Interface, `de` und `en` entfernt; `pnpm --filter @musiccloud/dashboard exec tsc --noEmit` grün; Commit `Refactor: drop dead media/footerBuilder/linkPicker i18n namespaces`

### Task 2: Tote Einzel-Keys löschen

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts`

Löschen (Leaf-Segment kommt im gesamten Quellcode nicht vor, Corpus-Scan):

- `languageName` (Root)
- `common.copyUrl`
- `auth.adminArea`
- `music.tracks.noTracksHint`, `music.albums.noAlbumsHint`, `music.artists.noArtistsHint`
- `music.tracks.colActions` (leerer String)
- `users.editTitle`, `users.createCard.closeAria`
- `content.editor.confirmDeleteAction`, `content.editor.titleLabel`
- `content.pages.segments.addSegment`, `.targetPlaceholder`, `.invalidSegments`, `.moveUp`, `.moveDown`
- `formBuilder.backToList`
- `formBuilder.panel.buttonIconNone`, `.buttonDisplayText`, `.buttonDisplayIcon`, `.buttonDisplayBoth`, `.loadingEditor`, `.iconPickerSearch`, `.iconPickerEmpty`
- `emailTemplates.editTemplate`, `emailTemplates.backToList`

Falls `tsc` bei einem Key doch eine Callsite meldet: Key behalten, im Plan als Korrektur vermerken.

- [x] Task 2: Einzel-Keys entfernt (26 Properties, backToList in beiden Namespaces); `tsc --noEmit` grün; Commit `Refactor: drop dead dashboard i18n keys`

---

## Phase 2: `common.*` durchsetzen

Vorgehen pro Mapping: Callsites per `grep -rn "<keyName>" apps/dashboard/src --include="*.tsx" --include="*.ts"` finden, auf den `common`-Key umstellen, alten Key aus Interface + beiden Locales löschen.

### Task 3: `common.saveError` einführen (Inkonsistenz-Fix)

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Callsite-Files

Neuer Key `common.saveError` = DE „Fehler beim Speichern" / EN „Error saving". Ersetzt:

| Alter Key | Anmerkung |
|---|---|
| `music.trackEdit.saveError` | EN war „Failed to save" → normalisiert |
| `users.editCard.errorSaving` | |
| `content.editor.saveError` | |
| `content.pages.segments.saveError` | EN war „Failed to save" → normalisiert |
| `formBuilder.saveError` | |
| `emailTemplates.saveError` | |
| `design.saveError` | DE war „Speichern fehlgeschlagen" → normalisiert |

- [x] Task 3: `common.saveError` aktiv, 7 alte Keys weg; `tsc` grün; Commit `Refactor: unify save error message under common.saveError`. Zusatz: BuilderHeaderActions (FormBuilderEditPage) bezieht useI18n jetzt selbst — save/saved/saving dort schon auf `common.*` (Task-4-Anteil miterledigt)

### Task 4: save / saved / saving auf `common.*`

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Callsite-Files (u. a. `features/system/DesignSettingsPage.tsx`, `features/templates/form-builder/*`, `features/templates/email-templates/*`, `features/content/state/UnsavedGuard.tsx`, `features/content/pages/SegmentManager.tsx`)

- → `common.save`: `design.save`, `content.editor.shortcuts.save`, `formBuilder.save`, `emailTemplates.save`, `unsavedGuard.save`
- → `common.saved`: `design.saved`, `content.editor.saved`, `formBuilder.saved`, `emailTemplates.saved`
- → `common.saving`: `design.saving` (DE war „Speichern…" → normalisiert), `content.pages.segments.saving`, `unsavedGuard.saving`

- [x] Task 4: save/saved/saving auf `common.*` umgestellt und gelöscht; `tsc` grün. Zusatzbefunde beim Lesen: `content.editor.shortcuts.*` (5), `content.editor.saved`, `content.editor.ok` (Callsite → `common.ok`, Task-5-Anteil vorgezogen) und `content.pages.segments.save/saving/remove/preview` waren komplett callsite-los → mitgelöscht; Commit `Refactor: use common save/saved/saving across dashboard features`

### Task 5: cancel / edit / delete / copied / remove / ok auf `common.*`

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Callsite-Files

- → `common.cancel`: `music.table.deleteConfirmCancel`, `system.deleteAllCancel`, `unsavedGuard.cancel`
- → `common.edit`: `music.table.editButton`, `users.editCard.editTooltip`, `formBuilder.editButton`
- → `common.delete`: `music.table.deleteConfirmAction`
- → `common.copied`: `users.createCard.inviteCopied`
- → `common.remove`: `users.remove`, `content.pages.segments.remove`
- → `common.ok`: `content.editor.ok`

- [x] Task 5: Action-Labels auf `common.*` umgestellt und gelöscht (`ok` schon in Task 4); Zusatz: hartkodiertes "OK" in SystemPage-DangerZone → `common.ok`; `tsc` grün; Commit `Refactor: use common action labels across dashboard features`

### Task 6: loading normalisieren

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Callsites von `services.loading`, `content.loadingFallback`

- `common.loading` DE von „Lade…" auf „Wird geladen…" ändern (Mehrheits-Wording)
- `services.loading`, `content.loadingFallback` → `common.loading`, alte Keys löschen

- [ ] Task 6: loading vereinheitlicht; `tsc` grün; Commit `Refactor: unify loading message under common.loading`

---

## Phase 3: Shared Namespaces

### Task 7: `music.columns.*` für Tabellenspalten

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + `features/music/*`

Neues Objekt `music.columns` = `{ title, artists, source, links, added }` (Werte: Titel/Künstler/Quelle/Services/Hinzugefügt bzw. Title/Artists/Source/Services/Added). Ersetzt:

- `music.tracks.colTitle`, `.colArtists`, `.colSource`, `.colLinks`, `.colAdded`
- `music.albums.colTitle`, `.colArtists`, `.colSource`, `.colLinks`, `.colAdded`
- `music.artists.colSource`, `.colLinks`, `.colAdded`

Bleiben (nicht dupliziert): `music.albums.colTracks`, `music.artists.colName`, `music.artists.colGenres`.

- [ ] Task 7: `music.columns` aktiv, 13 col-Keys weg; `tsc` grün; Commit `Refactor: shared music.columns table headers`

### Task 8: Seitenstatus auf `content.pages.status.*`

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Editor-Callsites

`content.editor.statusDraft/statusPublished/statusHidden` löschen, Callsites auf das bestehende Set `content.pages.status.draft/published/hidden` umstellen.

- [ ] Task 8: Ein Status-Set statt zwei; `tsc` grün; Commit `Refactor: single page status label set`

### Task 9: Ausrichtung nach `common.*`

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Editor-/FormBuilder-Callsites

Neu: `common.alignment` („Ausrichtung"/„Alignment"), `common.alignLeft`, `common.alignCenter`, `common.alignRight`. Ersetzt:

- `content.editor.titleAlignmentLabel`, `.titleAlignmentLeft`, `.titleAlignmentCenter`, `.titleAlignmentRight`
- `formBuilder.panel.buttonAlign`, `.buttonAlignLeft`, `.buttonAlignCenter`, `.buttonAlignRight`

- [ ] Task 9: Alignment konsolidiert (8 → 4 Keys); `tsc` grün; Commit `Refactor: shared alignment labels in common`

### Task 10: Rollen-Labels konsolidieren

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + Sidebar-/UserEditCard-Callsites

`users.role.*` (owner/admin/moderator) ist das kanonische Set. Löschen und umstellen:

- `layout.sidebar.roles.owner/admin/moderator` → `users.role.*`
- `users.editCard.roleAdmin`, `users.editCard.roleModerator` → `users.role.admin` / `users.role.moderator`

- [ ] Task 10: Ein Rollen-Set statt drei; `tsc` grün; Commit `Refactor: single role label set`

### Task 11: `common.importExport.*` für Form-Builder + E-Mail-Vorlagen

**Files:** Modify: `apps/dashboard/src/i18n/messages.ts` + `features/templates/form-builder/*`, `features/templates/email-templates/*`

Neues Objekt `common.importExport` = `{ exportAction, importAction, importError, invalidFile, newNameLabel, overwrite, rename, skip, nameConflict }`. Ersetzt die identischen Paare:

- `formBuilder.exportForm` / `emailTemplates.exportTemplate` → `exportAction` („Exportieren"/„Export")
- `formBuilder.importForm` / `emailTemplates.importTemplate` → `importAction` („Importieren"/„Import")
- `formBuilder.importError` / `emailTemplates.importError` → `importError`
- `formBuilder.importInvalidFile` / `emailTemplates.importInvalidFile` → `invalidFile`
- `formBuilder.importNewNameLabel` / `emailTemplates.importNewNameLabel` → `newNameLabel`
- `formBuilder.importOverwrite` / `emailTemplates.importOverwrite` → `overwrite`
- `formBuilder.importRename` / `emailTemplates.importRename` → `rename`
- `formBuilder.importSkip` / `emailTemplates.importSkip` → `skip`
- `formBuilder.nameConflict` / `emailTemplates.nameConflict` → `nameConflict`

- [ ] Task 11: importExport-Namespace aktiv (18 → 9 Keys); `tsc` grün; Commit `Refactor: shared import/export i18n namespace`

---

## Abschluss

### Task 12: Gates + Audit-Re-Run

- `pnpm --filter @musiccloud/dashboard exec tsc --noEmit` grün
- `pnpm lint` grün
- `pnpm run doctor:diff` grün
- `pnpm test:run` grün
- Audit-Skript erneut laufen lassen (flatten + Duplikat-Gruppierung): Volltreffer-Gruppen außerhalb der dokumentierten Nicht-Ziele = deutlich reduziert; keine toten Keys außerhalb `developer.*`

- [ ] Task 12: Alle Gates grün, Audit-Re-Run dokumentiert; Abschluss-Commit falls Restdiff

---

## Verifizierte Fakten

| Referenz | Verifikation |
|---|---|
| `apps/dashboard/src/i18n/messages.ts` (einzige Message-Quelle, 780 Leaf-Keys/Locale) | Read komplett + Audit-Skript, 2026-07-05 |
| Konsum ausschließlich über `DASHBOARD_MESSAGES` in `src/context/I18nContext.tsx` + `src/components/ErrorBoundary.tsx` | grep `DASHBOARD_MESSAGES` |
| Zugriffe rein statisch, keine Template-Literal-Indexzugriffe | grep `` \[` `` in `apps/dashboard/src` → 0 Treffer |
| `media`/`FooterBuilder`/`LinkPicker` ohne Code-Referenzen | grep `messages\.media|\.media\b`, `footerBuilder|FooterBuilder`, `linkPicker|LinkPicker` → 0 Treffer außerhalb messages.ts |
| Dead-Key-Liste | Corpus-Scan (alle `.ts/.tsx` in `apps/dashboard/src` + `packages/dashboard-ui/src`, Wortgrenzen-Match je Leaf-Segment), Session 2026-07-05 |
| Duplikat-/Teilduplikat-Gruppen | Audit-Skript (flatten, Gruppierung nach (de,en)-Paar), Session 2026-07-05 |
| `UnsavedGuard`-Callsite | grep → `apps/dashboard/src/features/content/state/UnsavedGuard.tsx` |
| Typecheck-Kommando | `pnpm --filter @musiccloud/dashboard exec tsc --noEmit` — heute grün gelaufen |
| `pnpm lint` = `biome check .`, `pnpm run doctor:diff`, `pnpm test:run` | Root-`package.json` gelesen |
| Plan-Nr. | `plans next` → MC-093 |

- [ ] All code references verified (functions, scripts, paths, env vars, package-manager commands)
