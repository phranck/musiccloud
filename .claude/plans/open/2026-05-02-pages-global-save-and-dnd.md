# Implementation-Plan: Pages Global Save + Drag-and-Drop Hierarchie

Plan-Nr.: MC-021

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im `/admin/pages/*`-Bereich des Dashboards einen einzigen globalen Save-Button mit DB-Transaktions-Atomicity, Cmd+S-Bind, Navigation-Leave-Guard sowie volles Drag-and-Drop für Sidebar (Sub-Pages reorder + cross-parent + Top-Level + Promote/Demote) und SegmentManager-Liste implementieren.

**Architecture:** Frontend bekommt Composable-Slices-State (sidebar, meta, content, segments, translations) plus Dirty-Registry. Edits dispatchen in Slices statt direkt zu mutieren. Save baut aus Slice-Diffs einen `PagesBulkRequest`-Payload und ruft den neuen `PUT /api/admin/pages/bulk`-Endpoint, der alles in einer Postgres-TX ausführt. Alte per-Resource-Routen bleiben für Backward-Compat stehen (Cleanup in eigener Folge-Plan).

**Tech-Stack:** Backend: Fastify + Drizzle-ORM + Postgres. Frontend: React + dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) + React-Query + React-Router v6.4 (`useBlocker`). Tests: Vitest. Sprache im Plan = Deutsch, Code + Commits + Tests = Englisch.

**Spec:** `docs/superpowers/specs/2026-05-02-pages-global-save-and-dnd-design.md`

**Branch-Strategie:** Arbeit auf `main` (per User-Wunsch werden alle Session-Commits gemeinsam gepusht — siehe SESSION.md `Decisions in flight`). Kein Feature-Branch, kein Worktree. Push erst nach kompletter Implementation.

---

## Verifizierte Facts (regeneriert 2026-05-03 nach Phasen 1-7 + T34 + T26.5 + T36-T42)

> Tabelle spiegelt den IST-Zustand nach allen Session-Commits wider. Alte Refs auf Code, der durch T24b/T25/T26.5/T39 entfernt wurde, sind nicht mehr Teil der Tabelle.

**Backend (Phase 1-2 + T35 pending)**

| Ref | Verifikation |
|---|---|
| `apps/backend/src/db/schemas/postgres.ts:438+` `contentPages` table inkl. `position INTEGER NOT NULL DEFAULT 0` (Z. 449) | Read ✓ |
| `apps/backend/src/db/schemas/postgres.ts:463+` `pageSegments` table | grep ✓ |
| `apps/backend/src/db/adapters/postgres.ts:2540+` `listContentPageSummaries` mit segment-aggregation und `ORDER BY content_pages.position ASC, created_at DESC` (Z. 2554) | Read ✓ |
| `apps/backend/src/db/admin-repository.ts:259` `interface AdminRepository`; Z. 369 `listContentPageSummaries`; Z. 373 `updateContentPageMeta`; Z. 389-391 `listSegmentsForOwner` / `replaceSegmentsForOwner` / `bulkUpdatePages` | grep ✓ |
| `apps/backend/src/services/admin-pages-bulk.ts:20` `bulkUpdatePages(payload, opts)` mit fail-fast validation; Z. 107 ruft `repo.bulkUpdatePages` | grep ✓ |
| `apps/backend/src/routes/admin-content.ts:223` `bulkUpdatePages(request.body, { updatedBy })` Route-Handler für `PUT /api/admin/pages/bulk` | grep ✓ |
| `apps/backend/src/db/migrations/postgres/` letzte: `0027_red_mastermind.sql` (post-Phase-1, T35 pusht den aktuellen Stand zu Prod) | ls ✓ |
| `scripts/migrate.mjs` pflegt nur `_migrations`-Tabelle, NICHT `drizzle.__drizzle_migrations` (Memory `project_dual_migration_trackers`) | unverändert |
| `package.json` `db:migrate` = `node scripts/migrate.mjs`; `db:generate` = `drizzle-kit generate --config=drizzle.config.postgres.ts` | unverändert |

**Shared**

| Ref | Verifikation |
|---|---|
| `packages/shared/src/content.ts:158` `PagesBulkRequest`; Z. 165 `PagesBulkResponse` | grep ✓ |
| `packages/shared/src/endpoints.ts:231` `ENDPOINTS.admin.pages.bulk = "/api/admin/pages/bulk"`; Z. 331 `ROUTE_TEMPLATES.admin.pages.bulk` | grep ✓ |

**Frontend State-Layer (Phase 3)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/state/PagesEditorContext.tsx` Provider + dispatch-bag — globally mounted in `AdminLayout` (T26.5) | ls ✓ |
| `apps/dashboard/src/features/content/state/dirtyRegistry.ts` Set<SliceKey> mit subscribe | ls ✓ |
| `apps/dashboard/src/features/content/state/diff.ts` `buildBulkPayload(slices)` | ls ✓ |
| `apps/dashboard/src/features/content/state/useGlobalPagesSave.ts` `save()` + `discard()` + status; re-hydrate aller Slices nach erfolgreichem PUT | ls ✓ |
| `apps/dashboard/src/features/content/state/UnsavedGuard.tsx` `beforeunload`-Guard | ls ✓ |
| `apps/dashboard/src/features/content/state/slices/sidebarSlice.ts` `topLevelOrder`-state + `hydrate`/`reorder-top-level`/`reset` | ls ✓ |
| `apps/dashboard/src/features/content/state/slices/metaSlice.ts:53` `isMetaDirty(s, slug)` selector (T32) | grep ✓ |
| `apps/dashboard/src/features/content/state/slices/contentSlice.ts:37` `isContentDirty(s, slug)` selector (T32) | grep ✓ |
| `apps/dashboard/src/features/content/state/slices/translationsSlice.ts:85` `isTranslationDirty(s, slug, locale)` selector (T33) | grep ✓ |
| `apps/dashboard/src/features/content/state/slices/segmentsSlice.ts` byOwner-state mit `hydrate`/`reorder`/`move`/`add`/`remove`/`set-label`/`set-translation`/`reset` | ls ✓ |

**AdminLayout / globaler Topbar (T26.5 + T39)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/components/layout/AdminLayout.tsx` — `PagesEditorProvider` wraps `AdminLayoutInner`; `PagesSaveBarMount` portalt `<PagesSaveBar />` in den Header-Actions-Slot; `PagesEditorBindings` mountet Cmd+S; `PagesSlicesHydrate` hydratet segments-slice global on-mount; `UnsavedGuard` global aktiv | Read ✓ |
| `apps/dashboard/src/features/content/PagesEditorRoot.tsx` ENTFERNT (Provider-Hoist machte Datei redundant) | not exist ✓ |
| `apps/dashboard/src/App.tsx` `/pages` und `/pages/:slug` als Geschwister-Routen (kein Wrapper mehr) | grep ✓ |

**Page-Editor (Phase 5 + T25 + T38)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` slice-driven via `usePagesEditor()`; `LanguageTabs` für default + segmented; `EditorMetadataBar` mit `displayTitle`+`titleLocaleSuffix` props (locale-aware Titel); `handleTitleSave` dispatcht meta-slice (default-locale) oder translations-slice (other; auto-create on first edit) | Read ✓ |
| `apps/dashboard/src/features/content/pages/SegmentManager.tsx` 122 Zeilen — slice-driven, NUR Label-Inputs + Translations-Toggle pro segment-row; KEINE Add/Trash/Move-Buttons, KEIN Target-Dropdown, KEIN Inline-MarkdownEditor (T25) | wc -l ✓ |
| `apps/dashboard/src/features/content/pages/LanguageTabs.tsx` rendert `dirty`+`status` per locale via `<WarningCircleIcon>` | ls ✓ |

**Pages-Übersicht (T37 + T40-T42)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/pages/PagesListPage.tsx` `SortableHierarchicalRow` (useSortable mit IDs `top:`/`child:`/`orphan:`); `closestCorners` collision-detection (Bugfix für `verticalListSortingStrategy`); `handleDragEnd`-branches: top:↔top: reorder, child:↔child: reorder/cross-parent-move, child:→orphan: demote, orphan:→child: promote, orphan:→top: + child:→top: make-child; direction-aware drop-indicator (`activeIndex` vs `index` → top/bottom-line) | Read ✓ |
| `apps/dashboard/src/components/ui/Table.tsx:80` `DataTableRowProps<T>`; Z. 96 `RowComponent?` prop für sortable-row-injection (T37) | grep ✓ |

**Sidebar (T39 — pure display)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/components/layout/Sidebar.tsx` `PagesGroup` rendert `PageTreeRow` direkt; liest `editor.sidebar.current` + `editor.segments.byOwner` für optimistic display; KEIN DnD; `claimedSlugs`-Set deduliziert orphans, die slice schon promoted hat (T41); `dirty`-Punkt via `isMetaDirty`+`isContentDirty` (T32); Plus-Button im Section-Header (T36) | Read ✓ |
| `apps/dashboard/src/components/layout/CollapsibleSidebarGroup.tsx:26` `trailingAction?: React.ReactNode` Slot (T36) — sibling des header-toggle-buttons, kein nested button | grep ✓ |
| `apps/dashboard/src/features/content/pages/CreatePageDialog.tsx` `onCreated(page)` callback + `lockDefaultType` prop — Sidebar-side dispatcht `segments.add` für aktuellen parent bei sub-page-context | ls ✓ |

**Helpers (Pre-/Mid-Session-Refactors)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/hierarchy.ts` `groupPagesByHierarchy(pages)` exportiert `SegmentedBlock` + `PagesHierarchy` types; first-wins-dedup für claimed children | ls ✓ |
| `apps/dashboard/src/features/content/PageStatus.tsx` `PageStatusIcon` (Sidebar) + `PageStatusBadge` (Tabelle) | ls ✓ |

