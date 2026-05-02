# Spec: Pages Global Save + Drag-and-Drop Hierarchie

**Datum:** 2026-05-02
**Bereich:** `/admin/pages/*` (Dashboard) + Backend Bulk-API
**Sprache:** Deutsch (interner Plan), Code/Commits/öffentliche Doku Englisch

## Motivation

Heute hat der `/admin/pages/*`-Bereich verteilte Save-Buttons (PageEditorHeader für Content/Translations, separater Save-Flow im SegmentManager) und keine Möglichkeit, Sub-Pages oder Top-Level segmented Pages per Drag-and-Drop umzusortieren. Reorder läuft heute über Move-Up/Down-Buttons; Cross-Parent-Moves sind gar nicht möglich.

Das führt zu:
- Inkonsistenten Save-Vorgängen: Translations werden separat von Segments separat von Page-Meta gespeichert.
- Keiner echten Atomicity über Resource-Grenzen — z.B. eine Cross-Parent-Segment-Verschiebung würde heute zwei API-Calls brauchen, und ein partial-fail liesse die DB inkonsistent (siehe Phantom-Segment-Bug aus `2026-05-02-segment-manager-no-auto-target.md`).
- UI-Schwäche: Reorder per Button-Klick ist umständlich; Cross-Parent-Move geht nur über manuelle Bearbeitung im SegmentManager.

## Goal

Im `/admin/pages/*`-Bereich:

1. **Ein einziger globaler Save-Button** in der AdminLayout-Topbar (route-bound). Speichert alle dirty Resources des Bereichs (Page-Meta, Page-Content, Segments, Segment-Translations, Page-Translations, Sidebar-Order) in **einer DB-Transaktion**. Cmd+S delegiert an denselben Save.
2. **Drag-and-Drop in der Sidebar** für: Sub-Pages innerhalb eines segmented Parents, Sub-Pages cross-parent, Top-Level segmented Parents, Orphan Default-Pages (inkl. Promote/Demote).
3. **Drag-and-Drop im SegmentManager** ersetzt die Move-Up/Down-Buttons.
4. **Draft-Modus**: alle Edits sind clientseitig dirty bis zum Save; bestehende per-Resource Save-Knöpfe entfallen.
5. **Kein Undo** in dieser Spec (kann später als eigene Spec ergänzt werden).

Out of scope: Multi-User-Konflikte, Server-side Audit-Trail/Versioning, andere Admin-Bereiche (Nav, Email-Templates, Forms etc. behalten ihre lokalen Save-Flows).

## Architektur

### State-Management — Approach: Composable Slices + Dirty-Registry

```
                ┌────────────────────────────────────────┐
                │   AdminLayout Topbar (in /admin/pages) │
                │   [Save (3)] [Verwerfen]               │  ← only when dirty.size > 0
                └──────────────┬─────────────────────────┘
                               │ click / Cmd+S
                               ▼
                    ┌──────────────────────┐
                    │  useGlobalPagesSave  │
                    └──────────────────────┘
                               │
            ┌─────────┬─────────┼─────────┬─────────┐
            ▼         ▼         ▼         ▼         ▼
       sidebarSlice  contentSlice  metaSlice  segmentsSlice  translationsSlice
            │         │         │         │         │
            └─────────┴─────────┼─────────┴─────────┘
                                ▼
                       ┌───────────────────┐
                       │  DirtyRegistry    │
                       └───────────────────┘
                                │
                                ▼
                  PUT /admin/pages/bulk  (one DB-TX)
```

#### Slices

Jeder Slice ist ein eigener Zustand-Bereich mit `initial`/`current` Snapshot und meldet sich beim `DirtyRegistry` an, wenn `current` von `initial` abweicht.

| Slice | Verantwortung |
|---|---|
| `sidebarSlice` | Top-Level-Order der segmented Parents (`topLevelOrder: Slug[]`). Drop in Sidebar-Top-Level-Zone schreibt hier. |
| `metaSlice` | Pro Page: title, slug, status, displayMode, overlayWidth, titleAlignment, contentCardStyle, showTitle, pageType. |
| `contentSlice` | Pro Page: markdown body. |
| `segmentsSlice` | Pro Owner-Slug: `Array<{position, label, targetSlug}>`. Sidebar-Cross-Parent-Move touched **zwei** Owner-Einträge gleichzeitig. |
| `translationsSlice` | Pro Page-Slug: alle Locale-Übersetzungen (title, content, translationReady). Pro Segment-ID: alle Locale-Label-Übersetzungen. |