**Hooks (T24a/T24b)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/hooks/useAdminContent.ts:8/15/23/32` — nur noch `useContentPages` (Z. 8), `useAdminContentPage` (Z. 15), `useCreateContentPage` (Z. 23), `useDeleteContentPage` (Z. 32). `useSaveContentPage` + `useSaveContentPageSegments` (alte Z. 23/49) durch T24b entfernt; `usePatchContentPage` + `useSaveTranslation` durch T24a entfernt | grep ✓ |
| `apps/dashboard/src/features/content/pages/usePageTranslations.ts:23,31` `usePageTranslations` + `useDeleteTranslation` (Read-/Delete-only) | grep ✓ |

**DnD-Library + Save-binding (unverändert)**

| Ref | Verifikation |
|---|---|
| `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx:1-17, 124, 445-467` dnd-kit Pattern (Vorlage) | unverändert |
| `apps/dashboard/src/lib/useKeyboardSave.ts:54` `useKeyboardSave(handler, enabled = true)` mit `KeyboardSaveProvider` (App-Level) | unverändert |
| `apps/dashboard/src/context/PageHeaderContext.tsx` `setActionsEl` per Reducer | unverändert |
| `apps/dashboard/package.json` `@dnd-kit/core ^6.3.1`, `@dnd-kit/sortable ^10.0.0`, `@dnd-kit/utilities ^3.2.2` | unverändert |

---

## Architektur-Übersicht

### Frontend-State (neu)

```
apps/dashboard/src/features/content/state/
├── PagesEditorContext.tsx        Provider, wraps /admin/pages/*-Routen
├── dirtyRegistry.ts              Set<SliceKey> + subscribe
├── diff.ts                       sliceState → PagesBulkRequest
├── useGlobalPagesSave.ts         save() + discard() + status
└── slices/
    ├── sidebarSlice.ts           topLevelOrder: Slug[]
    ├── metaSlice.ts              per-page meta
    ├── contentSlice.ts           per-page markdown
    ├── segmentsSlice.ts          per-owner segments[]
    └── translationsSlice.ts      per-page + per-segment translations
```

Slice-Pattern (Reducer + `initial`/`current`):
- `state.initial` = unveränderter Server-Snapshot (gesetzt beim Hydrate + nach Save)
- `state.current` = client-side Draft
- Bei jeder Mutation wird `current` per Reducer geupdated; ein Selector `isSliceDirty(state)` (deep-equal `current` vs `initial`) entscheidet, ob im DirtyRegistry-Set die SliceKey gehalten wird.

### Bulk-Endpoint

`PUT /api/admin/pages/bulk`. Body: `PagesBulkRequest` (siehe Spec §"Bulk-Endpoint Schema"). Service validiert fail-fast vor `BEGIN`; Adapter führt Updates in einer einzigen `db.transaction(tx => …)` aus; Response = vollständiger Server-Snapshot (Pages + Segments + Translations) zum Slice-Reset.

Reihenfolge in der TX (FK-sicher):
1. `pages.meta` (Slug-Rename zuerst)
2. `pages.content`
3. `topLevelOrder` → `position`-Update der segmented Parents
4. `segments` per owner (DELETE+INSERT, wie heute)
5. `pageTranslations` (UPSERT)

### DB-Migration

Neue Spalte `position INTEGER NOT NULL DEFAULT 0` in `content_pages`. Backfill per `ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1`. `listContentPageSummaries` ORDER BY wechselt auf `position ASC, created_at DESC`.

Migration-Sync (musiccloud-spezifisch, Memory `project_dual_migration_trackers`):
- `pnpm db:migrate` schreibt nur in `_migrations`.
- Drizzle-Tracker `drizzle.__drizzle_migrations` muss manuell synchron gehalten werden, sonst crasht der Backend-Restart bei `drizzle-kit migrate`-Aufrufen.

---

## Self-Review Checkliste (Status nach Session 2026-05-03)

- [x] Spec §1 (globaler Save) — T19-T21 ✓
- [x] Spec §2 (DnD inkl. Promote/Demote/Cross-Parent/Top-Level) — T27-T31 ursprünglich in Sidebar, durch T39 in `PagesListPage` migriert; Sidebar bleibt pure display
- [x] Spec §3 (SegmentManager-DnD) — T26 OBSOLETE, da T25-Schrumpfung strukturelle Operationen aus dem SegmentManager entfernt hat (DnD-Ownership liegt bei `PagesListPage`)
- [x] Spec §4 (Draft-Modus, per-Resource-Saves entfallen) — T22-T25 + T24b ✓
- [x] Spec §"Bulk-Endpoint Schema" Validierung 1-6 — T5-T8 ✓
- [x] Spec §"Tests / Backend"-Tabelle (7 Tests) — T8 ✓
- [x] Spec §"Tests / Frontend"-Tabelle (6 Files) — T10-T16 ✓ (Dashboard 44/44)
- [x] Spec §"Concurrency": last-write-wins (dokumentiert, kein Code)
- [ ] Spec §"Migrationsplan" 1-4 — T1 + T22-T26 ✓; **T35 (Prod-Migration-Rollout) pending** — User-Approval für Push der Session-Commits; Zerops-Auto-Deploy triggert `runMigrations()`
- [x] All code references verified — Verifizierte-Facts-Tabelle 2026-05-03 regeneriert nach Drift-Audit
- [x] No placeholders / TBDs in Tasks
- [x] Type/Method-Naming konsistent (`PagesBulkRequest`, `bulkUpdatePages`, `useGlobalPagesSave`, `dirtyRegistry`, `PagesSaveBar`, `PagesEditorContext`)

### Post-Plan-Additions (nicht in den nummerierten Tasks unten dokumentiert)

Folgende Refactors/UX-Iterationen kamen mid- bzw. post-session retroaktiv hinzu und sind in der Tabelle oben verifiziert:

- **T26.5** `e7dc19d8` — `PagesEditorProvider` aus dem entfernten `PagesEditorRoot.tsx` in `AdminLayout` hochgezogen (Drift-Fix: Sidebar/PagesListPage brauchen globalen Slice-Zugriff). `/pages`-Routes flat. `PagesSaveBar` portalt in den Header-Actions-Slot, Cmd+S-Bindings global.
- **T26.5b** `907de624` — `PagesSlicesHydrate` als globaler Hydrate-Component in `AdminLayout` (segments-slice für alle segmented owners on-mount). Vorher war Hydrate an Sidebar-Mount gekoppelt; PagesListPage's DnD braucht den slice unabhängig.
- **T36** `908f2c9d` — Plus-Button im Sidebar pages-section-Header (`CollapsibleSidebarGroup.trailingAction` slot). Ebene-aware: bei sub-page-context wird neue Page als `segments.add` für aktuellen parent dispatcht.
- **T37** `1c81f2eb` — DnD in `PagesListPage` (statt Sidebar). `DataTable.RowComponent` prop für sortable-row-injection. Mirror der Sidebar-DnD-Logik in der Tabelle.
- **T38** `fd0083f1` — Title locale-aware für default + segmented. `EditorMetadataBar.displayTitle/titleLocaleSuffix`-props; auto-create translation on first non-default-locale title-edit. LanguageTabs für beide page-types.
- **T39** `907de624` — DnD aus Sidebar entfernt (User-Wunsch, Sidebar = pure display). `Sidebar.tsx` netto −205 Zeilen.
- **T40** `e23ec144` + `1b949306` — Drop auf segmented-parent als make-child (`orphan:→top:` + `child:→top:` branches). Bugfix: `closestCenter` → `closestCorners` collision-detection (`verticalListSortingStrategy` schiebt active-row visuell unter pointer, `closestCenter` findet sich selbst).
- **T41** `656eb2ef` — Sidebar-Dedup: `claimedSlugs`-Set verhindert doppelte Anzeige von optimistic-promoteten Orphans.
- **T42** `8c8fecb3` + `752a900b` — Drop-Indicator differentiell + direction-aware: `top:`-row → ring + bg-tint (drop INTO); peer + drag-down → bottom-line; peer + drag-up → top-line.
- **T43** `3093672b` — Pointer-aware DnD drop-semantics in `PagesListPage`: (a) `strategy={() => null}` ersetzt default `rectSortingStrategy` → kein "rutscht weg" mehr; (b) Drop-Indicator via `[&>td]:` arbitrary variant statt `<tr>` box-shadow → Safari rendert jetzt auch (Safari ignoriert box-shadow auf `<tr>` in `border-collapse:collapse`); (c) `intendedDropIndex(e, list, overSlug)` Helper vergleicht `active.rect.current.translated.center.y` vs `over.rect.center.y` für vor/nach insert; angewendet auf `top:↔top:`, `child:↔child:` (same+diff owner) und `orphan:→child:`; same-list reorder kompensiert via `from < intended ? intended-1 : intended`; (d) Indicator-Logik switcht von `activeIndex < index` auf dieselbe pointer-half-Berechnung via `useDndContext()` → Anzeige matcht Drop-Position; (e) custom `collisionDetection` returnt `[]` wenn Pointer > letzte droppableRect.bottom + 8px → handleDragEnd's `if (!over)`-Branch demotet `child:`-active als orphan ohne sichtbares Drop-Target.

---

# Tasks

## Phase 1 — Backend: Schema + Migration

### Task 1: DB-Migration `position`-Spalte

> **Workflow:** drizzle-native (`db:generate` → Backfill anhängen → Backend-Restart appliziert via `runMigrations()`). KEIN `scripts/migrate.mjs` (lokal SSL-broken), KEIN manueller `INSERT INTO __drizzle_migrations` (Drizzle-Migrator pflegt das selbst, hash-mismatch triggert Re-Apply). Siehe Memory `project_dual_migration_trackers`.

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts:438-454` (contentPages-Block)
- Create (via `db:generate`): `apps/backend/src/db/migrations/postgres/<NNNN>_<random_words>.sql`
- Create (via `db:generate`): `apps/backend/src/db/migrations/postgres/meta/<NNNN>_snapshot.json`
- Modify (via `db:generate`): `apps/backend/src/db/migrations/postgres/meta/_journal.json`

- [ ] **Step 1: Drizzle-Schema erweitern**

In `apps/backend/src/db/schemas/postgres.ts` direkt nach `contentCardStyle: text("content_card_style").notNull().default("recessed"),` einfügen:

```ts
  position: integer("position").notNull().default(0),
```

`integer` muss am File-Top schon importiert sein (in `import { … } from "drizzle-orm/pg-core";`). Falls nicht: hinzufügen.

- [ ] **Step 2: `db:generate` — drizzle-kit erzeugt SQL + Journal + Snapshot**

```bash
pnpm db:generate
```

Erwartet: drei neue Artefakte unter `apps/backend/src/db/migrations/postgres/`:
- `<NNNN>_<random_words>.sql` mit `ALTER TABLE content_pages ADD COLUMN position integer DEFAULT 0 NOT NULL;` (Filename ist drizzle-kit-chosen — `<NNNN>` wird die nächste freie Nummer nach dem letzten Eintrag in `meta/_journal.json`).
- `meta/<NNNN>_snapshot.json` (volles Schema-Snapshot, ~77 KB).
- Update an `meta/_journal.json` mit neuem `entries[]`-Eintrag (`tag: "<NNNN>_<random_words>"`).

Den genauen Filename merken — er ist im Folge-Step + Commit referenziert.

- [ ] **Step 3: Backfill manuell ans SQL-File anhängen**

Drizzle-Kit erzeugt nur das `ALTER TABLE`. Den `ROW_NUMBER`-Backfill händisch ans Ende des generierten `<NNNN>_<random_words>.sql` anhängen:

```sql
--> statement-breakpoint
WITH ordered AS (
  SELECT slug, ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1 AS new_order
  FROM content_pages
)
UPDATE content_pages
   SET position = ordered.new_order
  FROM ordered
 WHERE content_pages.slug = ordered.slug;
```

(Existing musiccloud-Migrations nutzen `--> statement-breakpoint` als Separator — siehe `0009_low_kat_farrell.sql` Z. 9 als Beispiel.)

- [ ] **Step 4: Backend-Restart appliziert die Migration**

Backend läuft vermutlich noch von der Session (`pnpm dev:all`). Restart triggern, damit `runMigrations()` aus `apps/backend/src/db/run-migrations.ts:43` die neue Migration applied UND `drizzle.__drizzle_migrations` automatisch synchron schreibt:

```bash
# Prozess finden + clean kill
lsof -nP -iTCP:4000 -sTCP:LISTEN
# pkill -f "tsx watch.*server.ts"  (falls nötig)
pnpm dev:backend
```

Erwartete Logs:

```
[DB] Running migrations from .../apps/backend/src/db/migrations/postgres
[DB] All migrations applied successfully
```

Bei Fehler (`error: column "position" already exists` o.ä.): Backend-State + DB-State desynchron — Subagent muss escalate, NICHT raten.

- [ ] **Step 5: Verifikation**

```bash
psql "$DATABASE_URL" -c "SELECT slug, position FROM content_pages ORDER BY position;"
psql "$DATABASE_URL" -c "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1;"
```

Erwartet:
- Alle Pages haben fortlaufende `position` (0, 1, 2, …).
- Letzter Tracker-Eintrag hat als `hash` den SHA256 des neuen SQL-Files (NICHT der File-Name).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts \
        apps/backend/src/db/migrations/postgres/<NNNN>_<random_words>.sql \
        apps/backend/src/db/migrations/postgres/meta/<NNNN>_snapshot.json \
        apps/backend/src/db/migrations/postgres/meta/_journal.json
git commit -m "Feat: Add position column to content_pages for drag-and-drop reorder

- New migration via drizzle-kit with ROW_NUMBER backfill appended manually
- Drizzle schema gains position integer field"
```

(Concrete `<NNNN>_<random_words>` aus Step 2 substituieren.)

---

### Task 1b: Rename `display_order` column → `position`

> **Hintergrund:** T1 wurde mit `display_order` als Spaltenname implementiert (`0026_strong_hardball.sql`). Code-Quality-Review hat angemerkt: `page_segments` und `nav_items` nutzen bereits `position` für sibling-ordering. Drei Tabellen mit demselben Konzept und drei Namen ist Vocabulary-Drift. Dieser Task vereinheitlicht auf `position`, BEVOR T2-T9 Code-Pfade auf `display_order` festschreiben. Plan-Refs in T2-T9 + T18 + Snapshot-Mocks sind bereits auf `position` patched.

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts` (Zeile mit `position: integer("position")` — sollte `position: integer("position")` werden, falls nicht schon)
- Create (via `db:generate`): `apps/backend/src/db/migrations/postgres/<NNNN>_<random_words>.sql` (drizzle-kit erkennt rename + RENAME COLUMN)
- Create (via `db:generate`): `apps/backend/src/db/migrations/postgres/meta/<NNNN>_snapshot.json`
- Modify (via `db:generate`): `apps/backend/src/db/migrations/postgres/meta/_journal.json`

> Hinweis: Nach dem Plan-wide replace_all für Naming-Konsistenz steht im Schema-File aktuell noch der konkrete physische Wert von T1 (`displayOrder: integer("display_order")`). Plan-T1 oben referenziert allerdings schon `position` — das ist der gewünschte Endzustand nach T1b. Subagent muss am echten File arbeiten, nicht am Plan-Text.

- [ ] **Step 1: Drizzle-Schema renamen**

In `apps/backend/src/db/schemas/postgres.ts` die Zeile

```ts
displayOrder: integer("display_order").notNull().default(0),
```

ersetzen durch

```ts
position: integer("position").notNull().default(0),
```

Position bleibt: direkt nach `contentCardStyle: text("content_card_style").notNull().default("recessed"),`.

- [ ] **Step 2: `db:generate` — drizzle-kit detected RENAME COLUMN**

```bash
pnpm db:generate
```

Erwartet: drizzle-kit fragt interaktiv ob `display_order` → `position` ein RENAME ist (nicht DROP+ADD!). Antwort: **Yes, rename**. Ergebnis:

- `<NNNN>_<random_words>.sql` mit `ALTER TABLE "content_pages" RENAME COLUMN "display_order" TO "position";`
- `meta/<NNNN>_snapshot.json` (volles Schema-Snapshot mit umbenannter Spalte)
- Update an `meta/_journal.json` mit neuer entry.

Falls drizzle-kit als DROP+ADD generiert (nicht-interaktiver Modus oder falsche Antwort): das ist destruktiv (Datenverlust auf existing rows). Subagent muss escalate.

- [ ] **Step 3: Backend-Restart appliziert die Migration**

Backend ist vermutlich live (vom dev:all-Restore). Restart triggern:

```bash
# Backend-Watcher finden + kill (concurrently-Setup, parent npm darf bleiben)
ps aux | grep -E "tsx watch|node.*server" | grep -v grep
kill <pid>
# concurrently startet automatisch den Backend-Slot neu, oder:
pnpm dev:backend  # falls dev:all nicht läuft
```

Erwartete Logs:

```
[DB] Running migrations from .../apps/backend/src/db/migrations/postgres
[DB] All migrations applied successfully
```

Der `runMigrations()`-Pfad ist derselbe wie in T1.

- [ ] **Step 4: Verify**

```bash
psql "$DATABASE_URL" -c "\d content_pages" | grep -E "display_order|position"
psql "$DATABASE_URL" -c "SELECT slug, position FROM content_pages ORDER BY position;"
psql "$DATABASE_URL" -c "SELECT hash, to_timestamp(created_at / 1000) AS applied_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1;"
```

Erwartet:
- `\d`-Output zeigt `position | integer | not null | default 0`, KEIN `display_order` mehr.
- Daten erhalten: 6 rows mit sequential 0..5 (gleiche Reihenfolge wie nach T1).
- Letzter Tracker-Eintrag ist die neue Migration (SHA256 hash, NICHT der von T1).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts \
        apps/backend/src/db/migrations/postgres/<NNNN>_<random_words>.sql \
        apps/backend/src/db/migrations/postgres/meta/<NNNN>_snapshot.json \
        apps/backend/src/db/migrations/postgres/meta/_journal.json
git commit -m "Refactor: Rename content_pages.display_order to content_pages.position

- Aligns with the existing 'position' naming used by page_segments and nav_items
- Single ALTER TABLE RENAME COLUMN; row data preserved
- Drizzle schema field renamed to match"
```

(Concrete `<NNNN>_<random_words>` aus Step 2 substituieren.)

---

### Task 2: `listContentPageSummaries` ORDER BY auf `position` umstellen

> **Pragmatic approach (no TDD here):** existing `admin-content.test.ts` is mock-based (`vi.fn`-style), so the SQL ORDER BY can't be exercised through it. The available integration-test pattern (`*.integration.test.ts` with `describe.skipIf(!process.env.DATABASE_URL)`) would mean ~30 lines of setup for a 1-line SQL change. Subsequent tasks (T8 backend bulk-tests) cover the end-to-end behaviour. For T2 we ship the SQL edit + verify it via the real backend over `curl`.

**Files:**
- Modify: `apps/backend/src/db/adapters/postgres.ts:2551` (single line)

- [ ] **Step 1: ORDER BY in postgres.ts ändern**

In `apps/backend/src/db/adapters/postgres.ts:2551` ändern:

```diff
-       ORDER BY content_pages.created_at DESC`,
+       ORDER BY content_pages.position ASC, content_pages.created_at DESC`,
```

- [ ] **Step 2: Backend-Restart aufnehmen**

Backend-Watcher bekommt die Änderung via tsup hot-reload. Falls dev:all nicht läuft: `pnpm dev:backend`.

- [ ] **Step 3: Verify per curl**

Login holen + Pages-Liste fetch'en:

```bash
JWT=$(curl -sX POST http://localhost:4000/api/admin/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"<admin-email>","password":"<password>"}' | jq -r .token)

curl -s http://localhost:4000/api/admin/pages \
  -H "Authorization: Bearer $JWT" | jq '.[] | {slug, position}'
```

Erwartet: Response sortiert nach `position` ASC. Mit T1+T1b sind die `position`-Werte 0..5 (`help=0, privacy=1, imprint=2, services=3, about=4, info=5`). Erste Zeile in der Response: `slug=help, position=0`.

Falls die Reihenfolge anders ist: ORDER BY-Edit hat nicht gewirkt — Bundle-Reload prüfen, ggf. Backend-Restart erzwingen.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/db/adapters/postgres.ts
git commit -m "Feat: Order content pages by position, then created_at

- listContentPageSummaries returns segmented parents in admin-defined order
- created_at remains tiebreaker for pages with identical position"
```

---

## Phase 2 — Backend: Bulk-Endpoint

### Task 3: Shared-Type `PagesBulkRequest`

**Files:**
- Modify: `packages/shared/src/content.ts`

- [ ] **Step 1: Type ans File-Ende anhängen**

```ts
import type { Locale } from "./locales.js";
// (oben sicherstellen — ggf. existierender Import wiederverwenden)

export interface PagesBulkPagesEntry {
  slug: string;
  meta?: Partial<{
    title: string;
    slug: string;
    status: ContentStatus;
    displayMode: PageDisplayMode;
    overlayWidth: OverlayWidth;
    titleAlignment: PageTitleAlignment;
    contentCardStyle: ContentCardStyle;
    showTitle: boolean;
    pageType: PageType;
  }>;
  content?: string;
}

export interface PagesBulkSegmentsEntry {
  ownerSlug: string;
  segments: PageSegmentInput[];
}

export interface PagesBulkPageTranslationEntry {
  slug: string;
  locale: Locale;
  title?: string;
  content?: string;
  translationReady?: boolean;
}

export interface PagesBulkRequest {
  pages?: PagesBulkPagesEntry[];
  segments?: PagesBulkSegmentsEntry[];
  pageTranslations?: PagesBulkPageTranslationEntry[];
  topLevelOrder?: string[];
}

export interface PagesBulkResponse {
  pages: ContentPageSummary[];
}

export type PagesBulkErrorDetail = {
  section: "pages" | "segments" | "pageTranslations" | "topLevelOrder";
  index: number;
  message: string;
};
```

- [ ] **Step 2: In `packages/shared/src/index.ts` re-exportieren**

```bash
grep -n "from \"./content" packages/shared/src/index.ts
```

Sicherstellen, dass das `export *`/`export {…}` aus `./content.js` die neuen Types automatisch durchreicht (bei `export *` ist nichts zu tun; bei explizitem `export {…}` die neuen Namen ergänzen).

- [ ] **Step 3: Type-Check**

```bash
pnpm --filter @musiccloud/shared typecheck
```

Erwartet: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/content.ts packages/shared/src/index.ts
git commit -m "Feat: Add PagesBulkRequest types for atomic /admin/pages save

- Shared types for the new bulk endpoint payload
- Pages, segments, page translations, top-level order in one request"
```

---

### Task 4: `ENDPOINTS.admin.pages.bulk` + ROUTE_TEMPLATE

**Files:**
- Modify: `packages/shared/src/endpoints.ts:170-180` (admin.pages-Block in ENDPOINTS)
- Modify: `packages/shared/src/endpoints.ts:326-332` (ROUTE_TEMPLATES.admin.pages)

- [ ] **Step 1: ENDPOINTS-Block ergänzen**

Im `admin.pages`-Sub-Object (sucht ihr per `grep -n "pages:" packages/shared/src/endpoints.ts | head`) den `bulk`-Eintrag hinzufügen:

```ts
    pages: {
      list: "/api/admin/pages",
      detail: (slug: string) => `/api/admin/pages/${slug}`,
      bulk: "/api/admin/pages/bulk",
      translations: {
        list: (slug: string) => `/api/admin/pages/${slug}/translations`,
        detail: (slug: string, locale: string) => `/api/admin/pages/${slug}/translations/${locale}`,
      },
    },
```

(Die exakte Form von `list`/`detail`/`translations` ggf. an die bestehende Struktur anpassen — vorher `Read` der Datei.)

- [ ] **Step 2: ROUTE_TEMPLATE ergänzen**

```ts
    pages: {
      detail: "/api/admin/pages/:slug",
      bulk: "/api/admin/pages/bulk",
      translationsList: "/api/admin/pages/:slug/translations",
      translationsDetail: "/api/admin/pages/:slug/translations/:locale",
    },
```

- [ ] **Step 3: Build + Type-Check**

```bash
pnpm --filter @musiccloud/shared build
pnpm --filter @musiccloud/shared typecheck
```

Erwartet: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/endpoints.ts
git commit -m "Feat: Register /api/admin/pages/bulk endpoint constant

- ENDPOINTS.admin.pages.bulk for the new atomic save route
- ROUTE_TEMPLATES.admin.pages.bulk for Fastify path matching"
```

---

### Task 5: AdminRepository-Interface erweitern

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts:244-380` (interface AdminRepository)

- [ ] **Step 1: Methoden-Signatur hinzufügen**

Direkt unter `replaceSegmentsForOwner`-Zeile in `interface AdminRepository`:

```ts
  bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]>;
```

Plus Type-Definition oberhalb der Interface (oder im Types-Sektion des Files):

```ts
export interface BulkUpdatePagesPayload {
  pages: Array<{ slug: string; meta?: ContentPageMetaUpdate; content?: string }>;
  segments: Array<{ ownerSlug: string; segments: PageSegmentInputRow[] }>;
  pageTranslations: Array<{
    slug: string;
    locale: string;
    title?: string;
    content?: string;
    translationReady?: boolean;
  }>;
  topLevelOrder: string[];
}
```

(`pages`/`segments`/`pageTranslations`/`topLevelOrder` sind hier nicht-optional gemacht — der aufrufende Service normalisiert undefined → []. Vereinfacht den Adapter.)

- [ ] **Step 2: Type-Check**

```bash
pnpm --filter @musiccloud/backend typecheck
```

Erwartet: ein Fehler — `Postgres`-Adapter implementiert `bulkUpdatePages` noch nicht. Das ist beabsichtigt (Step 3 fügt Stub).

- [ ] **Step 3: Stub im Adapter**

In `apps/backend/src/db/adapters/postgres.ts` ans Ende der CONTENT-PAGES-Sektion:

```ts
async bulkUpdatePages(_payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
  throw new Error("not implemented");
}
```

- [ ] **Step 4: Type-Check passt**

```bash
pnpm --filter @musiccloud/backend typecheck
```

Erwartet: clean (Implementation kommt in Task 7).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/db/adapters/postgres.ts
git commit -m "Refactor: Add bulkUpdatePages signature to AdminRepository

- Interface declares the contract for atomic pages saves
- Postgres adapter has a throwing stub; implementation follows in next commit"
```

---

### Task 6: Service `admin-pages-bulk.ts` mit Validation

**Files:**
- Create: `apps/backend/src/services/admin-pages-bulk.ts`

- [ ] **Step 1: Service-File schreiben**

```ts
// apps/backend/src/services/admin-pages-bulk.ts
import type {
  PagesBulkRequest,
  PagesBulkErrorDetail,
  ContentPageSummary,
  PageSegmentInput,
} from "@musiccloud/shared";
import { isLocale, PAGE_TYPES } from "@musiccloud/shared";

import { getAdminRepository } from "../db/index.js";

export type BulkResult =
  | { ok: true; data: ContentPageSummary[] }
  | { ok: false; code: "INVALID_INPUT"; details: PagesBulkErrorDetail[] };

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export async function bulkUpdatePages(payload: PagesBulkRequest): Promise<BulkResult> {
  const repo = await getAdminRepository();

  // Snapshot existing slugs+pageTypes for cross-checks
  const existingPages = await repo.listContentPageSummaries();
  const bySlug = new Map(existingPages.map((p) => [p.slug, p]));

  const errors: PagesBulkErrorDetail[] = [];

  // 1) pages: meta + content
  (payload.pages ?? []).forEach((entry, idx) => {
    if (!bySlug.has(entry.slug)) {
      errors.push({ section: "pages", index: idx, message: `unknown page '${entry.slug}'` });
      return;
    }
    if (entry.meta?.slug !== undefined && entry.meta.slug !== entry.slug) {
      if (!SLUG_RE.test(entry.meta.slug)) {
        errors.push({ section: "pages", index: idx, message: "invalid slug pattern" });
      }
      if (bySlug.has(entry.meta.slug)) {
        errors.push({ section: "pages", index: idx, message: "target slug already exists" });
      }
    }
    if (entry.meta?.pageType !== undefined && !PAGE_TYPES.includes(entry.meta.pageType)) {
      errors.push({ section: "pages", index: idx, message: "invalid pageType" });
    }
  });

  // 2) segments: target validation
  (payload.segments ?? []).forEach((entry, idx) => {
    const owner = bySlug.get(entry.ownerSlug);
    if (!owner) {
      errors.push({ section: "segments", index: idx, message: `unknown owner '${entry.ownerSlug}'` });
      return;
    }
    // owner pageType is checked AFTER pages-meta is applied virtually:
    const futureType = pendingPageType(payload, entry.ownerSlug, owner.pageType);
    if (futureType !== "segmented") {
      errors.push({ section: "segments", index: idx, message: "owner is not segmented" });
    }
    entry.segments.forEach((s, sIdx) => {
      if (!s.label.trim()) {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] empty label` });
      }
      if (s.targetSlug === entry.ownerSlug) {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] self-reference` });
      }
      const target = bySlug.get(s.targetSlug);
      if (!target) {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] unknown target '${s.targetSlug}'` });
      } else if (pendingPageType(payload, s.targetSlug, target.pageType) !== "default") {
        errors.push({ section: "segments", index: idx, message: `segment[${sIdx}] target must be default` });
      }
    });
  });

  // 3) pageTranslations
  (payload.pageTranslations ?? []).forEach((entry, idx) => {
    if (!bySlug.has(entry.slug)) {
      errors.push({ section: "pageTranslations", index: idx, message: `unknown page '${entry.slug}'` });
    }
    if (!isLocale(entry.locale)) {
      errors.push({ section: "pageTranslations", index: idx, message: "invalid locale" });
    }
  });

  // 4) topLevelOrder
  if (payload.topLevelOrder) {
    payload.topLevelOrder.forEach((slug, idx) => {
      const p = bySlug.get(slug);
      if (!p) {
        errors.push({ section: "topLevelOrder", index: idx, message: `unknown page '${slug}'` });
      } else if (pendingPageType(payload, slug, p.pageType) !== "segmented") {
        errors.push({ section: "topLevelOrder", index: idx, message: "page is not segmented" });
      }
    });
  }

  if (errors.length > 0) return { ok: false, code: "INVALID_INPUT", details: errors };

  const summaries = await repo.bulkUpdatePages({
    pages: (payload.pages ?? []).map((p) => ({ slug: p.slug, meta: p.meta, content: p.content })),
    segments: (payload.segments ?? []).map((s) => ({
      ownerSlug: s.ownerSlug,
      segments: s.segments.slice().sort((a, b) => a.position - b.position).map((seg, i) => ({
        position: i,
        label: seg.label.trim(),
        targetSlug: seg.targetSlug,
        translations: seg.translations,
      })),
    })),
    pageTranslations: payload.pageTranslations ?? [],
    topLevelOrder: payload.topLevelOrder ?? [],
  });

  return { ok: true, data: summaries };
}

function pendingPageType(payload: PagesBulkRequest, slug: string, current: string): string {
  const pending = payload.pages?.find((p) => p.slug === slug)?.meta?.pageType;
  return pending ?? current;
}
```

- [ ] **Step 2: Type-Check**

```bash
pnpm --filter @musiccloud/backend typecheck
```

Erwartet: clean (`PageSegmentInputRow`-Type ist im admin-repository definiert; ggf. Adapter-Stub muss noch das richtige Typ-Mapping implementieren — kommt in Task 7).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/services/admin-pages-bulk.ts
git commit -m "Feat: Add admin-pages-bulk service with fail-fast validation

- Validates pages meta, segments targets, translations locale, top-level order
- Cross-checks rely on a virtual post-payload pageType lookup
- Returns structured PagesBulkErrorDetail[] on failure"
```

---

### Task 7: Postgres-Adapter `bulkUpdatePages` mit TX

**Files:**
- Modify: `apps/backend/src/db/adapters/postgres.ts` (Stub aus Task 5 ersetzen)

- [ ] **Step 1: Implementation schreiben**

Stub-Body durch ersetzen:

```ts
async bulkUpdatePages(payload: BulkUpdatePagesPayload): Promise<ContentPageSummaryRow[]> {
  const client = await this.pool.connect();
  try {
    await client.query("BEGIN");

    // 1) pages.meta + pages.content
    for (const p of payload.pages) {
      if (p.meta) {
        await this.applyMetaInTx(client, p.slug, p.meta);
      }
      if (p.content !== undefined) {
        await client.query(
          `UPDATE content_pages
              SET content = $2,
                  content_updated_at = NOW(),
                  updated_at = NOW()
            WHERE slug = $1`,
          [resolveSlugAfterRename(p), p.content],
        );
      }
    }

    // 2) topLevelOrder → position
    for (let i = 0; i < payload.topLevelOrder.length; i++) {
      await client.query(
        `UPDATE content_pages SET position = $2 WHERE slug = $1`,
        [payload.topLevelOrder[i], i],
      );
    }

    // 3) segments per owner — DELETE + INSERT
    for (const entry of payload.segments) {
      await client.query(
        `DELETE FROM page_segments WHERE owner_slug = $1`,
        [entry.ownerSlug],
      );
      for (const s of entry.segments) {
        await client.query(
          `INSERT INTO page_segments (owner_slug, target_slug, position, label, label_updated_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [entry.ownerSlug, s.targetSlug, s.position, s.label],
        );
      }
      // segment translations are handled by the existing replaceSegmentTranslations path
      // — call after re-fetching the just-inserted ids:
      const idRows = await client.query(
        `SELECT id, position FROM page_segments WHERE owner_slug = $1 ORDER BY position`,
        [entry.ownerSlug],
      );
      for (let i = 0; i < entry.segments.length; i++) {
        const persisted = idRows.rows[i];
        const input = entry.segments[i];
        if (!input.translations) continue;
        for (const [locale, label] of Object.entries(input.translations)) {
          if (typeof label !== "string" || label.length === 0) continue;
          await client.query(
            `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (segment_id, locale)
             DO UPDATE SET label = EXCLUDED.label, source_updated_at = EXCLUDED.source_updated_at`,
            [persisted.id, locale, label],
          );
        }
      }
    }

    // 4) page translations (UPSERT)
    for (const t of payload.pageTranslations) {
      await client.query(
        `INSERT INTO content_page_translations (slug, locale, title, content, translation_ready, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (slug, locale)
         DO UPDATE SET title = EXCLUDED.title,
                       content = EXCLUDED.content,
                       translation_ready = EXCLUDED.translation_ready,
                       updated_at = EXCLUDED.updated_at`,
        [t.slug, t.locale, t.title ?? null, t.content ?? null, t.translationReady ?? null],
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  // The service layer (admin-pages-bulk.ts) maps DB-row results to the public
  // ContentPageSummary DTO via getManagedContentPages(), so the adapter's
  // return value is unused. Return an empty array to honor the interface
  // signature without a redundant SELECT.
  return [];
}
```

Plus Helper privat unten:

```ts
private async applyMetaInTx(
  client: PoolClient,
  slug: string,
  meta: ContentPageMetaUpdate,
): Promise<void> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let p = 1;
  if (meta.title !== undefined) { setClauses.push(`title = $${p++}`); values.push(meta.title); }
  if (meta.slug !== undefined && meta.slug !== slug) { setClauses.push(`slug = $${p++}`); values.push(meta.slug); }
  if (meta.status !== undefined) { setClauses.push(`status = $${p++}`); values.push(meta.status); }
  if (meta.showTitle !== undefined) { setClauses.push(`show_title = $${p++}`); values.push(meta.showTitle); }
  if (meta.titleAlignment !== undefined) { setClauses.push(`title_alignment = $${p++}`); values.push(meta.titleAlignment); }
  if (meta.pageType !== undefined) { setClauses.push(`page_type = $${p++}`); values.push(meta.pageType); }
  if (meta.displayMode !== undefined) { setClauses.push(`display_mode = $${p++}`); values.push(meta.displayMode); }
  if (meta.overlayWidth !== undefined) { setClauses.push(`overlay_width = $${p++}`); values.push(meta.overlayWidth); }
  if (meta.contentCardStyle !== undefined) { setClauses.push(`content_card_style = $${p++}`); values.push(meta.contentCardStyle); }
  if (setClauses.length === 0) return;
  setClauses.push(`updated_at = NOW()`);
  values.push(slug);
  await client.query(
    `UPDATE content_pages SET ${setClauses.join(", ")} WHERE slug = $${p}`,
    values,
  );
  // segmented → default transition: clear orphan segments (existing behaviour)
  if (meta.pageType === "default") {
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [meta.slug ?? slug]);
  }
}
```

Plus `resolveSlugAfterRename` Helper:

```ts
function resolveSlugAfterRename(p: { slug: string; meta?: ContentPageMetaUpdate }): string {
  return p.meta?.slug ?? p.slug;
}
```

- [ ] **Step 2: Imports prüfen**

`PoolClient` aus `pg` importieren falls noch nicht; `BulkUpdatePagesPayload`, `ContentPageMetaUpdate` aus admin-repository importieren.

- [ ] **Step 3: Type-Check**

```bash
pnpm --filter @musiccloud/backend typecheck
```

Erwartet: clean.

- [ ] **Step 4: Commit (Tests folgen in Task 8)**

```bash
git add apps/backend/src/db/adapters/postgres.ts
git commit -m "Feat: Implement bulkUpdatePages with single Postgres transaction

- Pages meta + content, top-level order, segments, page translations in one TX
- Slug-rename runs first so cascading FK references stay consistent
- Segment translations re-keyed via post-INSERT id lookup"
```

---

### Task 7b: Audit-Felder + Segment-Translations im Bulk-Pfad

> **Hintergrund:** T7-Subagent hat drei Drifts gegen das existing per-Resource-Verhalten aufgedeckt: (1) `applyMetaInTx` stampt kein `updated_by`, (2) `content_page_translations`-UPSERT stampt weder `updated_by` noch `source_updated_at`, (3) Segment-Locale-Labels wurden im Bulk-Pfad gar nicht persistiert (T6 droppt `translations` weil `PageSegmentInputRow` kein solches Feld hat; T7 hat den Loop deshalb auskommentiert). Plus latenter Bug: `content_page_translations.title` ist NOT NULL aber Bulk-UPSERT erlaubt `t.title ?? null`. T7b schließt diese Lücken.

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts` (`PageSegmentInputRow`, `BulkUpdatePagesPayload`)
- Modify: `apps/backend/src/services/admin-pages-bulk.ts` (Signatur + Validator + Mapping)
- Modify: `apps/backend/src/db/adapters/postgres.ts` (`applyMetaInTx`, `pageTranslations`-UPSERT, segment-translations-Loop)

- [ ] **Step 1: `PageSegmentInputRow` um `translations` erweitern**

In `apps/backend/src/db/admin-repository.ts:201-205`:

```ts
export interface PageSegmentInputRow {
  position: number;
  label: string;
  targetSlug: string;
  translations?: Partial<Record<string, string>>;
}
```

(Locale-keyed; `string` als Index passt zu `Locale` ohne unnötigen Import.)

- [ ] **Step 2: `BulkUpdatePagesPayload.pageTranslations` um `updatedBy` erweitern**

```ts
export interface BulkUpdatePagesPayload {
  pages: Array<{ slug: string; meta?: ContentPageMetaUpdate; content?: string }>;
  segments: Array<{ ownerSlug: string; segments: PageSegmentInputRow[] }>;
  pageTranslations: Array<{
    slug: string;
    locale: string;
    title?: string;
    content?: string;
    translationReady?: boolean;
    updatedBy?: string | null;
  }>;
  topLevelOrder: string[];
}
```

- [ ] **Step 3: Service-Signatur + Validator + Mapping**

In `apps/backend/src/services/admin-pages-bulk.ts`. Funktions-Signatur:

```ts
export interface BulkUpdateOpts {
  updatedBy: string | null;
}

export async function bulkUpdatePages(
  payload: PagesBulkRequest,
  opts: BulkUpdateOpts,
): Promise<BulkResult> {
  // ... validator unchanged ...
}
```

**Validator-Add** im pageTranslations-Loop (vorhandene Sektion `// 3) pageTranslations`):

```ts
if (entry.title === undefined || entry.title === null || entry.title === "") {
  errors.push({ section: "pageTranslations", index: idx, message: "title is required" });
}
```

(Hintergrund: `content_page_translations.title` ist NOT NULL — siehe `apps/backend/src/db/schemas/postgres.ts` `contentPageTranslations`-Block.)

**Adapter-Mapping ersetzen** (im success-Path beim `repo.bulkUpdatePages`-Aufruf):

```ts
await repo.bulkUpdatePages({
  pages: (payload.pages ?? []).map((p) => ({
    slug: p.slug,
    meta: p.meta
      ? ({ ...(p.meta as ContentPageMetaUpdate), updatedBy: opts.updatedBy } as ContentPageMetaUpdate)
      : undefined,
    content: p.content,
  })),
  segments: (payload.segments ?? []).map((s) => ({
    ownerSlug: s.ownerSlug,
    segments: s.segments
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((seg, i) => ({
        position: i,
        label: seg.label.trim(),
        targetSlug: seg.targetSlug,
        ...(seg.translations ? { translations: seg.translations } : {}),
      })),
  })),
  pageTranslations: (payload.pageTranslations ?? []).map((t) => ({
    ...t,
    updatedBy: opts.updatedBy,
  })),
  topLevelOrder: payload.topLevelOrder ?? [],
});
```

- [ ] **Step 4: Adapter `applyMetaInTx` stampt `updated_by`**

In `apps/backend/src/db/adapters/postgres.ts`, `applyMetaInTx`-Helper. Direkt nach dem `if (meta.contentCardStyle !== undefined) { … }`-Block einfügen:

```ts
if (meta.updatedBy !== undefined) {
  setClauses.push(`updated_by = $${p++}`);
  values.push(meta.updatedBy);
}
```

- [ ] **Step 5: Adapter `pageTranslations`-UPSERT stampt `updated_by` + `source_updated_at`**

UPSERT-Statement aus T7 (Phase 4 in `bulkUpdatePages`) ändern auf:

```ts
await client.query(
  `INSERT INTO content_page_translations
     (slug, locale, title, content, translation_ready, updated_at, updated_by, source_updated_at)
   VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW())
   ON CONFLICT (slug, locale)
   DO UPDATE SET title = EXCLUDED.title,
                 content = EXCLUDED.content,
                 translation_ready = EXCLUDED.translation_ready,
                 updated_at = EXCLUDED.updated_at,
                 updated_by = EXCLUDED.updated_by,
                 source_updated_at = EXCLUDED.source_updated_at`,
  [t.slug, t.locale, t.title ?? null, t.content ?? null, t.translationReady ?? null, t.updatedBy ?? null],
);
```

Spalten-Namen vorher in `apps/backend/src/db/schemas/postgres.ts` (`contentPageTranslations`-Definition) verifizieren.

- [ ] **Step 6: Segment-Translations-Loop re-aktivieren**

In `bulkUpdatePages` Phase 3 (segments per owner): T7-Subagent hat diesen inneren Loop auskommentiert. Re-aktivieren:

```ts
for (let i = 0; i < entry.segments.length; i++) {
  const persisted = idRows.rows[i];
  const input = entry.segments[i];
  if (!input.translations) continue;
  for (const [locale, label] of Object.entries(input.translations)) {
    if (typeof label !== "string" || label.length === 0) continue;
    await client.query(
      `INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (segment_id, locale)
       DO UPDATE SET label = EXCLUDED.label, source_updated_at = EXCLUDED.source_updated_at`,
      [persisted.id, locale, label],
    );
  }
}
```

- [ ] **Step 7: Type-Check**

```bash
pnpm --filter @musiccloud/backend typecheck
pnpm --filter @musiccloud/shared typecheck
pnpm --filter @musiccloud/dashboard typecheck
```

Alle drei clean.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts \
        apps/backend/src/services/admin-pages-bulk.ts \
        apps/backend/src/db/adapters/postgres.ts
git commit -m "Feat: Stamp audit fields + persist segment translations in bulk pages save

- Repository payload carries updatedBy for pageTranslations entries
- PageSegmentInputRow gains optional translations for bulk persistence
- applyMetaInTx writes updated_by; page-translation UPSERT writes updated_by + source_updated_at
- Segment-translations loop reactivated; bulk path no longer drops locale labels
- Validator requires non-empty title for pageTranslations entries"
```

> Hinweis für T9 (Route): der Route-Handler ruft `bulkUpdatePages(body, { updatedBy: req.user.id })` auf. T9-Plan-Body wird beim T9-Dispatch entsprechend angepasst.

---

### Task 8: Backend-Tests `admin-pages-bulk.test.ts`

**Files:**
- Create: `apps/backend/src/__tests__/admin-pages-bulk.route.test.ts`

> **Pattern:** musiccloud nutzt Fastify `app.inject()` + `vi.mock()` für Service-Layer (siehe `admin-page-translations.route.test.ts`). KEIN supertest, KEINE echte Test-DB, KEIN `buildApp()`. Das schließt einen echten TX-rollback-Test aus — der ist Postgres-Verhalten und nur via `*.integration.test.ts` mit `describe.skipIf(!process.env.DATABASE_URL)` testbar (siehe `page-translations-repo.integration.test.ts`). Wir testen hier die Route-Layer (Auth-Mock, Service-Aufruf, Status-Codes, Response-Shape). Plan-Spec-Tabelle Case 5 (TX-rollback) wird als „Service-throw → Route gibt 500" simuliert; echter Postgres-Rollback ist im Adapter-Code (`try/COMMIT/catch/ROLLBACK`) durch Code-Reading verifiziert.

- [ ] **Step 1: Test-Skeleton mit Mock-Pattern**

```ts
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ROUTE_TEMPLATES } from "@musiccloud/shared";

import { registerAdminContentRoutes } from "../routes/admin-content.js";
import * as bulk from "../services/admin-pages-bulk.js";

vi.mock("../services/admin-pages-bulk.js", () => ({
  bulkUpdatePages: vi.fn(),
}));

function buildTestApp() {
  const app = Fastify();
  app.addHook("preHandler", (req, _res, done) => {
    (req as unknown as { user: unknown }).user = { sub: "admin-1" };
    done();
  });
  registerAdminContentRoutes(app);
  return app;
}

const route = ROUTE_TEMPLATES.admin.pages.bulk;
const summary = {
  slug: "info",
  title: "Information",
  status: "draft",
  pageType: "segmented",
  position: 0,
  /* …weitere Felder werden im Test je nach Assertion eingefügt; minimal-set hier reicht
   * weil Asserts auf Felder dieser Snapshot-Liste schauen */
} as never;
```

- [ ] **Step 2: Test-Cases (mock-driven)**

```ts
describe("PUT /admin/pages/bulk", () => {
  beforeEach(() => {
    vi.mocked(bulk.bulkUpdatePages).mockReset();
  });

  it("pages-only meta update: forwards payload, returns 200 with pages", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({
      ok: true,
      data: [{ ...summary, title: "Information" }],
    });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pages: [{ slug: "info", meta: { title: "Information" } }] },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pages[0].title).toBe("Information");
    expect(bulk.bulkUpdatePages).toHaveBeenCalledWith(
      expect.objectContaining({ pages: [{ slug: "info", meta: { title: "Information" } }] }),
      expect.objectContaining({ updatedBy: "admin-1" }),
    );
  });

  it("cross-owner segment move: forwards segments[] correctly", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: {
        segments: [
          { ownerSlug: "help", segments: [] },
          { ownerSlug: "info", segments: [{ position: 0, label: "Privacy", targetSlug: "privacy" }] },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const arg = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]![0];
    expect(arg.segments).toHaveLength(2);
    expect(arg.segments![0].ownerSlug).toBe("help");
    expect(arg.segments![1].segments[0].targetSlug).toBe("privacy");
  });

  it("top-level reorder: forwards topLevelOrder", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { topLevelOrder: ["info", "help"] },
    });
    expect(res.statusCode).toBe(200);
    const arg = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]![0];
    expect(arg.topLevelOrder).toEqual(["info", "help"]);
  });

  it("full mixed payload: forwards all four sections + opts.updatedBy", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [summary] });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: {
        pages: [{ slug: "info", meta: { title: "Info v2" }, content: "# Info v2" }],
        segments: [{ ownerSlug: "info", segments: [{ position: 0, label: "Privacy", targetSlug: "privacy" }] }],
        pageTranslations: [{ slug: "info", locale: "de", title: "Information", translationReady: true }],
        topLevelOrder: ["info", "help"],
      },
    });
    expect(res.statusCode).toBe(200);
    const [body, opts] = vi.mocked(bulk.bulkUpdatePages).mock.calls[0]!;
    expect(body.pages).toHaveLength(1);
    expect(body.segments).toHaveLength(1);
    expect(body.pageTranslations).toHaveLength(1);
    expect(body.topLevelOrder).toEqual(["info", "help"]);
    expect(opts).toEqual({ updatedBy: "admin-1" });
  });

  it("partial-fail (TX-rollback): service throws → route returns 500", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockRejectedValue(new Error("DB error"));
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pages: [{ slug: "info", meta: { title: "x" } }] },
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(500);
  });

  it("validation 400 + details[]: service returns INVALID_INPUT", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({
      ok: false,
      code: "INVALID_INPUT",
      details: [{ section: "pageTranslations", index: 0, message: "invalid locale" }],
    });
    const app = buildTestApp();
    const res = await app.inject({
      method: "PUT",
      url: route,
      payload: { pageTranslations: [{ slug: "info", locale: "xx", title: "x" }] },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("INVALID_INPUT");
    expect(body.details).toHaveLength(1);
    expect(body.details[0].section).toBe("pageTranslations");
  });

  it("empty payload → 200 noop", async () => {
    vi.mocked(bulk.bulkUpdatePages).mockResolvedValue({ ok: true, data: [] });
    const app = buildTestApp();
    const res = await app.inject({ method: "PUT", url: route, payload: {} });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 3: Tests laufen (alle FAIL, Route fehlt)**

```bash
npx vitest run apps/backend/src/__tests__/admin-pages-bulk.route.test.ts
```

Erwartet: 7 FAIL — Endpoint 404 (Route noch nicht registriert in `admin-content.ts`). Das ist beabsichtigt; T9 wired die Route.

- [ ] **Step 4: Commit (Route-Registrierung folgt in Task 9)**

```bash
git add apps/backend/src/__tests__/admin-pages-bulk.route.test.ts
git commit -m "Test: Add failing route tests for /admin/pages/bulk

- Mock service layer; exercise auth wiring + payload forwarding + status codes
- Cases: pages-only, cross-owner segments, top-level reorder, full mixed,
  service-throw (TX-rollback proxy), INVALID_INPUT details, empty noop
- Tests fail until Task 9 registers the route handler"
```

---

### Task 9: Route `PUT /admin/pages/bulk` registrieren

> Note: Plan-T9 originally called `bulkUpdatePages(payload)` without opts. T7b changed the service signature to `bulkUpdatePages(payload, { updatedBy })`. T9 must read the caller id (`getCallerId(request)`, existing helper at `admin-content.ts:28-31`) and pass it through.

**Files:**
- Modify: `apps/backend/src/routes/admin-content.ts` (default-export `adminContentRoutes` plugin)

- [ ] **Step 1: Route hinzufügen**

Im `adminContentRoutes`-Plugin-Body, nach den existierenden `pages.detail`-Handlers ergänzen:

```ts
import { bulkUpdatePages } from "../services/admin-pages-bulk.js";
import type { PagesBulkRequest } from "@musiccloud/shared";

// inside adminContentRoutes(app):
app.put(ROUTE_TEMPLATES.admin.pages.bulk, async (request, reply) => {
  const updatedBy = getCallerId(request);
  const result = await bulkUpdatePages(request.body as PagesBulkRequest, { updatedBy });
  if (!result.ok) {
    return reply.status(400).send({ error: result.code, details: result.details });
  }
  return reply.send({ pages: result.data });
});
```

`getCallerId` is the existing helper in the same file (`admin-content.ts:28-31`); reuse it (no new import needed; it's already in scope).

(Bestehende Auth-Middleware-Conventions des Files prüfen — falls Routes per `app.register(plugin, { prefix: ... })` o.ä. eingehängt sind, anpassen.)

- [ ] **Step 2: Tests laufen**

```bash
npx vitest run apps/backend/src/__tests__/admin-pages-bulk.test.ts
```

Erwartet: 7 PASS.

- [ ] **Step 3: Bestehende Suite weiterhin grün**

```bash
npx vitest run apps/backend
```

Erwartet: 0 FAIL.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/routes/admin-content.ts
git commit -m "Feat: Wire PUT /api/admin/pages/bulk route handler

- Delegates to bulkUpdatePages service
- Returns 400 + structured details on INVALID_INPUT, 200 + pages on success"
```

---

## Phase 2.5 — Dashboard: Test-Infrastruktur

### Task 9.5: Vitest + Testing-Library im Dashboard-Workspace

> **Hintergrund:** T10-Subagent hat aufgedeckt, dass der Dashboard-Workspace KEINE Test-Infrastruktur hat: `apps/dashboard/package.json` listet kein `vitest`/`jsdom`/`@testing-library/*`, hat kein `test`-Script, und `apps/dashboard/vitest.config.*` existiert nicht. Plan-Tasks T10-T18 sowie diverse Phase 4/5/6 component tests verlassen sich auf nicht-existente Infrastruktur. T9.5 schließt diese Lücke einmal, BEVOR T10 retried wird. Das Pattern matched 1:1 das existing Backend-Setup (`apps/backend/vitest.config.ts`, `vitest@^1.6.1`, `test`/`test:run`-Scripts).

> **Pre-Condition:** Monorepo läuft seit dem pnpm-Migration-Commit auf pnpm. Befehle nutzen `pnpm`/`pnpm --filter`, nicht `npm install --workspace=...`.

**Files:**
- Modify: `apps/dashboard/package.json` (devDependencies + scripts)
- Create: `apps/dashboard/vitest.config.ts`
- Create: `apps/dashboard/src/test-setup.ts`
- Modify: `apps/dashboard/tsconfig.json` (`compilerOptions.types`)

- [ ] **Step 1: devDependencies hinzufügen**

```bash
pnpm add --filter @musiccloud/dashboard --save-dev \
  vitest@^1.6.1 \
  jsdom@^25 \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  @testing-library/user-event@^14
```

`vitest@^1.6.1` matched die Version im Backend-Workspace (`apps/backend/package.json`). `@testing-library/react@^16` ist die erste Major mit React-19-Support. `jsdom@^25` ist kompatibel mit vitest 1.6.

- [ ] **Step 2: `apps/dashboard/vitest.config.ts` schreiben**

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Pattern matched `apps/backend/vitest.config.ts` 1:1, nur `environment: "jsdom"` (statt `"node"`) und `setupFiles` zeigt auf den jest-dom-Import.

- [ ] **Step 3: `apps/dashboard/src/test-setup.ts` schreiben**

```ts
import "@testing-library/jest-dom/vitest";
```

(Der `/vitest`-Suffix registriert die jest-dom-Matchers gegen `vitest.expect` ohne globalen `expect.extend`-Aufruf.)

- [ ] **Step 4: Scripts in `apps/dashboard/package.json`**

Im `scripts`-Block ergänzen (analog Backend):

```json
"test": "vitest",
"test:run": "vitest run",
```

Der existing Workspace-Root-Script `pnpm test:run` (root `package.json`) ruft `pnpm -r --if-present test:run` auf — Dashboard kommt damit automatisch in die globale Suite.

- [ ] **Step 5: `apps/dashboard/tsconfig.json` `types` ergänzen**

`compilerOptions` um `types`-Array erweitern (oder bestehendes Array erweitern):

```json
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

Damit `expect`/`describe`/`it`/`vi` und die DOM-Matchers (`toBeInTheDocument`, etc.) ohne Imports typisiert sind.

- [ ] **Step 6: Smoke-Test auf existing dirtyRegistry-File**

Die Subagent-Files aus dem T10-Vorlauf (`apps/dashboard/src/features/content/state/dirtyRegistry.ts` + `__tests__/dirtyRegistry.test.ts`) sind bereits da (uncommitted). Lauffähig prüfen:

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/dirtyRegistry.test.ts
```

Erwartet: 4/4 PASS (add/delete/has, subscribe, groupCount, clear). Falls FAIL aus Test-Logic-Gründen: hier nicht fixen, das ist T10-Scope. T9.5 ist fertig sobald vitest die Datei findet, lädt, und `expect` etc. ohne Type-Errors auflöst.

- [ ] **Step 7: Backend-Suite + Typecheck-Regression-Check**

```bash
pnpm --filter @musiccloud/backend test:run
pnpm --filter @musiccloud/dashboard typecheck
pnpm --filter @musiccloud/backend typecheck
pnpm --filter @musiccloud/shared typecheck
```

Alle clean (devdep-Installation darf das Workspace-Build nicht brechen).

- [ ] **Step 8: Commit (T10-Files bleiben uncommitted für T10-Retry)**

```bash
git add apps/dashboard/package.json \
        apps/dashboard/vitest.config.ts \
        apps/dashboard/src/test-setup.ts \
        apps/dashboard/tsconfig.json \
        pnpm-lock.yaml
git commit -m "Feat: Add Vitest + Testing-Library setup to dashboard workspace

- vitest@1.6.1 + jsdom@25 + @testing-library/{react,jest-dom,user-event}
- vitest.config.ts mirrors backend pattern with jsdom environment
- test/test:run scripts wire dashboard into the workspace-root pnpm test:run
- tsconfig types include vitest/globals + jest-dom for typed assertions"
```

> Hinweis: T10's existing uncommitted `dirtyRegistry.ts` + Test bleiben außerhalb dieses Commits — T10 (`Feat: Add dirty registry…`) committet sie separat sobald infra steht.

---

## Phase 3 — Dashboard: State-Layer

### Task 10: `dirtyRegistry.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/dirtyRegistry.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/dirtyRegistry.test.ts`

- [ ] **Step 1: Failing Test schreiben**

```ts
// __tests__/dirtyRegistry.test.ts
import { describe, expect, it, vi } from "vitest";
import { createDirtyRegistry } from "../dirtyRegistry";

describe("dirtyRegistry", () => {
  it("add/delete/has", () => {
    const r = createDirtyRegistry();
    r.add("content:info");
    expect(r.has("content:info")).toBe(true);
    r.delete("content:info");
    expect(r.has("content:info")).toBe(false);
  });

  it("subscribe is called on add and delete", () => {
    const r = createDirtyRegistry();
    const fn = vi.fn();
    r.subscribe(fn);
    r.add("a");
    r.delete("a");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("groupCount: distinct resource buckets", () => {
    const r = createDirtyRegistry();
    r.add("content:info");
    r.add("meta:info");
    r.add("segments:help");
    r.add("sidebar");
    r.add("translations:info");
    expect(r.groupCount()).toBe(4); // pages, segments, sidebar, translations
  });

  it("clear()", () => {
    const r = createDirtyRegistry();
    r.add("a"); r.add("b"); r.clear();
    expect(r.size()).toBe(0);
  });
});
```

- [ ] **Step 2: Test laufen (FAIL)**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/dirtyRegistry.test.ts
```

Erwartet: FAIL — Module nicht existent.

- [ ] **Step 3: Implementation**

```ts
// dirtyRegistry.ts
export type SliceKey =
  | "sidebar"
  | `meta:${string}`
  | `content:${string}`
  | `segments:${string}`
  | `translations:${string}`
  | `segment-translations:${string}`;

export type ResourceGroup = "pages" | "segments" | "translations" | "sidebar";

function groupOf(key: SliceKey): ResourceGroup {
  if (key === "sidebar") return "sidebar";
  if (key.startsWith("meta:") || key.startsWith("content:")) return "pages";
  if (key.startsWith("segments:")) return "segments";
  return "translations";
}

export interface DirtyRegistry {
  add(key: SliceKey): void;
  delete(key: SliceKey): void;
  has(key: SliceKey): boolean;
  size(): number;
  clear(): void;
  groupCount(): number;
  subscribe(fn: () => void): () => void;
}

export function createDirtyRegistry(): DirtyRegistry {
  const set = new Set<SliceKey>();
  const subs = new Set<() => void>();
  const notify = () => subs.forEach((fn) => fn());
  return {
    add(k) { if (!set.has(k)) { set.add(k); notify(); } },
    delete(k) { if (set.delete(k)) notify(); },
    has(k) { return set.has(k); },
    size() { return set.size; },
    clear() { if (set.size > 0) { set.clear(); notify(); } },
    groupCount() {
      const g = new Set<ResourceGroup>();
      set.forEach((k) => g.add(groupOf(k)));
      return g.size;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
```

- [ ] **Step 4: Test passt**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/dirtyRegistry.test.ts
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/content/state/dirtyRegistry.ts apps/dashboard/src/features/content/state/__tests__/dirtyRegistry.test.ts
git commit -m "Feat: Add dirty registry for /admin/pages global save tracking

- SliceKey union maps to four resource groups for the save-button counter
- Tiny pub/sub so PagesSaveBar can re-render on dirty changes"
```

---

### Task 11: `sidebarSlice.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/slices/sidebarSlice.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/slices/sidebarSlice.test.ts`

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { sidebarReducer, isDirty } from "../../slices/sidebarSlice";

describe("sidebarSlice", () => {
  it("initial state is clean", () => {
    const s = sidebarReducer({ initial: ["info", "help"], current: ["info", "help"] }, { type: "noop" } as never);
    expect(isDirty(s)).toBe(false);
  });

  it("reorder-top-level becomes dirty", () => {
    const s0 = { initial: ["info", "help"], current: ["info", "help"] };
    const s1 = sidebarReducer(s0, { type: "reorder-top-level", from: 0, to: 1 });
    expect(s1.current).toEqual(["help", "info"]);
    expect(isDirty(s1)).toBe(true);
  });

  it("reorder back to initial becomes clean", () => {
    const s0 = { initial: ["info", "help"], current: ["info", "help"] };
    const s1 = sidebarReducer(s0, { type: "reorder-top-level", from: 0, to: 1 });
    const s2 = sidebarReducer(s1, { type: "reorder-top-level", from: 0, to: 1 });
    expect(s2.current).toEqual(s0.initial);
    expect(isDirty(s2)).toBe(false);
  });

  it("hydrate sets initial = current = next", () => {
    const s = sidebarReducer({ initial: [], current: [] }, { type: "hydrate", topLevelOrder: ["a", "b"] });
    expect(s.initial).toEqual(["a", "b"]);
    expect(s.current).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/sidebarSlice.test.ts
```

- [ ] **Step 3: Implementation**

```ts
// sidebarSlice.ts
import { arrayMove } from "@dnd-kit/sortable";

export interface SidebarState {
  initial: string[];
  current: string[];
}

export type SidebarAction =
  | { type: "hydrate"; topLevelOrder: string[] }
  | { type: "reorder-top-level"; from: number; to: number }
  | { type: "reset" };

export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "hydrate":
      return { initial: action.topLevelOrder, current: action.topLevelOrder };
    case "reorder-top-level":
      return { ...state, current: arrayMove(state.current, action.from, action.to) };
    case "reset":
      return { ...state, current: state.initial };
    default:
      return state;
  }
}

export function isDirty(s: SidebarState): boolean {
  if (s.initial.length !== s.current.length) return true;
  for (let i = 0; i < s.initial.length; i++) if (s.initial[i] !== s.current[i]) return true;
  return false;
}
```

- [ ] **Step 4: PASS**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/sidebarSlice.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/content/state/slices/sidebarSlice.ts apps/dashboard/src/features/content/state/__tests__/slices/sidebarSlice.test.ts
git commit -m "Feat: Add sidebarSlice for top-level page order

- initial/current snapshot pattern for dirty detection
- arrayMove from @dnd-kit/sortable keeps reorder semantics consistent"
```

---

### Task 12: `metaSlice.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/slices/metaSlice.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/slices/metaSlice.test.ts`

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { metaReducer, dirtySlugs } from "../../slices/metaSlice";

describe("metaSlice", () => {
  it("hydrate seeds initial+current", () => {
    const s = metaReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", meta: { title: "Info" } as any }] });
    expect(s.pages.info.current.title).toBe("Info");
    expect(dirtySlugs(s)).toEqual([]);
  });

  it("set-field marks dirty", () => {
    const s0 = metaReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", meta: { title: "Info" } as any }] });
    const s1 = metaReducer(s0, { type: "set-field", slug: "info", field: "title", value: "Information" });
    expect(s1.pages.info.current.title).toBe("Information");
    expect(dirtySlugs(s1)).toEqual(["info"]);
  });

  it("setting back to initial clears dirty", () => {
    const s0 = metaReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", meta: { title: "Info" } as any }] });
    const s1 = metaReducer(s0, { type: "set-field", slug: "info", field: "title", value: "X" });
    const s2 = metaReducer(s1, { type: "set-field", slug: "info", field: "title", value: "Info" });
    expect(dirtySlugs(s2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implementation**

```ts
// metaSlice.ts
import type { ContentPage } from "@musiccloud/shared";

type MetaFields = Pick<
  ContentPage,
  | "title" | "slug" | "status" | "showTitle" | "titleAlignment"
  | "pageType" | "displayMode" | "overlayWidth" | "contentCardStyle"
>;

export interface MetaState {
  pages: Record<string, { initial: MetaFields; current: MetaFields }>;
}

export type MetaAction =
  | { type: "hydrate"; entries: Array<{ slug: string; meta: MetaFields }> }
  | { type: "set-field"; slug: string; field: keyof MetaFields; value: MetaFields[keyof MetaFields] }
  | { type: "reset" };

export function metaReducer(state: MetaState, action: MetaAction): MetaState {
  switch (action.type) {
    case "hydrate": {
      const pages: MetaState["pages"] = {};
      for (const e of action.entries) pages[e.slug] = { initial: e.meta, current: e.meta };
      return { pages };
    }
    case "set-field": {
      const entry = state.pages[action.slug];
      if (!entry) return state;
      const next = { ...entry.current, [action.field]: action.value };
      return { ...state, pages: { ...state.pages, [action.slug]: { ...entry, current: next } } };
    }
    case "reset":
      return { pages: Object.fromEntries(Object.entries(state.pages).map(([k, v]) => [k, { ...v, current: v.initial }])) };
    default:
      return state;
  }
}

export function dirtySlugs(s: MetaState): string[] {
  return Object.entries(s.pages)
    .filter(([, v]) => !shallowEqual(v.initial, v.current))
    .map(([k]) => k);
}

function shallowEqual<T extends object>(a: T, b: T): boolean {
  for (const k of Object.keys(a) as Array<keyof T>) if (a[k] !== b[k]) return false;
  for (const k of Object.keys(b) as Array<keyof T>) if (a[k] !== b[k]) return false;
  return true;
}
```

- [ ] **Step 4: PASS**

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/content/state/slices/metaSlice.ts apps/dashboard/src/features/content/state/__tests__/slices/metaSlice.test.ts
git commit -m "Feat: Add metaSlice for per-page meta (title, slug, status, …)

- Per-slug initial/current snapshot
- Reverting to initial value clears dirty marker"
```

---

### Task 13: `contentSlice.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/slices/contentSlice.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/slices/contentSlice.test.ts`

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { contentReducer, dirtySlugs } from "../../slices/contentSlice";

describe("contentSlice", () => {
  it("edit + revert", () => {
    const s0 = contentReducer({ pages: {} }, { type: "hydrate", entries: [{ slug: "info", content: "# A" }] });
    const s1 = contentReducer(s0, { type: "set", slug: "info", value: "# B" });
    expect(dirtySlugs(s1)).toEqual(["info"]);
    const s2 = contentReducer(s1, { type: "set", slug: "info", value: "# A" });
    expect(dirtySlugs(s2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/contentSlice.test.ts
```

Erwartet: FAIL — Module nicht existent.

- [ ] **Step 3: Implementation**

```ts
// contentSlice.ts
export interface ContentState {
  pages: Record<string, { initial: string; current: string }>;
}

export type ContentAction =
  | { type: "hydrate"; entries: Array<{ slug: string; content: string }> }
  | { type: "set"; slug: string; value: string }
  | { type: "reset" };

export function contentReducer(state: ContentState, action: ContentAction): ContentState {
  switch (action.type) {
    case "hydrate": {
      const pages: ContentState["pages"] = {};
      for (const e of action.entries) pages[e.slug] = { initial: e.content, current: e.content };
      return { pages };
    }
    case "set": {
      const entry = state.pages[action.slug];
      if (!entry) return { pages: { ...state.pages, [action.slug]: { initial: "", current: action.value } } };
      return { pages: { ...state.pages, [action.slug]: { ...entry, current: action.value } } };
    }
    case "reset":
      return { pages: Object.fromEntries(Object.entries(state.pages).map(([k, v]) => [k, { ...v, current: v.initial }])) };
    default:
      return state;
  }
}

export function dirtySlugs(s: ContentState): string[] {
  return Object.entries(s.pages).filter(([, v]) => v.initial !== v.current).map(([k]) => k);
}
```

- [ ] **Step 4: PASS**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/contentSlice.test.ts
```

Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/content/state/slices/contentSlice.ts apps/dashboard/src/features/content/state/__tests__/slices/contentSlice.test.ts
git commit -m "Feat: Add contentSlice for per-page markdown content

- initial/current snapshot per slug
- string equality is sufficient (no deep compare needed)"
```

---

### Task 14: `segmentsSlice.ts` + Tests (cross-owner ist der wichtige Case)

**Files:**
- Create: `apps/dashboard/src/features/content/state/slices/segmentsSlice.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/slices/segmentsSlice.test.ts`

- [ ] **Step 1: Failing Tests** (mehrere)

```ts
import { describe, expect, it } from "vitest";
import { segmentsReducer, dirtyOwners } from "../../slices/segmentsSlice";

describe("segmentsSlice", () => {
  const seed = { byOwner: {
    info: { initial: [{ position: 0, label: "Help", targetSlug: "help" }], current: [{ position: 0, label: "Help", targetSlug: "help" }] },
    help: { initial: [{ position: 0, label: "Privacy", targetSlug: "privacy" }], current: [{ position: 0, label: "Privacy", targetSlug: "privacy" }] },
  }};

  it("reorder within owner", () => {
    const s0 = { byOwner: { ...seed.byOwner, info: { ...seed.byOwner.info, current: [
      { position: 0, label: "Help", targetSlug: "help" },
      { position: 1, label: "Privacy", targetSlug: "privacy" },
    ], initial: [
      { position: 0, label: "Help", targetSlug: "help" },
      { position: 1, label: "Privacy", targetSlug: "privacy" },
    ]}}};
    const s1 = segmentsReducer(s0, { type: "reorder", owner: "info", from: 0, to: 1 });
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["privacy", "help"]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("cross-owner move marks both dirty", () => {
    const s1 = segmentsReducer(seed, { type: "move", target: "privacy", from: "help", to: "info", position: 1 });
    expect(s1.byOwner.help.current).toEqual([]);
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["help", "privacy"]);
    expect(new Set(dirtyOwners(s1))).toEqual(new Set(["help", "info"]));
  });

  it("add (orphan-promote)", () => {
    const s1 = segmentsReducer(seed, { type: "add", owner: "info", target: "support", position: 1 });
    expect(s1.byOwner.info.current.map((s) => s.targetSlug)).toEqual(["help", "support"]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("remove (segment-demote)", () => {
    const s1 = segmentsReducer(seed, { type: "remove", owner: "info", target: "help" });
    expect(s1.byOwner.info.current).toEqual([]);
    expect(dirtyOwners(s1)).toEqual(["info"]);
  });

  it("idempotent move back to initial → clean", () => {
    const s1 = segmentsReducer(seed, { type: "move", target: "privacy", from: "help", to: "info", position: 1 });
    const s2 = segmentsReducer(s1, { type: "move", target: "privacy", from: "info", to: "help", position: 0 });
    expect(dirtyOwners(s2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

- [ ] **Step 3: Implementation**

```ts
// segmentsSlice.ts
import type { PageSegmentInput } from "@musiccloud/shared";

export interface SegmentEntry {
  position: number;
  label: string;
  targetSlug: string;
  translations?: Record<string, string>;
}

export interface SegmentsState {
  byOwner: Record<string, { initial: SegmentEntry[]; current: SegmentEntry[] }>;
}

export type SegmentsAction =
  | { type: "hydrate"; entries: Array<{ ownerSlug: string; segments: SegmentEntry[] }> }
  | { type: "reorder"; owner: string; from: number; to: number }
  | { type: "move"; target: string; from: string; to: string; position: number }
  | { type: "add"; owner: string; target: string; position: number; label?: string }
  | { type: "remove"; owner: string; target: string }
  | { type: "set-label"; owner: string; target: string; label: string }
  | { type: "set-translation"; owner: string; target: string; locale: string; label: string }
  | { type: "reset" };

function reposition(arr: SegmentEntry[]): SegmentEntry[] {
  return arr.map((s, i) => ({ ...s, position: i }));
}

export function segmentsReducer(state: SegmentsState, action: SegmentsAction): SegmentsState {
  switch (action.type) {
    case "hydrate": {
      const byOwner: SegmentsState["byOwner"] = {};
      for (const e of action.entries) byOwner[e.ownerSlug] = { initial: e.segments, current: e.segments };
      return { byOwner };
    }
    case "reorder": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      const next = entry.current.slice();
      const [moved] = next.splice(action.from, 1);
      if (!moved) return state;
      next.splice(action.to, 0, moved);
      return { byOwner: { ...state.byOwner, [action.owner]: { ...entry, current: reposition(next) } } };
    }
    case "move": {
      const fromEntry = state.byOwner[action.from];
      const toEntry = state.byOwner[action.to];
      if (!fromEntry || !toEntry) return state;
      const fromCurrent = fromEntry.current.filter((s) => s.targetSlug !== action.target);
      const removed = fromEntry.current.find((s) => s.targetSlug === action.target);
      if (!removed) return state;
      const toCurrent = toEntry.current.slice();
      toCurrent.splice(action.position, 0, { ...removed, position: action.position });
      return {
        byOwner: {
          ...state.byOwner,
          [action.from]: { ...fromEntry, current: reposition(fromCurrent) },
          [action.to]: { ...toEntry, current: reposition(toCurrent) },
        },
      };
    }
    case "add": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      const next = entry.current.slice();
      next.splice(action.position, 0, {
        position: action.position,
        label: action.label ?? action.target,
        targetSlug: action.target,
      });
      return { byOwner: { ...state.byOwner, [action.owner]: { ...entry, current: reposition(next) } } };
    }
    case "remove": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: { ...entry, current: reposition(entry.current.filter((s) => s.targetSlug !== action.target)) },
        },
      };
    }
    case "set-label": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: {
            ...entry,
            current: entry.current.map((s) => (s.targetSlug === action.target ? { ...s, label: action.label } : s)),
          },
        },
      };
    }
    case "set-translation": {
      const entry = state.byOwner[action.owner];
      if (!entry) return state;
      return {
        byOwner: {
          ...state.byOwner,
          [action.owner]: {
            ...entry,
            current: entry.current.map((s) =>
              s.targetSlug === action.target
                ? { ...s, translations: { ...(s.translations ?? {}), [action.locale]: action.label } }
                : s,
            ),
          },
        },
      };
    }
    case "reset":
      return { byOwner: Object.fromEntries(Object.entries(state.byOwner).map(([k, v]) => [k, { ...v, current: v.initial }])) };
    default:
      return state;
  }
}

export function dirtyOwners(s: SegmentsState): string[] {
  return Object.entries(s.byOwner)
    .filter(([, v]) => !sameSegments(v.initial, v.current))
    .map(([k]) => k);
}

function sameSegments(a: SegmentEntry[], b: SegmentEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].position !== b[i].position) return false;
    if (a[i].label !== b[i].label) return false;
    if (a[i].targetSlug !== b[i].targetSlug) return false;
    if (JSON.stringify(a[i].translations ?? {}) !== JSON.stringify(b[i].translations ?? {})) return false;
  }
  return true;
}

export function toBulkSegmentsInput(s: SegmentsState["byOwner"][string]["current"]): PageSegmentInput[] {
  return s.map((e) => ({
    position: e.position,
    label: e.label,
    targetSlug: e.targetSlug,
    ...(e.translations ? { translations: e.translations } : {}),
  }));
}
```

- [ ] **Step 4: PASS** alle 5 Test-Cases

- [ ] **Step 5: Commit**

```bash
git commit -m "Feat: Add segmentsSlice with cross-owner move semantics

- reorder/move/add/remove/set-label/set-translation reducers
- Cross-parent move dirties both source and target owner slices
- Idempotent move-back marks slice clean again"
```

---

### Task 15: `translationsSlice.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/slices/translationsSlice.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/slices/translationsSlice.test.ts`

- [ ] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { translationsReducer, dirtyEntries } from "../../slices/translationsSlice";

describe("translationsSlice", () => {
  const seed = {
    byPage: {
      info: {
        de: {
          initial: { title: "Information", content: "# Info de" },
          current: { title: "Information", content: "# Info de" },
        },
      },
    },
  };

  it("hydrate seeds initial=current", () => {
    const s = translationsReducer({ byPage: {} }, {
      type: "hydrate",
      entries: [{ slug: "info", locale: "de", title: "Information", content: "# Info de", translationReady: true }],
    });
    expect(s.byPage.info.de.initial.title).toBe("Information");
    expect(dirtyEntries(s)).toEqual([]);
  });

  it("set-field marks (slug, locale) dirty", () => {
    const s1 = translationsReducer(seed, {
      type: "set-field", slug: "info", locale: "de", field: "title", value: "Information v2",
    });
    expect(dirtyEntries(s1)).toEqual([{ slug: "info", locale: "de" }]);
  });

  it("reverting field clears dirty", () => {
    const s1 = translationsReducer(seed, {
      type: "set-field", slug: "info", locale: "de", field: "title", value: "X",
    });
    const s2 = translationsReducer(s1, {
      type: "set-field", slug: "info", locale: "de", field: "title", value: "Information",
    });
    expect(dirtyEntries(s2)).toEqual([]);
  });

  it("multiple dirty pages × locales reported separately", () => {
    const seed2 = {
      byPage: {
        info: { de: { initial: { title: "A" }, current: { title: "A" } } },
        help: { de: { initial: { title: "B" }, current: { title: "B" } } },
      },
    };
    const s1 = translationsReducer(seed2, { type: "set-field", slug: "info", locale: "de", field: "title", value: "A2" });
    const s2 = translationsReducer(s1, { type: "set-field", slug: "help", locale: "de", field: "title", value: "B2" });
    expect(dirtyEntries(s2)).toEqual(
      expect.arrayContaining([{ slug: "info", locale: "de" }, { slug: "help", locale: "de" }]),
    );
  });

  it("reset reverts all entries", () => {
    const s1 = translationsReducer(seed, { type: "set-field", slug: "info", locale: "de", field: "title", value: "X" });
    const s2 = translationsReducer(s1, { type: "reset" });
    expect(dirtyEntries(s2)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run (FAIL)**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/translationsSlice.test.ts
```

Erwartet: FAIL — Module nicht existent.

- [ ] **Step 3: Implementation**

```ts
// translationsSlice.ts
type TranslationFields = { title?: string; content?: string; translationReady?: boolean };

export interface TranslationsState {
  byPage: Record<string, Record<string /* locale */, { initial: TranslationFields; current: TranslationFields }>>;
}

export type TranslationsAction =
  | { type: "hydrate"; entries: Array<{ slug: string; locale: string } & TranslationFields> }
  | { type: "set-field"; slug: string; locale: string; field: keyof TranslationFields; value: TranslationFields[keyof TranslationFields] }
  | { type: "reset" };

export function translationsReducer(state: TranslationsState, action: TranslationsAction): TranslationsState {
  switch (action.type) {
    case "hydrate": {
      const byPage: TranslationsState["byPage"] = {};
      for (const e of action.entries) {
        const fields: TranslationFields = {
          ...(e.title !== undefined ? { title: e.title } : {}),
          ...(e.content !== undefined ? { content: e.content } : {}),
          ...(e.translationReady !== undefined ? { translationReady: e.translationReady } : {}),
        };
        byPage[e.slug] = { ...(byPage[e.slug] ?? {}), [e.locale]: { initial: fields, current: fields } };
      }
      return { byPage };
    }
    case "set-field": {
      const page = state.byPage[action.slug];
      if (!page) return state;
      const entry = page[action.locale];
      if (!entry) return state;
      const next = { ...entry.current, [action.field]: action.value };
      return {
        byPage: {
          ...state.byPage,
          [action.slug]: { ...page, [action.locale]: { ...entry, current: next } },
        },
      };
    }
    case "reset": {
      const byPage: TranslationsState["byPage"] = {};
      for (const [slug, locales] of Object.entries(state.byPage)) {
        byPage[slug] = {};
        for (const [locale, v] of Object.entries(locales)) {
          byPage[slug][locale] = { ...v, current: v.initial };
        }
      }
      return { byPage };
    }
    default:
      return state;
  }
}

function fieldsEqual(a: TranslationFields, b: TranslationFields): boolean {
  return a.title === b.title && a.content === b.content && a.translationReady === b.translationReady;
}

export function dirtyEntries(s: TranslationsState): Array<{ slug: string; locale: string }> {
  const out: Array<{ slug: string; locale: string }> = [];
  for (const [slug, locales] of Object.entries(s.byPage)) {
    for (const [locale, v] of Object.entries(locales)) {
      if (!fieldsEqual(v.initial, v.current)) out.push({ slug, locale });
    }
  }
  return out;
}
```

- [ ] **Step 4: PASS**

```bash
pnpm --filter @musiccloud/dashboard test:run src/features/content/state/__tests__/slices/translationsSlice.test.ts
```

- [ ] **Step 5: Commit**

```bash
git commit -m "Feat: Add translationsSlice for per-page locale drafts

- Two-level keying: page slug × locale
- Selector dirtyEntries() returns the (slug, locale) tuples to bulk-save"
```

---

### Task 16: `diff.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/diff.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/diff.test.ts`

- [x] **Step 1: Failing Test**

```ts
import { describe, expect, it } from "vitest";
import { buildBulkPayload } from "../diff";

describe("buildBulkPayload", () => {
  it("emits empty payload for clean state", () => {
    const p = buildBulkPayload({
      meta: { pages: {} },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p).toEqual({});
  });

  it("includes only dirty pages.meta", () => {
    const p = buildBulkPayload({
      meta: { pages: { info: { initial: { title: "A" } as any, current: { title: "B" } as any } } },
      content: { pages: {} },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pages).toEqual([{ slug: "info", meta: { title: "B" } }]);
  });

  it("merges meta + content for same slug into one entry", () => {
    const p = buildBulkPayload({
      meta: { pages: { info: { initial: { title: "A" } as any, current: { title: "B" } as any } } },
      content: { pages: { info: { initial: "# old", current: "# new" } } },
      segments: { byOwner: {} },
      translations: { byPage: {} },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pages).toEqual([{ slug: "info", meta: { title: "B" }, content: "# new" }]);
  });

  it("emits topLevelOrder only when sidebar dirty", () => {
    const clean = buildBulkPayload({
      meta: { pages: {} }, content: { pages: {} }, segments: { byOwner: {} }, translations: { byPage: {} },
      sidebar: { initial: ["a", "b"], current: ["a", "b"] },
    });
    expect(clean.topLevelOrder).toBeUndefined();
    const dirty = buildBulkPayload({
      meta: { pages: {} }, content: { pages: {} }, segments: { byOwner: {} }, translations: { byPage: {} },
      sidebar: { initial: ["a", "b"], current: ["b", "a"] },
    });
    expect(dirty.topLevelOrder).toEqual(["b", "a"]);
  });

  it("emits segments for each dirty owner", () => {
    const p = buildBulkPayload({
      meta: { pages: {} }, content: { pages: {} },
      segments: {
        byOwner: {
          info: {
            initial: [{ position: 0, label: "A", targetSlug: "a" }],
            current: [{ position: 0, label: "A", targetSlug: "a" }, { position: 1, label: "B", targetSlug: "b" }],
          },
          help: {
            initial: [{ position: 0, label: "X", targetSlug: "x" }],
            current: [{ position: 0, label: "X", targetSlug: "x" }],
          },
        },
      },
      translations: { byPage: {} }, sidebar: { initial: [], current: [] },
    });
    expect(p.segments).toHaveLength(1);
    expect(p.segments![0].ownerSlug).toBe("info");
    expect(p.segments![0].segments).toHaveLength(2);
  });

  it("emits pageTranslations for each dirty (slug, locale)", () => {
    const p = buildBulkPayload({
      meta: { pages: {} }, content: { pages: {} }, segments: { byOwner: {} },
      translations: {
        byPage: {
          info: {
            de: { initial: { title: "A" }, current: { title: "A2" } },
            fr: { initial: { title: "B" }, current: { title: "B" } },
          },
        },
      },
      sidebar: { initial: [], current: [] },
    });
    expect(p.pageTranslations).toEqual([
      expect.objectContaining({ slug: "info", locale: "de", title: "A2" }),
    ]);
  });
});
```

- [x] **Step 2-4: Implementation**

```ts
// diff.ts
import type { PagesBulkRequest } from "@musiccloud/shared";
import type { MetaState } from "./slices/metaSlice";
import type { ContentState } from "./slices/contentSlice";
import type { SegmentsState } from "./slices/segmentsSlice";
import type { TranslationsState } from "./slices/translationsSlice";
import type { SidebarState } from "./slices/sidebarSlice";
import { dirtySlugs as dirtyMetaSlugs } from "./slices/metaSlice";
import { dirtySlugs as dirtyContentSlugs } from "./slices/contentSlice";
import { dirtyOwners, toBulkSegmentsInput } from "./slices/segmentsSlice";
import { isDirty as sidebarDirty } from "./slices/sidebarSlice";

export interface SliceBundle {
  meta: MetaState;
  content: ContentState;
  segments: SegmentsState;
  translations: TranslationsState;
  sidebar: SidebarState;
}

export function buildBulkPayload(b: SliceBundle): PagesBulkRequest {
  const out: PagesBulkRequest = {};

  const dirtyMeta = new Set(dirtyMetaSlugs(b.meta));
  const dirtyContent = new Set(dirtyContentSlugs(b.content));
  const allPageSlugs = new Set<string>([...dirtyMeta, ...dirtyContent]);
  if (allPageSlugs.size > 0) {
    out.pages = [];
    for (const slug of allPageSlugs) {
      const entry: { slug: string; meta?: any; content?: string } = { slug };
      if (dirtyMeta.has(slug)) {
        const e = b.meta.pages[slug];
        const diff: Record<string, unknown> = {};
        for (const k of Object.keys(e.current) as Array<keyof typeof e.current>) {
          if (e.current[k] !== e.initial[k]) diff[k] = e.current[k];
        }
        entry.meta = diff;
      }
      if (dirtyContent.has(slug)) {
        entry.content = b.content.pages[slug].current;
      }
      out.pages.push(entry);
    }
  }

  const dirtySeg = dirtyOwners(b.segments);
  if (dirtySeg.length > 0) {
    out.segments = dirtySeg.map((owner) => ({
      ownerSlug: owner,
      segments: toBulkSegmentsInput(b.segments.byOwner[owner].current),
    }));
  }

  // translations
  const trEntries: NonNullable<PagesBulkRequest["pageTranslations"]> = [];
  for (const [slug, locales] of Object.entries(b.translations.byPage)) {
    for (const [locale, v] of Object.entries(locales)) {
      if (v.initial.title !== v.current.title || v.initial.content !== v.current.content || v.initial.translationReady !== v.current.translationReady) {
        trEntries.push({ slug, locale: locale as never, ...v.current });
      }
    }
  }
  if (trEntries.length > 0) out.pageTranslations = trEntries;

  if (sidebarDirty(b.sidebar)) out.topLevelOrder = b.sidebar.current;

  return out;
}
```

- [x] **Step 5: Commit** — `cb5fe3f9`

```bash
git commit -m "Feat: Add diff builder that turns slice state into PagesBulkRequest

- Merges per-slug meta + content into one pages entry
- Emits sections only when their slice is dirty"
```

---

### Task 17: `PagesEditorContext.tsx` (Provider)

**Files:**
- Create: `apps/dashboard/src/features/content/state/PagesEditorContext.tsx`

- [x] **Step 1: Provider-Skelett**

```tsx
import { createContext, useCallback, useContext, useMemo, useReducer, useRef, useEffect } from "react";

import { createDirtyRegistry, type DirtyRegistry, type SliceKey } from "./dirtyRegistry";
import { sidebarReducer, isDirty as sidebarDirty, type SidebarState, type SidebarAction } from "./slices/sidebarSlice";
import { metaReducer, dirtySlugs as metaDirtySlugs, type MetaState, type MetaAction } from "./slices/metaSlice";
import { contentReducer, dirtySlugs as contentDirtySlugs, type ContentState, type ContentAction } from "./slices/contentSlice";
import { segmentsReducer, dirtyOwners, type SegmentsState, type SegmentsAction } from "./slices/segmentsSlice";
import { translationsReducer, dirtyEntries, type TranslationsState, type TranslationsAction } from "./slices/translationsSlice";

interface PagesEditorContextValue {
  meta: MetaState;
  content: ContentState;
  segments: SegmentsState;
  translations: TranslationsState;
  sidebar: SidebarState;
  dispatch: {
    meta: (a: MetaAction) => void;
    content: (a: ContentAction) => void;
    segments: (a: SegmentsAction) => void;
    translations: (a: TranslationsAction) => void;
    sidebar: (a: SidebarAction) => void;
  };
  dirty: DirtyRegistry;
  resetAll: () => void;
}

const Ctx = createContext<PagesEditorContextValue | null>(null);

export function PagesEditorProvider({ children }: { children: React.ReactNode }) {
  const [meta, dispatchMeta] = useReducer(metaReducer, { pages: {} });
  const [content, dispatchContent] = useReducer(contentReducer, { pages: {} });
  const [segments, dispatchSegments] = useReducer(segmentsReducer, { byOwner: {} });
  const [translations, dispatchTranslations] = useReducer(translationsReducer, { byPage: {} });
  const [sidebar, dispatchSidebar] = useReducer(sidebarReducer, { initial: [], current: [] });
  const dirtyRef = useRef<DirtyRegistry>(createDirtyRegistry());

  // Re-sync dirtyRegistry with slice dirty-state on every render.
  useEffect(() => {
    const reg = dirtyRef.current;
    reg.clear();
    if (sidebarDirty(sidebar)) reg.add("sidebar");
    metaDirtySlugs(meta).forEach((s) => reg.add(`meta:${s}` as SliceKey));
    contentDirtySlugs(content).forEach((s) => reg.add(`content:${s}` as SliceKey));
    dirtyOwners(segments).forEach((o) => reg.add(`segments:${o}` as SliceKey));
    dirtyEntries(translations).forEach(({ slug }) => reg.add(`translations:${slug}` as SliceKey));
  }, [meta, content, segments, translations, sidebar]);

  const resetAll = useCallback(() => {
    dispatchMeta({ type: "reset" });
    dispatchContent({ type: "reset" });
    dispatchSegments({ type: "reset" });
    dispatchTranslations({ type: "reset" });
    dispatchSidebar({ type: "reset" });
  }, []);

  const value = useMemo<PagesEditorContextValue>(
    () => ({
      meta, content, segments, translations, sidebar,
      dispatch: { meta: dispatchMeta, content: dispatchContent, segments: dispatchSegments, translations: dispatchTranslations, sidebar: dispatchSidebar },
      dirty: dirtyRef.current,
      resetAll,
    }),
    [meta, content, segments, translations, sidebar, resetAll],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePagesEditor(): PagesEditorContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePagesEditor must be used within PagesEditorProvider");
  return v;
}
```

- [x] **Step 2: Type-Check**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

Erwartet: clean (alle Slices schon vorhanden).

- [x] **Step 3: Commit** — `29f35a7d`

```bash
git add apps/dashboard/src/features/content/state/PagesEditorContext.tsx
git commit -m "Feat: Add PagesEditorProvider that aggregates slices + dirty registry"
```

---

### Task 18: `useGlobalPagesSave.ts` + Tests

**Files:**
- Create: `apps/dashboard/src/features/content/state/useGlobalPagesSave.ts`
- Create: `apps/dashboard/src/features/content/state/__tests__/useGlobalPagesSave.test.ts`

- [x] **Step 1: Failing Test** (mock fetch + dispatched actions)

```ts
import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PagesEditorProvider } from "../PagesEditorContext";
import { useGlobalPagesSave } from "../useGlobalPagesSave";

function wrapper({ children }: { children: React.ReactNode }) {
  return <PagesEditorProvider>{children}</PagesEditorProvider>;
}

const SNAPSHOT = {
  pages: [
    { slug: "info", title: "Information", content: "# Info v2", pageType: "segmented", position: 0, segments: [] },
    { slug: "help", title: "Help", content: "# Help", pageType: "segmented", position: 1, segments: [] },
  ],
};

describe("useGlobalPagesSave", () => {
  it("save() posts the diff and re-hydrates slices on 200", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true, status: 200, json: async () => SNAPSHOT,
    } as any);
    const { result } = renderHook(() => {
      const editor = usePagesEditor();
      const save = useGlobalPagesSave();
      return { editor, save };
    }, { wrapper });
    act(() => {
      result.current.editor.dispatch.meta({ type: "hydrate", entries: [{ slug: "info", meta: { title: "Information" } as any }] });
      result.current.editor.dispatch.meta({ type: "set-field", slug: "info", field: "title", value: "Information v2" });
    });
    await act(async () => { await result.current.save.save(); });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/admin/pages/bulk"),
      expect.objectContaining({ method: "PUT" }),
    );
    expect(result.current.editor.dirty.size()).toBe(0);
  });

  it("save() keeps dirty state on 400 and exposes details", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false, status: 400,
      json: async () => ({ error: "INVALID_INPUT", details: [{ section: "pages", index: 0, message: "bad slug" }] }),
    } as any);
    const { result } = renderHook(() => {
      const editor = usePagesEditor();
      const save = useGlobalPagesSave();
      return { editor, save };
    }, { wrapper });
    act(() => {
      result.current.editor.dispatch.meta({ type: "hydrate", entries: [{ slug: "info", meta: { title: "A" } as any }] });
      result.current.editor.dispatch.meta({ type: "set-field", slug: "info", field: "title", value: "B" });
    });
    await act(async () => { await result.current.save.save(); });
    expect(result.current.editor.dirty.size()).toBeGreaterThan(0);
    expect(result.current.save.errorDetails).toEqual([
      { section: "pages", index: 0, message: "bad slug" },
    ]);
    expect(result.current.save.status).toBe("error");
  });

  it("discard() reverts current to initial across all slices", async () => {
    const { result } = renderHook(() => {
      const editor = usePagesEditor();
      const save = useGlobalPagesSave();
      return { editor, save };
    }, { wrapper });
    act(() => {
      result.current.editor.dispatch.meta({ type: "hydrate", entries: [{ slug: "info", meta: { title: "A" } as any }] });
      result.current.editor.dispatch.content({ type: "hydrate", entries: [{ slug: "info", content: "# A" }] });
      result.current.editor.dispatch.meta({ type: "set-field", slug: "info", field: "title", value: "B" });
      result.current.editor.dispatch.content({ type: "set", slug: "info", value: "# B" });
    });
    expect(result.current.editor.dirty.size()).toBeGreaterThan(0);
    act(() => { result.current.save.discard(); });
    expect(result.current.editor.dirty.size()).toBe(0);
  });
});
```

- [x] **Step 2: Implementation**

```ts
import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ENDPOINTS, type PagesBulkRequest, type PagesBulkErrorDetail } from "@musiccloud/shared";

import { usePagesEditor } from "./PagesEditorContext";
import { buildBulkPayload } from "./diff";
import { authFetch } from "@/lib/authFetch"; // existing helper — replace with project-equivalent if name differs

type SaveStatus = "idle" | "saving" | "error";

export function useGlobalPagesSave() {
  const editor = usePagesEditor();
  const qc = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [errorDetails, setErrorDetails] = useState<PagesBulkErrorDetail[] | null>(null);

  const save = useCallback(async () => {
    if (editor.dirty.size() === 0) return;
    setStatus("saving");
    setErrorDetails(null);
    try {
      const body: PagesBulkRequest = buildBulkPayload({
        meta: editor.meta, content: editor.content, segments: editor.segments,
        translations: editor.translations, sidebar: editor.sidebar,
      });
      const res = await authFetch(ENDPOINTS.admin.pages.bulk, { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        setStatus("error");
        setErrorDetails(errBody.details ?? null);
        return;
      }
      const json = await res.json();
      // Re-hydrate slices from server snapshot
      editor.dispatch.meta({ type: "hydrate", entries: json.pages.map((p: any) => ({ slug: p.slug, meta: p })) });
      editor.dispatch.content({ type: "hydrate", entries: json.pages.map((p: any) => ({ slug: p.slug, content: p.content })) });
      editor.dispatch.segments({ type: "hydrate", entries: json.pages.filter((p: any) => p.pageType === "segmented").map((p: any) => ({ ownerSlug: p.slug, segments: p.segments ?? [] })) });
      editor.dispatch.sidebar({ type: "hydrate", topLevelOrder: json.pages.filter((p: any) => p.pageType === "segmented").sort((a: any, b: any) => a.position - b.position).map((p: any) => p.slug) });
      // translations re-hydrate from response if present
      qc.invalidateQueries({ queryKey: ["content-pages"] });
      setStatus("idle");
    } catch (e) {
      setStatus("error");
    }
  }, [editor, qc]);

  const discard = useCallback(() => editor.resetAll(), [editor]);

  return { save, discard, status, errorDetails, dirtyCount: editor.dirty.groupCount() };
}
```

- [x] **Step 3: Tests passing** (alle 3) — 31/31 dashboard

- [x] **Step 4: Commit** — `6c07d85f` (siehe Drift-Notiz unten für tatsächliche Commit-Message)

```bash
git commit -m "Feat: Add useGlobalPagesSave hook driving the bulk endpoint

- Builds payload via diff.ts, posts to /admin/pages/bulk
- Re-hydrates slices from server snapshot on 200
- Keeps dirty state on 4xx and surfaces structured error details"
```

#### Drift-Korrektur (am 2026-05-03 beim Implementieren)

Plan-Text oben referenziert `authFetch` und raw-fetch-Error-Handling. Tatsächliche Implementation weicht ab:

1. **Kein `authFetch` im Projekt** — Standard-Pattern ist `api.put<T>(path, body)` aus `@/lib/api.ts` (auth + JSON + 30s timeout, wirft `ApiRequestError` auf !ok). Hook nutzt `api.put` statt raw fetch.
2. **`createApiRequestError` musste erweitert werden**, um strukturierte `details` aus dem Response-Body zu erhalten — sonst wäre der `errBody.details`-Pfad mit `api.put` leer. Refactor-Commit `1edec68c` fügt `ApiRequestError.details?: unknown[] | null` hinzu (extrahiert aus `payload.details` oder `payload.error.details`). T18 hängt davon ab.
3. **Test-Wrapper braucht `QueryClientProvider`** (Hook ruft `useQueryClient()` für `invalidateQueries`). Plan-Test hatte nur `<PagesEditorProvider>` — fehlerhaft, hätte "No QueryClient set" geworfen. Kombinierter Wrapper: `<QueryClientProvider><PagesEditorProvider>...</...></...>`.
4. **Test mockt `api.put` direkt** (`vi.spyOn(api, "put")`) statt `global.fetch`. Aussagekräftiger und unabhängig von api.ts-Internals.
5. **Strong typing durchgehend** — keine `as any` casts. Test nutzt `makeMeta()` aus `factories.ts` (eingeführt durch Refactor `6918c3ca`). Hook nutzt `Parameters<typeof buildBulkPayload>[0]["meta"]…`-Type-Extraction für `MetaFields`.
6. **Bulk-Response hydrate scope** — Re-hydrate beschränkt auf `meta` + `sidebar`-Slices. `content`/`segments` werden NICHT aus der Bulk-Response re-hydratet weil `PagesBulkResponse.pages: ContentPageSummary[]` keinen `content`-String und keine detaillierten `segments` führt. Translations bleiben dirty bis zum nächsten Refetch (Spec-konform).

Tatsächliche Commit-Message (Subject + 4 Bullets):

```
Feat: Add useGlobalPagesSave hook driving the bulk endpoint

- Builds payload via diff.ts, posts via api.put to /admin/pages/bulk
- Re-hydrates meta + sidebar slices from the server snapshot on success
- Catches ApiRequestError on 4xx, surfaces structured details to the caller
- discard() routes through PagesEditorContext.resetAll
```

---

## Phase 4 — PagesSaveBar UI

### Task 19: `PagesSaveBar.tsx` Component

**Files:**
- Create: `apps/dashboard/src/components/layout/PagesSaveBar.tsx`

- [x] **Step 1: Component** — `8a06026c`

```tsx
import { useEffect, useState } from "react";
import { FloppyDiskIcon, ArrowUUpLeftIcon } from "@phosphor-icons/react";

import { useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";

export function PagesSaveBar() {
  const editor = usePagesEditor();
  const { save, discard, status, errorDetails, dirtyCount } = useGlobalPagesSave();
  const [_, force] = useState(0);
  useEffect(() => editor.dirty.subscribe(() => force((n) => n + 1)), [editor.dirty]);

  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (dirtyCount === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => save()}
        disabled={status === "saving"}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[var(--color-primary)] rounded-control disabled:opacity-50"
      >
        <FloppyDiskIcon weight="duotone" className="w-3.5 h-3.5" />
        {status === "saving" ? "Speichert…" : `Speichern (${dirtyCount})`}
      </button>
      <button
        type="button"
        onClick={() => setConfirmDiscard(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-[var(--ds-text-muted)] hover:text-[var(--ds-text)]"
      >
        <ArrowUUpLeftIcon weight="duotone" className="w-3.5 h-3.5" />
        Verwerfen
      </button>
      {confirmDiscard && (
        <DiscardConfirmModal
          onCancel={() => setConfirmDiscard(false)}
          onConfirm={() => { discard(); setConfirmDiscard(false); }}
        />
      )}
      {errorDetails && errorDetails.length > 0 && (
        <span className="text-xs text-red-500">{errorDetails.length} Fehler</span>
      )}
    </div>
  );
}

function DiscardConfirmModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--ds-surface)] rounded-control p-4 max-w-sm">
        <p className="text-sm text-[var(--ds-text)]">Alle nicht gespeicherten Änderungen verwerfen?</p>
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs">Abbrechen</button>
          <button onClick={onConfirm} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-control">Verwerfen</button>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Type-Check**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

- [x] **Step 3: Commit** — `8a06026c`

```bash
git add apps/dashboard/src/components/layout/PagesSaveBar.tsx
git commit -m "Feat: Add PagesSaveBar topbar component with save+discard actions

- Counter reflects dirtyRegistry.groupCount()
- Confirm modal guards the discard action
- Hidden when nothing is dirty"
```

#### Drift-Korrektur T19

1. **`ArrowUUpLeftIcon` existiert nicht** in `@phosphor-icons/react ^2.1.10`. Ersetzt durch `ArrowCounterClockwise` (klassisches Undo-Symbol).
2. **Icon-Import-Pattern:** Phosphor exportiert ohne `Icon`-Suffix. Imports lauten `import { FloppyDisk as FloppyDiskIcon, ArrowCounterClockwise as ArrowCounterClockwiseIcon } from "@phosphor-icons/react"` (Pattern aus `TrackEditPage.tsx`).
3. **`useState`+`force(n=>n+1)` ersetzt durch `useSyncExternalStore`** für Subscribe an `editor.dirty`. Idiomatischer für React-18+ External-Stores, kein unused-var-Warning.
4. **DiscardConfirmModal entfernt**, stattdessen shared `<Dialog>` aus `@/shared/ui/Dialog` genutzt (Konsistenz mit existierenden Confirm-Modals; CLAUDE.md-Reuse-Rule).
5. **Error-Indicator** zeigt jetzt deutsch-pluralisiert (`1 Fehler` / `N Fehler`) statt `N Fehler` für alle Fälle.

---

### Task 20: Navigation-Leave-Guard via `useBlocker` + `beforeunload`

**Files:**
- Create: `apps/dashboard/src/features/content/state/UnsavedGuard.tsx`

- [x] **Step 1: Component mit 3-Optionen-Modal (Spec-konform)** — siehe Drift-Notiz (T20a only, Commit `45684988`)

```tsx
import { useEffect, useState } from "react";
import { useBlocker } from "react-router";

import { usePagesEditor } from "./PagesEditorContext";
import { useGlobalPagesSave } from "./useGlobalPagesSave";

export function UnsavedGuard() {
  const editor = usePagesEditor();
  const { save } = useGlobalPagesSave();
  const [pending, setPending] = useState<{ proceed: () => void; reset: () => void } | null>(null);

  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    currentLocation.pathname !== nextLocation.pathname && editor.dirty.size() > 0,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setPending({ proceed: blocker.proceed, reset: blocker.reset });
    }
  }, [blocker]);

  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (editor.dirty.size() > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editor.dirty]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--ds-surface)] rounded-control p-4 max-w-sm">
        <p className="text-sm text-[var(--ds-text)]">Ungespeicherte Änderungen vorhanden. Wie weiter?</p>
        <div className="mt-3 flex justify-end gap-2">
          <button
            onClick={() => { pending.reset(); setPending(null); }}
            className="px-3 py-1.5 text-xs"
          >
            Abbrechen
          </button>
          <button
            onClick={() => { editor.resetAll(); pending.proceed(); setPending(null); }}
            className="px-3 py-1.5 text-xs border border-[var(--ds-border)] rounded-control"
          >
            Verwerfen
          </button>
          <button
            onClick={async () => {
              await save();
              if (editor.dirty.size() === 0) { pending.proceed(); setPending(null); }
              else { pending.reset(); setPending(null); }
            }}
            className="px-3 py-1.5 text-xs bg-[var(--color-primary)] text-white rounded-control"
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [x] **Step 2: Type-Check**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

- [x] **Step 3: Commit** — `45684988` (T20a only)

```bash
git add apps/dashboard/src/features/content/state/UnsavedGuard.tsx
git commit -m "Feat: Guard navigation away from /admin/pages with unsaved changes

- Three-option modal (cancel | discard | save) via React Router useBlocker
- beforeunload prompt for browser-level close/refresh
- Save path waits for the bulk request to clear dirty state before proceeding"
```

#### Drift-Korrektur T20 — gesplittet in T20a (geliefert) + T20b (Followup-Plan)

**Root cause:** `useBlocker` aus react-router 7 funktioniert NUR mit Data-Router (`createBrowserRouter` + `<RouterProvider>`). Aktuelles Dashboard nutzt `<BrowserRouter>` + `<Routes>` (legacy Component-API) — `useBlocker` ist dort no-op / wirft. Migration zum Data-Router ist Touch-Everything (alle 12+ Routen, Suspense-Pattern, Lazy-Loading) und sprengt Phase-4-Scope.

**Was geliefert wurde (T20a, Commit `45684988`):**

`UnsavedGuard.tsx` enthält NUR den `beforeunload`-Listener (Browser-Level-Schutz für Tab-Close, F5, URL-Wechsel). KEIN `useBlocker`, KEIN 3-Optionen-Modal. SPA-interne Navigation (Sidebar-Klick, in-app `<Link>`, programmatic `navigate()`) verliert ungespeicherte Änderungen ohne Warnung.

**Was offen ist (T20b):** SPA-internal Guard mit 3-Optionen-Modal. Eigener Plan: `.claude/plans/open/2026-05-03-data-router-migration-and-spa-unsaved-guard.md`. Phase 1: Data-Router-Migration. Phase 2: `useBlocker` in `UnsavedGuard.tsx` aktivieren.

**Tatsächliche Commit-Message:**

```
Feat: Add UnsavedGuard with browser-level beforeunload protection

- Triggers the browser's standard "Leave site?" dialog on tab close, F5, or URL change while pages are dirty
- SPA-internal navigation guard (sidebar clicks, in-app Link, navigate()) is NOT covered yet
- Follow-up plan tracks the data-router migration that unlocks the SPA-internal useBlocker variant
```

---

### Task 21: PagesSaveBar im AdminLayout-Topbar mounten + Cmd+S

**Files:**
- Create: `apps/dashboard/src/features/content/PagesEditorRoot.tsx`
- Modify: `apps/dashboard/src/App.tsx` (Routes-Block für `/admin/pages/*`)

- [x] **Step 1: Wrapper-Komponente** — `bb1c197b`

```tsx
// PagesEditorRoot.tsx
import { useEffect } from "react";
import { Outlet } from "react-router";

import { usePageHeaderContext } from "@/context/PageHeaderContext";
import { useKeyboardSave } from "@/lib/useKeyboardSave";
import { PagesSaveBar } from "@/components/layout/PagesSaveBar";
import { PagesEditorProvider } from "@/features/content/state/PagesEditorContext";
import { useGlobalPagesSave } from "@/features/content/state/useGlobalPagesSave";
import { UnsavedGuard } from "@/features/content/state/UnsavedGuard";
import { createPortal } from "react-dom";

function PagesEditorTopbar() {
  const { actionsEl } = usePageHeaderContext();
  return actionsEl ? createPortal(<PagesSaveBar />, actionsEl) : null;
}

function PagesEditorBindings() {
  const { save } = useGlobalPagesSave();
  useKeyboardSave(save);
  return null;
}

export function PagesEditorRoot() {
  return (
    <PagesEditorProvider>
      <PagesEditorTopbar />
      <PagesEditorBindings />
      <UnsavedGuard />
      <Outlet />
    </PagesEditorProvider>
  );
}
```

`actionsEl` ist bereits im `PageHeaderContextValue` exposed (verifiziert via `apps/dashboard/src/context/PageHeaderContext.tsx:7,32` — kein zusätzlicher Refactor nötig).

- [x] **Step 2: Routing einhängen** — `bb1c197b`

In `App.tsx` sucht ihr die `/admin/pages/*`-Route. Pattern:

```tsx
<Route path="admin">
  <Route path="pages" element={<PagesEditorRoot />}>
    <Route index element={<PagesIndexPage />} />
    <Route path=":slug" element={<ContentEditorPage />} />
    {/* ggf. weitere Sub-Routen */}
  </Route>