#### Dirty-Registry

Einfaches `Set<SliceKey>` mit Subscribe-API. SliceKeys sind:
- `"sidebar"` — top-level order
- `"meta:<slug>"` pro Page
- `"content:<slug>"` pro Page
- `"segments:<owner-slug>"` pro segmented Parent
- `"translations:<slug>"` pro Page (kombiniert alle Locales) bzw. `"segment-translations:<segment-id>"`

Zähler im Save-Button = Anzahl distinct `"resource"`-Gruppen (`pages`, `segments`, `translations`, `sidebar`), nicht Anzahl SliceKeys — sonst irritiert ein Cross-Parent-Move (zwei Slices) den User.

### Frontend — Files

#### Neu

| Datei | Zweck |
|---|---|
| `apps/dashboard/src/features/content/state/PagesEditorContext.tsx` | Provider mit Slices + DirtyRegistry; wraps `/admin/pages/*`-Routen |
| `apps/dashboard/src/features/content/state/slices/sidebarSlice.ts` | top-level order |
| `apps/dashboard/src/features/content/state/slices/metaSlice.ts` | per-page meta |
| `apps/dashboard/src/features/content/state/slices/contentSlice.ts` | per-page content |
| `apps/dashboard/src/features/content/state/slices/segmentsSlice.ts` | per-owner segments |
| `apps/dashboard/src/features/content/state/slices/translationsSlice.ts` | translations |
| `apps/dashboard/src/features/content/state/dirtyRegistry.ts` | dirty-set + subscribe |
| `apps/dashboard/src/features/content/state/useGlobalPagesSave.ts` | sammelt diffs, ruft Bulk-Endpoint, resetted Slices |
| `apps/dashboard/src/features/content/state/diff.ts` | `current vs initial` → bulk-payload |
| `apps/dashboard/src/components/layout/PagesSaveBar.tsx` | Topbar-Save-Button + Counter + Verwerfen |

#### Modifiziert

| Datei | Änderung |
|---|---|
| `apps/dashboard/src/components/layout/AdminLayout.tsx` | mounted `<PagesSaveBar>` wenn Route unter `/admin/pages/*` |
| `apps/dashboard/src/components/layout/Sidebar.tsx` | DnD-Wrapper (`DndContext`/`SortableContext`); Drop-Zones für Top-Level, Segment-Children, Orphans; dispatch in `sidebarSlice` + `segmentsSlice` |
| `apps/dashboard/src/features/content/pages/SegmentManager.tsx` | Move-Up/Down-Buttons → Drag-Handle (`DotsSixVerticalIcon`); lokaler `draft`-State weg, liest aus `segmentsSlice` |
| `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` | PageEditorHeader-Save-Button raus; Edits dispatchen in Slices statt eigene Mutationen |
| `apps/dashboard/src/features/content/hooks/useAdminContent.ts` | Write-Hooks (`useSaveContentPage`, `useSaveContentPageSegments`) entfernt; Read-Hooks bleiben |

### Backend — Files

#### Neu

| Datei | Zweck |
|---|---|
| `apps/backend/src/services/admin-pages-bulk.ts` | Bulk-Save-Service mit Validierung + Drizzle-TX |
| `apps/backend/src/__tests__/admin-pages-bulk.test.ts` | Tests (siehe Test-Sektion) |

#### Modifiziert

| Datei | Änderung |
|---|---|
| `apps/backend/src/routes/admin-content.ts` | neue Route `PUT /admin/pages/bulk`. Alte per-Resource-Routes (PATCH /admin/pages/:slug, PUT /admin/pages/:slug/segments etc.) bleiben zunächst — sie sind getestet (`admin-segments.test.ts`) und vom Frontend nach Cut-Over schlicht ungenutzt. Cleanup in eigenem Folge-Plan, sobald sicher ist dass nichts mehr aufruft |
| `apps/backend/src/db/admin-repository.ts` | neue Methode `bulkUpdatePages(payload)` |
| `apps/backend/src/db/adapters/postgres.ts` | Implementation in einer `db.transaction(tx => …)`-Block; `ORDER BY` in `listContentPages` umgestellt auf `display_order ASC, created_at DESC` |
| `apps/backend/src/db/schemas/postgres.ts` | `displayOrder` field zu `contentPages` |