</Route>
```

(Konkrete Routes per `grep -n "admin/pages\|ContentEditorPage" apps/dashboard/src/App.tsx` prüfen und `<Route element={<PagesEditorRoot />}>` als Wrapper einsetzen.)

- [x] **Step 3: Smoke-Run** — durchgeführt 2026-05-03 mit chrome-devtools-mcp

```bash
pnpm dev:backend  # Port 4000
pnpm dev:dashboard  # Port 4001
```

**Phase-4-Smoke (verifiziert):** `/pages/info` lädt; lazy-Chunks für PagesEditorRoot, PagesSaveBar, PagesEditorContext, UnsavedGuard, useGlobalPagesSave, dirtyRegistry, 5 Slices und diff alle 200; Console clean (keine Errors/Warnings); Cmd+S triggert `save()` no-op crash-frei (dirtyCount===0).

**Phase-5-Smoke (deferred):** "Title editieren → SaveBar mit `Speichern (1)`. Cmd+S triggert Save-Aufruf." — strukturell nicht in Phase 4 testbar, weil ContentEditorPage Title-Edit weiter über `useSaveContentPage()` autosaved und den `dirtyRegistry` nicht berührt. Voller End-to-End-Smoke kommt nach T22 wire-up.

- [x] **Step 4: Commit** — `bb1c197b`

```bash
git add apps/dashboard/src/features/content/PagesEditorRoot.tsx apps/dashboard/src/App.tsx
git commit -m "Feat: Mount PagesSaveBar in admin topbar for /admin/pages routes

- PagesEditorRoot wraps the area in a slice provider
- Save bar portals into the layout's actions slot
- Cmd+S delegates to the same global save"
```

#### Drift-Korrektur T21

1. **App.tsx-Routes mussten von flat zu nested umgebaut werden.** Vorher: `/admin/pages` und `/admin/pages/:slug` als Geschwister. Jetzt: `<Route path="pages" element={<PagesEditorRoot />}>` mit `<Route index>` (PagesListPage) und `<Route path=":slug">` (ContentEditorPage) als Children. PagesEditorRoot hat `<Outlet />` für die Children.
2. **PagesEditorRoot wird lazy-geladen** wie die anderen Page-Components — Pattern aus App.tsx für consistency.
3. **Suspense-Boundaries bleiben pro child route** wie aktuell. Outer Suspense wrappt die PagesEditorRoot-Lazy-Loaded-Komponente.
4. **Pfad-Drift im Plan-Text korrigiert (2026-05-03):** Plan T21 Step 3 sagte ursprünglich `/admin/pages/info`. Tatsächliche Route: `/pages/info`. Die Dashboard-App mountet die Pages-Routes direkt unter root (kein `/admin`-Prefix; siehe `apps/dashboard/src/App.tsx:307-331`). Code war von Anfang an korrekt, nur die Plan-Text-Referenz war falsch.
5. **Step-3-Scope-Drift korrigiert (2026-05-03):** Step 3 wie ursprünglich formuliert (Title-Edit → SaveBar (1)) testet implizit Phase 5, weil die alte ContentEditorPage den `dirtyRegistry` nicht berührt. Step 3 wurde aufgeteilt: Phase-4-Smoke (lazy-load, Console clean, Cmd+S no-op) jetzt verifiziert; voller End-to-End-Smoke nach T22 wire-up.

---

## Phase 5 — Dashboard Wire-Up: existierende Pages ans Slice-State umstellen

### Task 22: ContentEditorPage editiert via Slices statt `useSaveContentPage`/`usePatchContentPage`

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` (umfassend, siehe Step 3 für Removal-Liste)
- Modify: `apps/dashboard/src/features/content/state/slices/translationsSlice.ts` (Step 0: neue `add-locale`-Action)
- Modify: `apps/dashboard/src/features/content/state/__tests__/translationsSlice.test.ts` (Tests für `add-locale`)