### DB-Migration

Neues Feld `display_order` in `content_pages`. Sortierung in der Sidebar wechselt von `created_at DESC` auf `display_order ASC, created_at DESC` (tiebreaker).

```sql
-- migrations/postgres/00XX_pages_display_order.sql
ALTER TABLE content_pages
  ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT slug, ROW_NUMBER() OVER (ORDER BY created_at DESC) - 1 AS new_order
  FROM content_pages
)
UPDATE content_pages
   SET display_order = ordered.new_order
  FROM ordered
 WHERE content_pages.slug = ordered.slug;
```

**Migration-Tracker (musiccloud-spezifisch):** Nach `npm run db:migrate` müssen sowohl `drizzle.__drizzle_migrations` als auch `public._migrations` synchron sein, sonst Backend-Restart-Crash (siehe Memory `project_dual_migration_trackers`).

### Shared

`packages/shared/src/types/...` (genaues File beim Plan-Schreiben grep-verifizieren) — neuer Type `PagesBulkUpdate` mit allen Resource-Slices als optional Sub-Payloads.

## Datenfluss

### 1. Initial Load

Beim Mount von `PagesEditorContext` werden die bestehenden Read-Hooks (`useContentPages`, `useAdminContentPage`, `listSegmentsForOwner`, …) genutzt. Jeder Slice wird mit `initial = current = serverData` hydriert. DirtyRegistry leer → PagesSaveBar hidden.

### 2. Edit-Beispiele

**Page-Content editiert:**
```
MarkdownEditor.onChange(newContent)
  → contentSlice.dispatch({ slug, content: newContent })
  → if current[slug].content != initial[slug].content: dirtyRegistry.add("content:" + slug)
  → if equal: dirtyRegistry.delete(...)
```

**Sidebar-DnD: Privacy von Help nach Information bei position 3:**
```
DndContext.onDragEnd({ active: "privacy", over: "info-drop-zone-3" })
  → segmentsSlice.dispatch({
      type: "move",
      target: "privacy",
      from: "help", to: "info", position: 3
    })
  → current.segmentsByOwner.help: privacy raus
  → current.segmentsByOwner.info: privacy bei pos 3 rein, Folge-Items shifted
  → dirtyRegistry.add("segments:help"), dirtyRegistry.add("segments:info")
```

**Top-Level-Reorder:**
```
DndContext.onDragEnd({ active: "help", over: "info-position" })
  → sidebarSlice.dispatch({ type: "reorder-top-level", from: 0, to: 1 })
  → dirtyRegistry.add("sidebar")
```

**Orphan-Promote (Orphan wird Segment):**
```
DndContext.onDragEnd({ active: "<orphan-slug>", over: "info-drop-zone-2" })
  → segmentsSlice.dispatch({ type: "add", owner: "info", target: "<orphan-slug>", position: 2 })
  → dirtyRegistry.add("segments:info")
```

**Segment-Demote (Sub-Page wird Orphan):**
```
DndContext.onDragEnd({ active: "privacy", over: "orphan-zone" })
  → segmentsSlice.dispatch({ type: "remove", owner: "info", target: "privacy" })
  → dirtyRegistry.add("segments:info")
```

### 3. Save (Click oder Cmd+S)

```
useGlobalPagesSave.save()
  → diff.ts: build PagesBulkRequest from dirty slices
  → PUT /admin/pages/bulk
  → Backend: BEGIN; updates; COMMIT (or ROLLBACK)
  → Response: full server snapshot
  → all slices: initial = current = response
  → dirtyRegistry.clear()
  → React-Query invalidate ["content-pages"]
```

### 4. Verwerfen

```
[Verwerfen] click → confirm-modal → all slices: current = initial → dirtyRegistry.clear()
```

### 5. Navigation-Leave-Guard

`useBlocker()` (React-Router v6.4+) — wenn `dirtyRegistry.size > 0`, modale Frage:
- [Abbrechen] = bleibt
- [Verwerfen] = reset + weiter
- [Speichern] = save + weiter (wartet auf 200, dann navigiert)