> **Drift-Notes (2026-05-03 vor Implementation, alle vom User approved):**
>
> 1. Plan-Code für `translations`-hydrate war API-falsch. Echte API: `ContentPage.translations: PageTranslation[]` (Array). Korrigiert auf `.map(t => ...)`-Variante.
> 2. `usePatchContentPage` (Title/Slug/Status/showTitle/titleAlignment/displayMode/overlayWidth/contentCardStyle) wird in T22 mitentfernt — alle Felder gehen über `meta.set-field`. T24 streicht den Hook anschließend aus `useAdminContent.ts`.
> 3. Scope erweitert: `localeForms`-State (~200 Zeilen), `buildInitialForms`, `handleCreateTranslation`, `handleDeleteTranslation` ziehen ebenfalls in den Slice um. Sonst lebt parallel toter State-Pfad.
> 4. `translationsSlice` braucht eine `add-locale`-Action (Step 0), weil `hydrate` den ganzen byPage-State neu schreibt — für `handleCreateTranslation` brauchen wir lazy "neue Locale für eine Page hinzufügen"-Operation, die andere Locales unangetastet lässt.

- [ ] **Step 0: `translationsSlice.add-locale`-Action (TDD)**

Reducer:
```ts
| { type: "add-locale"; slug: string; locale: string; fields: TranslationFields }
```

Verhalten: legt `byPage[slug][locale] = { initial: emptyFields, current: fields }` an, sodass die neue Locale **dirty** ist (initial vs current divergieren) und persistiert wird beim nächsten Save. `emptyFields = { title: "", content: "", translationReady: false }`. Existierende Page-Locales bleiben unverändert. Wenn `byPage[slug]` noch nicht existiert, wird er angelegt.

Tests in `__tests__/translationsSlice.test.ts`:
- `add-locale auf neue Page legt byPage-Entry an, neue Locale ist dirty (in dirtyEntries)`
- `add-locale auf bestehende Page mit anderer Locale bleibt für die andere Locale unverändert`
- `add-locale + reset → Locale verschwindet (initial war leer)`

Commit: `Feat: translationsSlice add-locale action with dirty initial-state`

- [ ] **Step 1: Hydrate auf Mount**

Nach dem `useAdminContentPage(slug)`-Call:

```tsx
const editor = usePagesEditor();
useEffect(() => {
  if (!page) return;
  editor.dispatch.meta({ type: "hydrate", entries: [{ slug: page.slug, meta: page }] });
  editor.dispatch.content({ type: "hydrate", entries: [{ slug: page.slug, content: page.content }] });
  editor.dispatch.translations({
    type: "hydrate",
    entries: (page.translations ?? []).map((t) => ({
      slug: page.slug,
      locale: t.locale,
      title: t.title,
      content: t.content,
      translationReady: t.translationReady,
    })),
  });
}, [page, editor.dispatch]);
```

(Hinweis: `page.content`, `page.translations`, `page.title` etc. sind alle non-optional in `ContentPage`, kein `?? ""`/`?? {}` nötig.)

- [ ] **Step 2: Edit-Handler dispatchen**

`MarkdownEditor.onChange` (default-locale) → `editor.dispatch.content({ type: "set", slug, value: newContent })`.

`MarkdownEditor.onChange` (non-default-locale) → `editor.dispatch.translations({ type: "set-field", slug, locale: activeLocale, field: "content", value: newContent })`.

Title/Slug/Status/showTitle/titleAlignment/displayMode/overlayWidth/contentCardStyle (= `EditorMetadataBar`-Inputs + `PageDisplaySettings`-Inputs) → `editor.dispatch.meta({ type: "set-field", slug, field, value })`.

Translation-Title-Input + translationReady-Checkbox → `editor.dispatch.translations({ type: "set-field", slug, locale, field, value })`.

`handleCreateTranslation` → `editor.dispatch.translations({ type: "add-locale", slug, locale: activeLocale, fields: { title: defaultTitle, content: defaultContent, translationReady: false } })`.

`handleDeleteTranslation` (Server-Delete + lokaler State-Reset) bleibt — Delete-Endpoint ist nicht im Bulk-Pfad, behält separaten Mutation-Hook. Lokales State-Cleanup nach erfolgreichem Delete: kein Action im Slice nötig (translation verschwindet beim Page-Reload via re-hydrate).

- [ ] **Step 3: Komplette Legacy-State-Pipeline entfernen**

Aus `ContentEditorPage.tsx` raus (in dieser Reihenfolge):
1. `handleSave`-Funktion + `useKeyboardSave(handleSave)` (das macht jetzt `PagesEditorRoot`).
2. `useSaveContentPage`-Aufruf (`save = useSaveContentPage()`) + alle `save.mutate(...)` Stellen.
3. `useSaveTranslation`-Aufruf (`saveTranslation = useSaveTranslation(slug)`) + alle `saveTranslation.mutate(...)`-Stellen.
4. `usePatchContentPage`-Aufruf + `handlePatch`-Funktion + alle `handlePatch(...)`-Aufrufer (Status/showTitle/titleAlignment/displayMode/overlayWidth/contentCardStyle/Title/Slug). Inputs lesen jetzt aus `editor.meta.pages[slug].current.<field>` und schreiben via `editor.dispatch.meta`.
5. `segmentSaveRef` (SegmentManager nutzt jetzt direkt den Slice — Vollständig in Task 25/26).
6. `localeForms`-State, `buildInitialForms`-Helper, `formsSeededRef`, alle `setLocaleForms`-Calls und der zugehörige Reset-Effekt. Translation-Title/Content/Ready-Inputs lesen aus `editor.translations.byPage[slug][locale].current` und schreiben via `editor.dispatch.translations`.
7. `state.draftContent` (legacy default-locale Path) — wird durch `editor.content.pages[slug].current` ersetzt; entsprechend `editorReducer` Action `setDraftContent` raus.
8. `state.saved`/`setSaved`/`setTimeout` für saved-Notification — bleibt vorerst in T22, wird in Task 33 mit `useGlobalPagesSave().status` verdrahtet.
9. beforeunload-Effekt (Z. 562-572) — bereits durch UnsavedGuard (T20a) abgedeckt, raus.

Imports cleanen: `useSaveContentPage`, `usePatchContentPage`, `useSaveTranslation` (falls in dieser Datei sonst nicht verwendet), `useKeyboardSave`, `useRef` (falls nur für segmentSaveRef/formsSeededRef genutzt).

`EditorHeaderActions`-Aufruf: `onSave` und `isSaving`-Props bleiben in T22 noch verdrahtet (auf no-op bzw. false), Removal kommt in T23.

- [ ] **Step 4: Type-Check + Smoke**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

In `/pages/info` Title ändern → SaveBar erscheint mit `Speichern (1)` → Cmd+S → PUT `/api/admin/pages/bulk` (200) → SaveBar verschwindet → `page.title` reflektiert neuen Wert nach query-Invalidierung.

- [ ] **Step 5: Commit**

Step 0 als eigener Commit (siehe oben). Step 1-3 als zweiter Commit:

```bash
git commit -m "Refactor: ContentEditorPage edits flow through slice context

- Mount hydrates meta/content/translations slices from ContentPage
- Editor inputs (title/slug/status/displaySettings/markdown/translations) dispatch into slices
- Removed legacy save/patch/translation mutations, localeForms state, draftContent and per-component beforeunload guard; PagesEditorRoot owns Cmd+S"
```

#### Drift-Korrektur T22 (am 2026-05-03 vor Implementation)

1. **Plan-Code für `translations`-hydrate war API-falsch.** Original: `Object.entries(page.translations ?? {})` setzte Record/Object voraus. Echte API: `PageTranslation[]`. Auf `.map(t => ...)` korrigiert.
2. **`usePatchContentPage` mit-entfernt.** Plan T24 strich nur `useSaveContentPage` + `useSaveContentPageSegments`, nicht den Patch-Hook. Da Title/Slug/Status/etc.-Edits in T22 alle in `meta.set-field` ziehen, ist der Hook orphan. T24 ergänzt um Patch-Hook-Removal.
3. **Scope erweitert auf komplette Legacy-State-Pipeline.** Plan-Original sprach nur von `handleSave`-Removal; tatsächlich müssen `localeForms` (~200 Zeilen), `buildInitialForms`, `handleCreateTranslation`-Body, `handlePatch`, `state.draftContent`, beforeunload-Effekt mit. Sonst lebt parallel toter Pfad.
4. **Neue `translationsSlice.add-locale`-Action als Step 0 (rückwirkend Phase-3-Gap).** `hydrate` schreibt den `byPage`-State neu — für `handleCreateTranslation` braucht es eine lazy "neue Locale anlegen"-Operation, die andere Locales unangetastet lässt UND die Locale dirty hat (initial leer, current = neue Werte).

---

### Task 23: Lokalen Save-Button aus `EditorHeaderActions` entfernen

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx:217-281` (`EditorHeaderActionsProps.onSave` + `EditorHeaderActions`-Render-Block)

> Hinweis: Es gibt KEINE separate `PageEditorHeader.tsx`-Datei. Der Save-Button ist inline in der `EditorHeaderActions`-Komponente in ContentEditorPage.tsx (Z. 273-281). Verifiziert via `grep -rn "<PageHeader\|PageEditorHeader" apps/dashboard/src/`.

- [ ] **Step 1: Save-Button-Block (Z. 273-281) entfernen**

Diese Zeilen ersatzlos löschen:

```tsx
<button
  type="button"
  onClick={onSave}
  disabled={_isSaving}
  className="flex items-center gap-2 h-8 min-w-8 px-4 border border-[var(--ds-btn-primary-border)] text-[var(--ds-btn-primary-text)] rounded-control text-sm font-medium hover:border-[var(--ds-btn-primary-hover-border)] hover:bg-[var(--ds-btn-primary-hover-bg)] disabled:opacity-60"
>
  <DownloadIcon weight="duotone" className="w-3.5 h-3.5" />
  {saved ? editorMessages.saved : common.save}
</button>
```

- [ ] **Step 2: Props bereinigen**

Aus `EditorHeaderActionsProps` (Z. ~217) und der Destrukturierung (Z. ~236) entfernen: `onSave`, `isSaving`, `saved`, `editorMessages.saved`, `common.save`. Aufrufer (`<EditorHeaderActions … />` Z. ~795-810) entsprechend anpassen — keine Props für Save mehr durchreichen.

`DownloadIcon`-Import auf Verwendung prüfen (`grep -n DownloadIcon apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`); wenn nirgends sonst verwendet → Import entfernen.

Status-Indikator-Logik (`saved`-State, `setTimeout` aus Z. 665-669) bleibt vorerst — wird in Task 33 mit `useGlobalPagesSave().status` verdrahtet, falls sinnvoll.

- [ ] **Step 3: Type-Check + Smoke**

```bash
pnpm --filter @musiccloud/dashboard typecheck
pnpm dev:dashboard
```

In `/admin/pages/info` darf der lokale Save-Button nicht mehr erscheinen — nur SaveBar oben rechts.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/features/content/pages/ContentEditorPage.tsx
git commit -m "Refactor: Remove inline save button from EditorHeaderActions

- Global PagesSaveBar in the admin topbar handles persistence
- onSave/isSaving/saved props and DownloadIcon import dropped"
```

---

### Task 24a: orphan Write-Hooks entfernen (`usePatchContentPage` + `useSaveTranslation`)

**Files:**
- Modify: `apps/dashboard/src/features/content/hooks/useAdminContent.ts`
- Modify: `apps/dashboard/src/features/content/pages/usePageTranslations.ts`

> **Drift-Note (2026-05-03 vor Implementation, T24-Split):** Plan-Original T24 wollte alle 4 Write-Hooks in einem Schritt entfernen. Pre-Task-Audit zeigt: `useSaveContentPage` + `useSaveContentPageSegments` werden in `apps/dashboard/src/features/content/pages/SegmentManager.tsx:24-25,86-87` noch importiert — Removal blockt typecheck bis T25 SegmentManager auf segmentsSlice umstellt. Daher Split in T24a (orphan Hooks, sofort möglich) und T24b (SegmentManager-bedingte Hooks, nach T25). Reihenfolge: **T24a → T25 → T24b**.

- [ ] **Step 1: `usePatchContentPage` aus `useAdminContent.ts` löschen**

Funktion (aktuell Z. 49-59) ersatzlos entfernen. `useContentPages`, `useAdminContentPage`, `useSaveContentPage`, `useCreateContentPage`, `useDeleteContentPage`, `useSaveContentPageSegments` bleiben.

- [ ] **Step 2: `useSaveTranslation` aus `usePageTranslations.ts` löschen**

Funktion (aktuell Z. 31-42) ersatzlos entfernen. `usePageTranslations` und `useDeleteTranslation` bleiben. `TranslationPayload`-Interface bleibt (parent-Type von `TranslationRow`).

- [ ] **Step 3: typecheck clean**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

Erwartet: clean. SegmentManager nutzt nur `useSaveContentPage` + `useSaveContentPageSegments` (bleiben in T24a) — kein typecheck-Bruch.

- [ ] **Step 4: dashboard tests grün**

```bash
pnpm --filter @musiccloud/dashboard test:run
```

Erwartet: 34/34 PASS (kein Test importiert die zwei entfernten Hooks).

- [ ] **Step 5: Commit**

```bash
git commit -m "Refactor: Drop orphan write hooks usePatchContentPage + useSaveTranslation

- usePatchContentPage no longer used after T22 (meta.set-field replaces patch)
- useSaveTranslation no longer used after T22 (translations.set-field replaces it)
- useSaveContentPage + useSaveContentPageSegments stay until T24b (after T25 makes SegmentManager slice-driven)"
```

---

### Task 25: SegmentManager auf reines Label+Translations editieren reduzieren (slice-driven, schrumpfen)

> **Drift-Korrektur T25 (2026-05-03 vor Implementation, User-Beschluss):** Original T25-Scope war "lokaler draft-State raus, slice-driven". UX-Redundanz-Audit (Code-only) hat zwei zusätzliche Schrumpfungen aufgedeckt:
>
> 1. **Inline-MarkdownEditor für Target-Page (`saveTarget = useSaveContentPage()`)** im SegmentManager ist redundant zu `/pages/<targetSlug>` Editor — raus.
> 2. **Strukturelle Operationen** im SegmentManager (`addSegment`-Button, Trash-Button, ArrowUp/Down Move-Buttons) übernimmt Sidebar-DnD (Phase 6, T28-T31). Müssen aus SegmentManager raus. T26 (DnD im SegmentManager) wurde dadurch obsolet (siehe T26-Marker).
>
> Zwingend gleichzeitig: Phase-3 muss um eine `contentSlice.add-page`-Action erweitert werden (analog zu T22 Step 0 mit `translationsSlice.add-locale`), damit target-page-content additiv hydratet werden kann ohne andere Pages zu überschreiben — falls SegmentManager target-page-Content noch hydraten soll. Im aktuellen Scope (NUR Label+Translations) wird target-page-Content NICHT mehr im SegmentManager gerendert, also entfällt die add-page-Action evtl. ganz. Wenn aber für andere Konsumenten (z.B. Sidebar-DnD-Promote) gebraucht: Step 0 ausführen.
>
> Resultat-Component: SegmentManager rendert NUR noch eine Liste der Segmente mit Label-Input (+ optional Translations-Inputs pro Locale). Target-Slug ist read-only-Display. Keine Add/Remove/Reorder/Target-Reassignment/MarkdownEditor mehr. UX für strukturelle Operationen ausschließlich Sidebar (Phase 6).

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/SegmentManager.tsx` (umfassend, ~70-80% Removal)
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` (segmentSaveRef + SegmentSaveFn-Import + onSaved/saveRef-Props raus)
- Modify (falls Step 0 nötig): `apps/dashboard/src/features/content/state/slices/contentSlice.ts` (`add-page`-Action) + `apps/dashboard/src/features/content/state/__tests__/slices/contentSlice.test.ts`

- [ ] **Step 0 (optional, nur wenn anderer Konsument target-page-content additiv hydraten muss): `contentSlice.add-page`-Action (TDD)**

Reducer-Action:
```ts
| { type: "add-page"; slug: string; content: string }
```

Verhalten: legt `pages[slug] = { initial: content, current: content }` an (clean state — initial = current). Wenn `pages[slug]` bereits existiert: no-op. Andere Pages bleiben unverändert.

Tests in `__tests__/slices/contentSlice.test.ts`:
- `add-page legt neuen Eintrag mit clean state an (initial = current = content)`
- `add-page mit bereits existierendem slug ist no-op`
- `add-page eines weiteren slug ändert nicht den ersten`

Commit: `Feat: contentSlice add-page action for additive hydrate`

> Skip Step 0, falls target-page-content im SegmentManager komplett wegfällt UND kein anderer Konsument additive hydrate braucht. Beim Skip: T25 Step 1 hydratet NUR segments-Slice.

- [ ] **Step 1: Hydrate auf Mount**

In SegmentManager beim Mount:
```ts
useEffect(() => {
  editor.dispatch.segments({ type: "hydrate", entries: [{ ownerSlug: page.slug, segments: page.segments ?? [] }] });
}, [page.slug, editor.dispatch]);
```

Render liest aus `editor.segments.byOwner[page.slug].current`.

- [ ] **Step 2: Label + Translations dispatchen (NUR diese)**

Label-Edit → `editor.dispatch.segments({ type: "set-label", owner: page.slug, target, label })`.
Locale-Translation-Edit → `editor.dispatch.segments({ type: "set-translation", owner, target, locale, label })`.

KEIN `addSegment`-Dispatch (Plus-Button entfällt). KEIN `remove`-Dispatch (Trash entfällt). KEIN `reorder`-Dispatch (Move-Buttons entfallen). KEIN target-Reassignment-Dispatch (Dropdown entfällt — Target ist read-only Anzeige).

- [ ] **Step 3: target-page-Inline-MarkdownEditor + saveTarget-Pfad raus**

Aus `SegmentManager.tsx`:
- `useSaveContentPage`-Aufruf (`saveTarget`) + alle `saveTarget.mutateAsync`-Stellen
- `useAdminContentPage(activeTargetSlug)`-Lookup
- `targetDraftContent`-State + `setTargetDraftContent`-Setter
- `<MarkdownEditor>`-Block für target-page (Z. 433-441 im pre-T25-Code)
- `saveRef.current` Save-Logik für target-page (Z. 178-189 inkl. `if (currentTargetPage && currentTargetSlug && currentDraftContent !== null …)`-Block)
- `<DashboardSegmentedControl>`-Preview-Section (visualisiert Tab-Bar — nicht edit-funktional)
- `activeIndex`-State + `setActiveIndex` (kein Preview mehr → kein active-Index-Tracking)

Aus `ContentEditorPage.tsx`:
- `segmentSaveRef = useRef<SegmentSaveFn | null>(null)`
- `SegmentSaveFn`-Type-Import
- `<SegmentManager>`-Aufruf: `onSaved`/`saveRef`-Props raus

Aus `SegmentManager.tsx` `Props`-Interface:
- `onSaved` weg
- `saveRef` weg
- `SegmentSaveFn`-Type-Export weg (nur intern kein Konsument mehr)

- [ ] **Step 4: addSegment-Button + Trash-Button + Move-Buttons + Target-Dropdown raus**

Aus `SegmentManager.tsx` Markup:
- `text.addSegment`-Button im DashboardSection-Header (`addOn`-Slot)
- ArrowUp/ArrowDown-Move-Buttons pro Row (Z. 344-362 im pre-T25-Code)
- TrashIcon-Remove-Button pro Row (Z. 363-370)
- Target-Dropdown (Z. 322-334) — ersetzt durch read-only `<span>/{targetSlug}</span>`
- `addSegment`/`remove`/`move`/`update`-Funktionen
- ArrowUpIcon/ArrowDownIcon Phosphor-Imports
- `text.moveUp`/`text.moveDown`/`text.remove`/`text.addSegment`/`text.invalidSegments`/`text.empty` werden in dieser Datei nicht mehr referenziert (i18n-File NICHT anrühren — Strings bleiben für etwaige spätere Verwendung)

- [ ] **Step 5: useState + Helpers raus**

State-Slots aus `SegmentManager.tsx`:
- `draft: DraftSegment[]` weg (slice-driven)
- `error: string | null` weg (kein client-side validation mehr — globaler Save handhabt das via INVALID_INPUT-Response)
- `activeIndex` weg (kein Preview)
- `targetDraftContent` weg (kein Inline-Editor)
- `expandedRows` BLEIBT (Translation-Expand pro Row ist UX-Komfort, lokaler UI-State)

Helpers aus `SegmentManager.tsx`:
- `DraftSegment`-Interface weg
- `localId`-Konzept weg (`server-${id}` / `nextLocalId`) — React-keys nutzen `targetSlug` (unique pro owner per Slice-Constraint)
- `toDraft`/`nextLocalId` weg
- `translationsEqual`/`segmentsEqual` weg (nur für draft-vs-server-comparison gebraucht, jetzt slice-handle)

Imports cleanen: `ArrowUpIcon`, `ArrowDownIcon`, `EyeIcon`, `MarkdownEditor`, `useAdminContentPage`, `useSaveContentPage`, `useSaveContentPageSegments`, `MutableRefObject`, `useRef`, `useMemo` (falls nur für `defaultPages` gebraucht — entfällt mit Target-Dropdown), `DashboardSegmentedControl`, `Dropdown`/`DropdownOption`, `useContentPages` (falls nur für `defaultPages` gebraucht).

- [ ] **Step 6: Type-Check + Tests + Smoke**

```bash
pnpm --filter @musiccloud/dashboard typecheck
pnpm --filter @musiccloud/dashboard test:run
```

Smoke (`/pages/info` segmented page):
- Liste der Segmente sichtbar, jedes mit Label-Input + Translations-Expand
- Label editieren → SaveBar zählt hoch (`Speichern (1)`)
- Translation editieren → SaveBar zählt hoch
- KEIN Add/Remove/Reorder-Button im SegmentManager
- KEINE target-page-Content-Editier-Section
- Cmd+S → PUT `/api/admin/pages/bulk` 200 → SaveBar weg
- Strukturelle Ops (add/remove/reorder) werden in Phase 6 via Sidebar-DnD nachgereicht; im T25-Smoke nicht testbar.

- [ ] **Step 7: Commit**

```bash
git commit -m "Refactor: Shrink SegmentManager to label+translations editing only

- Hydrate segments slice on mount; render reads from slice
- Label and translation edits dispatch into segmentsSlice via set-label / set-translation
- Remove inline target-page MarkdownEditor + saveTarget path (canonical edit lives at /pages/<target>)
- Remove addSegment / Trash / Move buttons and target-Dropdown (Sidebar-DnD owns structural ops; T26 obsolete)
- ContentEditorPage drops segmentSaveRef + SegmentSaveFn type and the onSaved/saveRef props on SegmentManager
- DraftSegment / localId / toDraft / segmentsEqual / translationsEqual helpers no longer needed"
```

> Hinweis: Strukturelle Operationen (add/remove/reorder/promote/demote) werden in Phase 6 via Sidebar-DnD geliefert (T27-T31). Vor Phase 6 hat User keinen Pfad zum Add/Remove/Reorder von Segmenten — falls dieser Übergangs-Gap UX-blockend ist, alternative: Schrumpfung verzögern bis Phase 6 fertig ist und T25 als monolithischer Schnitt nach T31 ausführen. Entscheidung User.

---

### Task 24b: SegmentManager-bedingte Write-Hooks entfernen (`useSaveContentPage` + `useSaveContentPageSegments`)

**Pre-Condition:** T25 ist fertig (SegmentManager.tsx ist slice-driven, importiert `useSaveContentPage`/`useSaveContentPageSegments` nicht mehr).

**Files:**
- Modify: `apps/dashboard/src/features/content/hooks/useAdminContent.ts`

- [ ] **Step 1: Hooks aus `useAdminContent.ts` löschen**

Funktionen ersatzlos entfernen:
- `useSaveContentPage`
- `useSaveContentPageSegments`

Read-Hooks (`useContentPages`, `useAdminContentPage`), `useCreateContentPage` und `useDeleteContentPage` bleiben.

- [ ] **Step 2: typecheck clean**

```bash
pnpm --filter @musiccloud/dashboard typecheck
```

Erwartet: clean. Wenn rot: T25-Cleanup nicht vollständig — SegmentManager (oder anderer Konsument) importiert noch.

- [ ] **Step 3: dashboard tests grün**

```bash
pnpm --filter @musiccloud/dashboard test:run
```

- [ ] **Step 4: Commit**

```bash
git commit -m "Refactor: Drop remaining write hooks for content pages — slice state owns mutations

- useSaveContentPage and useSaveContentPageSegments removed
- Bulk endpoint via useGlobalPagesSave handles all write paths now
- Read hooks (useContentPages, useAdminContentPage), useCreateContentPage, useDeleteContentPage and useDeleteTranslation unchanged"
```

---

### Task 26: SegmentManager: Move-Up/Down → Drag-Handle (DnD)

> **OBSOLETE per User decision (2026-05-03):** SegmentManager wird in T25 auf reines Label+Translations-Editieren reduziert (siehe T25-Drift-Korrektur). Reorder läuft ausschließlich über Sidebar-DnD (T28-T29). Move-Buttons + DnD-Handle im SegmentManager fallen mit der T25-Schrumpfung weg, kein eigener DnD-Refactor nötig. Steps unten bleiben als historische Referenz, werden NICHT ausgeführt.

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/SegmentManager.tsx:349-361` (Move-Buttons-Block)

- [ ] **Step 1: dnd-kit Imports hinzufügen**

Pattern aus `NavManagerPage.tsx:1-17` übernehmen.

- [ ] **Step 2: Liste in `DndContext` + `SortableContext` wrappen**

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={list.map((s) => s.targetSlug)} strategy={verticalListSortingStrategy}>
    {list.map((s, i) => <SortableSegmentRow key={s.targetSlug} segment={s} index={i} … />)}
  </SortableContext>
</DndContext>
```

`handleDragEnd`:
```ts
function handleDragEnd(e: DragEndEvent) {
  if (!e.over || e.active.id === e.over.id) return;
  const oldIndex = list.findIndex((s) => s.targetSlug === e.active.id);
  const newIndex = list.findIndex((s) => s.targetSlug === e.over!.id);
  editor.dispatch.segments({ type: "reorder", owner: page.slug, from: oldIndex, to: newIndex });
}
```