Plus `beforeunload`-Handler für Browser-Close (native prompt).

## Bulk-Endpoint Schema

`PUT /admin/pages/bulk`, JSON body:

```ts
type PagesBulkRequest = {
  pages?: Array<{
    slug: string;
    meta?: Partial<{
      title: string; slug: string; status: ContentStatus;
      displayMode: PageDisplayMode; overlayWidth: OverlayWidth;
      titleAlignment: PageTitleAlignment; contentCardStyle: ContentCardStyle;
      showTitle: boolean; pageType: PageType;
    }>;
    content?: string;
  }>;
  segments?: Array<{
    ownerSlug: string;
    segments: Array<{
      position: number;
      label: string;
      targetSlug: string;
      translations?: Record<Locale, string>;
    }>;
  }>;
  pageTranslations?: Array<{
    slug: string;
    locale: Locale;
    title?: string;
    content?: string;
    translationReady?: boolean;
  }>;
  topLevelOrder?: string[];
};
```

**Response:** `200` mit komplettem Server-Snapshot (für Slice-Reset) oder `400`/`500` mit strukturiertem Error.

### Validierung (vor BEGIN, fail-fast)

1. `pages.meta.slug` (wenn Slug-Rename) — Pattern + Uniqueness
2. `pages.meta.pageType` — segmented→default-Transition: orphan-Segments werden cleared (existing logic)
3. `segments[].targetSlug` — existiert + ist Default-Page + kein Self-Reference
4. `segments[].label` — non-empty
5. `topLevelOrder` — alle Slugs existieren als segmented-Parent
6. `pageTranslations.locale` — `isLocale()` valid

Bei Fehler:
```ts
{
  error: "INVALID_INPUT",
  details: Array<{
    section: "pages" | "segments" | "pageTranslations" | "topLevelOrder",
    index: number,
    message: string
  }>
}
```

### Transaktion

```ts
await db.transaction(async (tx) => {
  // 1) pages.meta + pages.content   (UPDATE content_pages)
  // 2) topLevelOrder                (UPDATE content_pages SET display_order)
  // 3) segments per owner           (DELETE then INSERT)
  // 4) pageTranslations             (INSERT…ON CONFLICT)
});
```

Reihenfolge: pages-Meta zuerst (Slug-Rename muss VOR segments laufen wegen FK).

### Frontend-Fehler-Handling

- `400`/`5xx`: Slices behalten ihren Draft, DirtyRegistry bleibt, PagesSaveBar zeigt Fehler.
- `400 + details[]`: pro betroffenem Slice/Item Inline-Marker (rote Border am Segment-Row, Tooltip mit message).
- Kein partial-Save — entweder alles oder nichts (TX-Rollback).

## UI-Details

### Sidebar-DnD

**Drop-Zones:**
- `drop-zone-top-level` (zwischen segmented Parent rows)
- `drop-zone-segment` (zwischen Sub-Pages innerhalb eines segmented Parents)
- `drop-zone-orphan` (zwischen Orphan Default-Pages)

**Drag-Verhalten:**
- **Top-Level Page** (segmented Parent) → nur in `drop-zone-top-level`
- **Segment-Sub-Page** → in `drop-zone-segment` (same/other owner) oder `drop-zone-orphan` (= Demote)
- **Orphan-Default-Page** → in `drop-zone-segment` (= Promote zu Segment) oder `drop-zone-orphan` (Reorder)

**Visuelles Feedback:**
- Drag: Original opacity-50, Drag-Preview folgt Cursor
- Hover über Drop-Zone: 2px-Linie in `var(--color-primary)`
- Cursor: `grab` / `grabbing`

### SegmentManager-DnD

- Move-Up/Down-Buttons entfernt
- Neues `DotsSixVerticalIcon` (Phosphor) als Drag-Handle ganz links in jeder Segment-Row, neben `NumberCircleIcon`
- Delete-Button bleibt

### Dirty-Indicators

- **PagesSaveBar:** `[Speichern (N)] [Verwerfen]` — N = Anzahl distinct Resource-Gruppen (`pages`, `segments`, `translations`, `sidebar`)
- **Sidebar:** Punkt (●) rechts neben Page-Title, wenn Page-Meta oder -Content dirty
- **PageEditor Locale-Tabs:** Punkt am Tab-Label, wenn Translation für die Locale dirty
- **PageEditor Header:** Save-Button entfernt