- [ ] **Step 3: `SortableSegmentRow` mit `useSortable` + Handle**

```tsx
function SortableSegmentRow({ segment, … }: …) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: segment.targetSlug });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="…segment-row…">
      <button type="button" {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <DotsSixVerticalIcon weight="duotone" className="w-4 h-4" />
      </button>
      {/* … bestehender Row-Inhalt: NumberCircleIcon, Label-Input, Target-Dropdown, Delete-Button … */}
    </div>
  );
}
```

ArrowUp/ArrowDown-Buttons im Imports + im Markup raus. `text.moveUp`/`text.moveDown`-Strings aus den i18n-Texten entfernen.

- [ ] **Step 4: Smoke**

In `/admin/pages/info` Segmente per Drag verschieben → SaveBar dirty → Save → Server-Reihenfolge übernommen.

- [ ] **Step 5: Commit**

```bash
git commit -m "Feat: SegmentManager replaces Move buttons with dnd-kit drag handle

- DotsSixVerticalIcon handle in each segment row
- Reorder dispatches into segmentsSlice; same data path as sidebar moves"
```

---

## Phase 6 — Sidebar DnD

### Task 26.5: Provider-Hoist + globale PagesSaveBar (Voraussetzung für Phase 6)

> **Drift-Korrektur (2026-05-03 vor Phase 6):** Phase 6 (T28-T30) dispatcht in der Sidebar via `usePagesEditor()`. `Sidebar` lebt aber im AdminLayout (`AdminLayout.tsx:148,208`), `PagesEditorProvider` war auf `/pages/*` eingegrenzt (über `PagesEditorRoot.tsx`). Auf jeder anderen Route hätte `usePagesEditor()` geworfen. Lösung: Provider + PagesSaveBar-Portal-Mount + Cmd+S-Bindings + UnsavedGuard hochziehen ins AdminLayout, damit der Editor-Context überall verfügbar ist und die SaveBar erscheint, wenn Sidebar-DnD von beliebiger Route aus dirty erzeugt. Originaler Plan-T21 wollte ohnehin "PagesSaveBar im AdminLayout-Topbar" — die T21-Drift-Korrektur hat das nur deshalb auf `/pages/*` eingegrenzt, weil dirty-state damals nur dort entstand.

**Files:**
- Modify: `apps/dashboard/src/components/layout/AdminLayout.tsx` (PagesEditorProvider wraps AdminLayoutInner; `PagesSaveBarMount` portalt SaveBar in den page-header-actions-slot; `PagesEditorBindings` hängt useGlobalPagesSave + Cmd+S; UnsavedGuard inline)
- Modify: `apps/dashboard/src/App.tsx` (lazy-import `PagesEditorRoot` raus; `path="pages"` und `path="pages/:slug"` als Geschwister)
- Delete: `apps/dashboard/src/features/content/PagesEditorRoot.tsx`

- [x] **Step 1: AdminLayout-Hoist** — Provider/Portal-Mount/Bindings/UnsavedGuard wrappen AdminLayoutInner. PagesSaveBar via `createPortal` in `actionsEl` (identisch zur bisherigen Position).
- [x] **Step 2: App.tsx entnesten** — `<Route path="pages">` und `<Route path="pages/:slug">` als Siblings; `PagesEditorRoot`-Import entfernt.
- [x] **Step 3: PagesEditorRoot.tsx löschen** — keine Konsumenten mehr.
- [x] **Step 4: Gates** — `pnpm --filter @musiccloud/dashboard typecheck` clean, `test:run` 41/41 ✓, biome clean.

**Sicherheits-Audit für globalen Mount:**
- `PagesSaveBar.tsx:19` returned `null` bei `dirtyCount === 0` → kein Visual-Leak auf Non-Pages-Routen.
- `UnsavedGuard.tsx:18-32` ist effect-only, no-op bei leerem dirty → kein Side-Effect.
- Provider-Initial-State `{ pages: {} }` / `{ byOwner: {} }` / `{ initial: [], current: [] }` → keine Hydrate-Side-Effects ohne expliziten Dispatch.

Commit:
```bash
git commit -m "Refactor: Hoist PagesEditorProvider into AdminLayout for app-wide dirty state

- Provider wraps AdminLayoutInner so Sidebar (and any future global consumer) can dispatch into the editor
- PagesSaveBar portal-mounts into the page-header actions slot from AdminLayout (was scoped to /pages routes via PagesEditorRoot)
- UnsavedGuard + Cmd+S bindings hoisted alongside
- PagesEditorRoot removed; /pages routes flatten back to siblings"
```

---

### Task 27: Sidebar `DndContext`-Wrapper + Sensors

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx` (PagesGroup-Komponente, Z. 172+)

- [ ] **Step 1: DnD-Wrapper um den PagesGroup-Body**

```tsx
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);

<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  {/* render rowSpecs */}
</DndContext>
```

- [ ] **Step 2: `handleDragEnd`-Stub**

Wird in den nächsten Tasks (28-30) befüllt. Vorerst:

```ts
function handleDragEnd(e: DragEndEvent) {
  // dispatched in tasks 28–30 based on active.id and over.id prefixes
}
```

- [ ] **Step 3: Smoke**

Sidebar rendert weiterhin korrekt (kein DnD-Verhalten yet, aber kein Bruch).

- [ ] **Step 4: Commit**

```bash
git commit -m "Refactor: Wrap Sidebar pages group in dnd-kit DndContext"
```

---

### Task 28: Top-Level-Reorder via SortableContext

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Top-Level-Items als Sortable**

```tsx
<SortableContext
  items={segmentedBlocks.map(({ parent }) => `top:${parent.slug}`)}
  strategy={verticalListSortingStrategy}
>
  {segmentedBlocks.map(({ parent, children }, blockIdx) => (
    <SortableTopLevelRow key={parent.slug} parent={parent} … />
  ))}
</SortableContext>
```

`handleDragEnd`-Erweiterung:

```ts
if (active.id.startsWith("top:") && over.id.startsWith("top:")) {
  const fromSlug = active.id.slice(4);
  const toSlug = over.id.slice(4);
  const order = editor.sidebar.current.length > 0 ? editor.sidebar.current : segmentedBlocks.map((b) => b.parent.slug);
  const from = order.indexOf(fromSlug);
  const to = order.indexOf(toSlug);
  if (from < 0 || to < 0) return;
  if (editor.sidebar.current.length === 0) {
    editor.dispatch.sidebar({ type: "hydrate", topLevelOrder: order });
  }
  editor.dispatch.sidebar({ type: "reorder-top-level", from, to });
}
```

- [ ] **Step 2: `SortableTopLevelRow`**

`useSortable({ id: \`top:${parent.slug}\` })` analog NavManagerPage. Drag-Handle ist die ganze Row (Klick auf den Tree-Stub greift, Hover→`cursor: grab`).

- [ ] **Step 3: Smoke**

Top-Level Page (z.B. `info`) per Drag unter `help` ziehen → SaveBar dirty → Save → DB `position` aktualisiert.

- [ ] **Step 4: Commit**

```bash
git commit -m "Feat: Sidebar top-level segmented parents reorder via DnD"
```

---

### Task 29: Cross-Parent Sub-Page-Move

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Inner SortableContext per Owner**

Innerhalb jedes `SortableTopLevelRow`:

```tsx
<SortableContext
  items={children.map((c) => `child:${parent.slug}:${c.slug}`)}
  strategy={verticalListSortingStrategy}
>
  {children.map((c) => <SortableChildRow key={c.slug} parent={parent.slug} child={c} … />)}
</SortableContext>
```

- [ ] **Step 2: `handleDragEnd`-Branch**

```ts
if (active.id.startsWith("child:") && over.id.startsWith("child:")) {
  const [, fromOwner, target] = active.id.split(":");
  const [, toOwner, overTarget] = over.id.split(":");
  if (fromOwner === toOwner) {
    const items = editor.segments.byOwner[fromOwner]?.current ?? [];
    const from = items.findIndex((s) => s.targetSlug === target);
    const to = items.findIndex((s) => s.targetSlug === overTarget);
    if (from < 0 || to < 0) return;
    editor.dispatch.segments({ type: "reorder", owner: fromOwner, from, to });
  } else {
    const targetList = editor.segments.byOwner[toOwner]?.current ?? [];
    const insertAt = targetList.findIndex((s) => s.targetSlug === overTarget);
    editor.dispatch.segments({
      type: "move",
      target,
      from: fromOwner,
      to: toOwner,
      position: insertAt < 0 ? targetList.length : insertAt,
    });
  }
}
```

- [ ] **Step 3: Smoke**

Sub-Page `privacy` von `help` nach `info` ziehen → SaveBar `Speichern (1)` (segments-Gruppe) → Save persistiert.

- [ ] **Step 4: Commit**

```bash
git commit -m "Feat: Sidebar sub-page move within and across segmented parents"
```

---

### Task 30: Promote/Demote über Orphan-Drop-Zone

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Orphan-Section als Sortable + Promote-Drop-Zone**

Orphan-Section bekommt `SortableContext` mit IDs `orphan:${slug}`. Zusätzlich: jede Segment-Owner-Section akzeptiert Drops mit IDs `orphan:*` (= Promote).

Branches in `handleDragEnd`:

```ts
// orphan reorder
if (active.id.startsWith("orphan:") && over.id.startsWith("orphan:")) {
  // Reorder is purely visual today — orphan order is not persisted (only segmented parents have position).
  // Skip dispatch.
}
// child → orphan = demote
if (active.id.startsWith("child:") && over.id.startsWith("orphan:")) {
  const [, owner, target] = active.id.split(":");
  editor.dispatch.segments({ type: "remove", owner, target });
}
// orphan → child = promote
if (active.id.startsWith("orphan:") && over.id.startsWith("child:")) {
  const target = active.id.slice(7);
  const [, toOwner, overTarget] = over.id.split(":");
  const list = editor.segments.byOwner[toOwner]?.current ?? [];
  const insertAt = list.findIndex((s) => s.targetSlug === overTarget);
  editor.dispatch.segments({ type: "add", owner: toOwner, target, position: insertAt < 0 ? list.length : insertAt });
}
```

- [ ] **Step 2: Promote: Page-Type bleibt `default`**

Promote ändert nur die Segment-Liste — die Orphan-Page hat schon `pageType=default`, was die Spec verlangt. Demote umgekehrt: das `remove` aus dem Slice macht die Page wieder zur Orphan, weil der nächste `listContentPages` sie nicht mehr in `renderedChildren` filtert.

- [ ] **Step 3: Smoke**

Demote: `privacy` (unter info) auf eine Orphan-Position ziehen → erscheint als Orphan → Save → Server bestätigt.
Promote: Orphan auf info-Sub-Page-Position ziehen → erscheint dort → Save → Server bestätigt.

- [ ] **Step 4: Commit**

```bash
git commit -m "Feat: Sidebar promote/demote between segmented children and orphans"
```

---

### Task 31: Visuelles DnD-Feedback

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Drag-Preview + Drop-Indicator**

`useSortable` liefert `isDragging` → `opacity: 0.5` auf das Original. Drop-Hover via `useDroppable`-isOver für die Drop-Zones zwischen Items: 2px-Linie in `var(--color-primary)`. Cursor-CSS `cursor-grab active:cursor-grabbing` auf dem Drag-Handle.

- [ ] **Step 2: Manueller Smoke**

Visuell prüfen, dass Drag-Preview folgt, Hover-Linie sichtbar ist, Cursor wechselt.

- [ ] **Step 3: Commit**

```bash
git commit -m "Polish: Sidebar DnD visual feedback (preview opacity, drop indicator)"
```

---

## Phase 7 — Dirty-Indicators

### Task 32: Sidebar Dirty-Punkt rechts neben Page-Title

**Files:**
- Modify: `apps/dashboard/src/components/layout/Sidebar.tsx` (PageTreeContent, Z. 159-170)

- [ ] **Step 1: Selector-Helpers in den Slices ergänzen**

In `metaSlice.ts` ans File-Ende:

```ts
export function isMetaDirty(s: MetaState, slug: string): boolean {
  const e = s.pages[slug];
  if (!e) return false;
  for (const k of Object.keys(e.current) as Array<keyof typeof e.current>) {
    if (e.initial[k] !== e.current[k]) return true;
  }
  return false;
}
```

In `contentSlice.ts` ans File-Ende:

```ts
export function isContentDirty(s: ContentState, slug: string): boolean {
  const e = s.pages[slug];
  if (!e) return false;
  return e.initial !== e.current;
}
```

- [ ] **Step 2: Punkt im Sidebar-Render**

In `PageTreeContent` (Z. 159-170):

```tsx
import { isMetaDirty } from "@/features/content/state/slices/metaSlice";
import { isContentDirty } from "@/features/content/state/slices/contentSlice";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";

function PageTreeContent({ page, icon }: { page: { slug: string; title: string; status: string }; icon: ReactNode }) {
  const editor = usePagesEditor();
  const dirty = isMetaDirty(editor.meta, page.slug) || isContentDirty(editor.content, page.slug);
  return (
    <>
      {icon}
      <PageStatusIcon status={page.status} />
      <span className="flex flex-col min-w-0">
        <span className="truncate">{page.title}</span>
        <span className="truncate text-xs opacity-50">/{page.slug}</span>
      </span>
      {dirty && (
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]"
          aria-label="ungespeichert"
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Smoke**

Title in `/admin/pages/info` ändern → in der Sidebar erscheint Punkt rechts neben „Info".

- [ ] **Step 3: Commit**

```bash
git commit -m "Feat: Show unsaved indicator dot next to dirty page titles in sidebar"
```

---

### Task 33: Locale-Tab-Punkt im PageEditor

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` (Locale-Tabs-Block, per `grep -n "LOCALES" ContentEditorPage.tsx`)

- [ ] **Step 1: Selector-Helper in `translationsSlice.ts`**

```ts
export function isTranslationDirty(s: TranslationsState, slug: string, locale: string): boolean {
  const entry = s.byPage[slug]?.[locale];
  if (!entry) return false;
  return (
    entry.initial.title !== entry.current.title ||
    entry.initial.content !== entry.current.content ||
    entry.initial.translationReady !== entry.current.translationReady
  );
}
```

- [ ] **Step 2: Punkt am Tab-Label**

Im Tab-Render-Loop:

```tsx
import { isTranslationDirty } from "@/features/content/state/slices/translationsSlice";
import { usePagesEditor } from "@/features/content/state/PagesEditorContext";
const editor = usePagesEditor();

{LOCALES.map((locale) => {
  const dirty = isTranslationDirty(editor.translations, slug, locale);
  return (
    <Tab key={locale} active={locale === activeLocale} onClick={() => setActiveLocale(locale)}>
      {locale.toUpperCase()}
      {dirty && <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />}
    </Tab>
  );
})}
```

- [ ] **Step 2: Smoke**

In `/admin/pages/info` zur DE-Tab wechseln, Title editieren → Punkt am DE-Tab.

- [ ] **Step 3: Commit**

```bash
git commit -m "Feat: Show dirty indicator on locale tabs in page editor"
```

---

## Phase 8 — Verifikation + Migration-Rollout

### Task 34: e2e Smoke via chrome-devtools-mcp

**Files:** keine.

- [ ] **Step 1: Dev-Server starten** (sind laut SESSION.md schon up — falls nicht: `pnpm dev:all`)

- [ ] **Step 2: Smoke-Plan laufen lassen**

Per `chrome-devtools-mcp:chrome-devtools` Skill:
1. Login → `/admin/pages/info` öffnen → Title ändern → SaveBar zeigt `Speichern (1)` → Cmd+S → SaveBar verschwindet → Reload → Title persistiert.
2. Sub-Page `privacy` per Drag von `help` nach `info` → SaveBar `Speichern (1)` → Save → Sidebar zeigt korrekte Hierarchie.
3. `/admin/pages/info` neu Title editieren → URL-Wechsel via Sidebar → Confirm-Modal blockt (`useBlocker`).
4. Verwerfen-Button drücken → Confirm-Modal → Bestätigen → SaveBar weg → keine DB-Änderung.
5. Top-Level: `info` und `help` umsortieren → Save → Reload → Reihenfolge persistiert.
6. Promote: Orphan-Page in `info` reinziehen → Save → erscheint als Sub-Page von `info`.
7. Demote: `info`-Sub-Page raus auf Orphan-Position → Save → erscheint als Orphan.

- [ ] **Step 3: Backend-Logs auf 200/400 prüfen**

Im backend-Terminal sollten alle Saves `200` schicken. Provoziere einmal einen Fehler (z.B. Slug-Rename auf bereits existierenden Slug) → erwartet `400` mit `details[]`.

- [ ] **Step 4: Commit (falls Smoke Anpassungen aufdeckt)**

Sonst kein Commit (kein Code).

---

### Task 35: Migration in Prod ausspielen + Verifikation

**Files:** keine (nur Operations).

- [ ] **Step 1: Lokal nochmal full clean run**

```bash
DATABASE_URL=postgres://… node scripts/migrate.mjs
```

Erwartet: `No pending migrations.` (lief schon in Task 1).

- [ ] **Step 2: Prod-Migration prüfen-und-bestätigen**

User-Approval einholen. Prod-Rollout läuft canonical über Backend-Boot (Zerops-Container-Restart). KEIN `scripts/migrate.mjs`, KEIN manueller `INSERT INTO __drizzle_migrations` — Drizzle's `runMigrations()` pflegt den Tracker automatisch (siehe Memory `project_dual_migration_trackers`).

Schritte:

1. Push der Session-Commits (siehe Step 5 unten — separater git push) triggert das Zerops-Auto-Deploy. Backend-Container restarted, ruft beim Boot `runMigrations()`.
2. Im Zerops-Dashboard die Backend-Logs verfolgen. Erwartet:

   ```
   [DB] Running migrations from .../apps/backend/src/db/migrations/postgres
   [DB] All migrations applied successfully
   ```

3. Bei Migration-Fail crasht der Container loud (per `run-migrations.ts:55-61` ist das bewusste Verhalten — kein silent fail). In dem Fall: Logs prüfen, Migration-Script auf Prod-DB-State anpassen, neu deployen.

- [ ] **Step 3: Health-Check + Tracker-Verifikation**

```bash
# Health-Endpoint pingen (nach Container-Restart)
curl -s https://<prod-host>/api/healthz

# Drizzle-Tracker auf Prod prüfen
psql "$PROD_DATABASE_URL" -c "
  SELECT hash, to_timestamp(created_at / 1000) AS applied_at
    FROM drizzle.__drizzle_migrations
   ORDER BY created_at DESC LIMIT 1;
"
```

Erwartet: Health-Endpoint antwortet 200; letzter Tracker-Eintrag ist die neue Migration (Hash = SHA256 der `<NNNN>_<random_words>.sql`-Datei).

- [ ] **Step 4: Funktional verifizieren**

In Prod-Dashboard `/admin/pages/info` öffnen → Save-Bar erscheint nicht (kein dirty State) → eine Sub-Page reorder testen → Save klappt.

- [ ] **Step 5: Plan archivieren + Push-Bundle**

```bash
git mv .claude/plans/open/2026-05-02-pages-global-save-and-dnd.md .claude/plans/done/2026-05-02-pages-global-save-and-dnd.md
git commit -m "Docs: Archive completed pages global save + DnD plan"

# Per User-Wunsch alle Session-Commits gemeinsam pushen → triggert Zerops-Deploy
git push origin main
```

> Reihenfolge-Hinweis: Push triggert den Prod-Deploy; das obige Verifikations-Block (Step 3+4) findet erst nach erfolgreichem Container-Restart statt.

---

## Anhang: Open Questions / Risiken

- **Page-Translations Re-Hydrate** nach Save (Task 18 Step 2): Spec sagt Response = full snapshot, aber das aktuelle `listContentPageSummaries` enthält keine `translations`. Entweder Snapshot-Endpoint erweitern oder nach Save eine zweite Query (`useAdminContentPage(slug)`-Refetch) anstoßen. Beim Plan-Execute bevorzugt: erweitern (eine Query weniger). Falls Aufwand zu groß: refetch akzeptabel.
- **Orphan-Reorder** (Task 30 Step 1): Orphans haben aktuell kein `position` (Spalte ist nur auf segmented Parents wirksam). Plan dispatched bewusst nichts für orphan-zu-orphan-Drags. Falls UX das später braucht: Folge-Plan nötig.
- **`useBlocker` API**: React Router v6.4+ `useBlocker` erwartet ein Result-Objekt mit `state`/`proceed`/`reset`. Plan-Code in T20 setzt das voraus. Falls die im Repo eingesetzte React-Router-Version eine ältere Variante hat (`useBlocker(callback)` mit Boolean-Rückgabe), muss `UnsavedGuard` umgebaut werden — der 3-Optionen-Flow bleibt aber dieselbe Logik.
- **Cleanup alter per-Resource Routes** (`PUT /admin/pages/:slug/segments` etc.): bewusst out-of-scope dieses Plans (siehe Spec §"Migrationsplan"). Folge-Plan nach Cut-Over.
- **Index-Parität für `content_pages.position`**: existing musiccloud-Schema hat Policy `idx_<table>_<orderby_cols>` mit Justification-Kommentar für jeden ORDER-BY-Pfad (siehe `page_segments` Z. 476). T2 hat ORDER BY auf `position ASC, created_at DESC` umgestellt ohne backing index — bei aktuell 6 admin-curated rows YAGNI. Falls die Tabelle irgendwann wächst (z.B. durch Auto-Page-Creation): `index("idx_content_pages_position_created_at").on(table.position, table.createdAt.desc())` als Migration nachschieben.