### Tastatur

- `Cmd+S` — globaler Save (nur aktiv im Pages-Bereich)
- DnD via Tastatur — `KeyboardSensor` von dnd-kit (Pattern wie in `NavManagerPage.tsx`)

## Tests

### Backend

`apps/backend/src/__tests__/admin-pages-bulk.test.ts`:

| Test | Setup | Erwartung |
|---|---|---|
| `bulk: pages-only meta update` | `pages: [{slug, meta: {title}}]` | Title persistiert, Segments unverändert |
| `bulk: cross-owner segment move` | `segments: [{owner:A, []}, {owner:B, [...privacy...]}]` | Privacy nur bei B, A leer |
| `bulk: top-level reorder` | `topLevelOrder: ['info','help']` | display_order aktualisiert |
| `bulk: full mixed payload` | alle Resources gleichzeitig | alles in einem Commit |
| `bulk: partial-fail rollback` | invalides 2. Segment-Set | TX rollback, DB unverändert |
| `bulk: validation 400 + details[]` | invalides Schema | strukturierter Error, kein DB-Zugriff |
| `bulk: empty payload → 200 noop` | `{}` | kein Fehler |

Bestehende `admin-segments.test.ts` bleibt — alte Route ist Backward-Compat.

### Frontend (Dashboard)

Vitest-Files unter `apps/dashboard/src/features/content/state/__tests__/`:

| Datei | Tests |
|---|---|
| `slices/segmentsSlice.test.ts` | reorder, cross-owner-move (beide Owner dirty), idempotenter Move (back to initial = clean) |
| `slices/sidebarSlice.test.ts` | top-level reorder, orphan-promote, segment-demote |
| `slices/contentSlice.test.ts` | edit + dirty, edit-back-to-initial = clean |
| `dirtyRegistry.test.ts` | add/delete/clear, subscribe |
| `useGlobalPagesSave.test.ts` | bulk-payload-build, success-reset, error-keep-state |
| `diff.test.ts` | edge cases: nur Meta, nur Content, multi-resource |

## Concurrency / Conflict-Resolution

Single-Admin-CMS — keine Lock-Strategy. Multi-Session-Race ist last-write-wins (existing behavior). Optional als Folge-Spec: `If-Unmodified-Since` mit `updated_at`-Check.

## Migrationsplan / Rollout

1. Migration ausspielen (lokal + prod), `display_order`-Backfill
2. Backend-Bulk-Endpoint deployen (alte Routes bleiben)
3. Frontend-State-Refactor + DnD + globaler Save deployen
4. Feature-Flag entfällt — Cut-over ist atomar (Frontend wechselt komplett zum Bulk-Save, alte Routes werden nicht mehr aufgerufen)

## Verifizierung beim Plan-Schreiben

Beim Schreiben des Implementation-Plans (writing-plans skill) müssen folgende Refs grep-verifiziert werden:

- `apps/backend/src/db/schemas/postgres.ts` — `contentPages`-Definition für `displayOrder`
- `apps/backend/src/db/adapters/postgres.ts` Z. 2551 (`ORDER BY content_pages.created_at DESC`)
- `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx` — dnd-kit Pattern als Referenz
- `apps/dashboard/src/features/content/pages/SegmentManager.tsx` Move-Up/Down-Buttons-Position
- `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` Z. 521 segmentSaveRef, Z. 611 handleSave
- `apps/dashboard/src/components/layout/Sidebar.tsx` Z. 188-200 segmentedParents-Render-Logic
- `apps/dashboard/src/components/layout/AdminLayout.tsx` — Topbar-Struktur
- `packages/shared/src/types/...` — wo `PageType`, `ContentPage`, `PageSegmentInput` etc. definiert sind
- `apps/backend/src/routes/admin-content.ts` — Route-Patterns / `ROUTE_TEMPLATES`
- existing migrations dir name pattern (`apps/backend/src/db/migrations/postgres/`)
- npm-Skript für DB-Migration in `package.json`

## Out of Scope

- Undo/Redo (eigene spätere Spec)
- Server-Audit-Trail / Page-History
- Multi-User-Locking
- Andere Admin-Bereiche (Nav, Email, Forms): bleiben mit lokalen Save-Buttons
