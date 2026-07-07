# ContentLoadingView Rollout an die List-Seiten

Plan-Nr.: MC-095

## Preface / Kontext

Folgeplan zu [MC-094](2026-07-05-content-loading-view-tier-rebuild.md): Nachdem `ContentLoadingView` existiert und im Tier-Editor läuft, wird derselbe neutrale Loader an allen übrigen List-Seiten eingesetzt, die beim Initial-Load aktuell ein Tabellen- bzw. Card-Skeleton (`animate-pulse`) zeigen. Ziel: einheitlicher Lade-Zustand im ganzen Dashboard, kein Fake-Skeleton→Empty-Flicker mehr.

**Prerequisite:** MC-094 fertig (ContentLoadingView unter `components/ui/ContentLoadingView.tsx` vorhanden).

## Ziel / Scope

Den Initial-Load-Skeleton-Block durch `<ContentLoadingView />` ersetzen in:

- `features/developer/DeveloperAccountsPage.tsx`
- `features/developer/ApiClientsPage.tsx`
- `features/developer/ApiAccessRequestsPage.tsx`
- `features/music/TracksPage.tsx` — **nur** das Initial-Skeleton; der `isLoadingMore`-Pagination-Spinner bleibt
- `features/music/AlbumsPage.tsx` — dito
- `features/music/ArtistsPage.tsx` — dito
- `features/system/UsersPage.tsx` — Card-Skeleton (`ItemCard animate-pulse`)

**Ausgeschlossen:** `DashboardPage` (Übersicht, Statistik-Karten — kein List-Load; ein zentrierter Spinner wäre dort ein anderes UX), sowie alle Editor-/Bild-/Config-Platzhalter (AnalyticsSection, MarkdownEditor, BlockEditor, AssetPicker, TemplateBrandingSection, Field/SubmissionConfigPanel, EmailBrandingPage, ContentEditorPage) — das sind keine Page-Load-Skeletons.

## Design

Pro Seite: den `{isLoading && (<DashboardSection>…animate-pulse-Zeilen…</DashboardSection>)}`-Block (bei UsersPage den `ItemCard animate-pulse`-Block) durch `{isLoading && <ContentLoadingView />}` ersetzen. Empty- und Table-Zweige bleiben unverändert. Ungenutzt gewordene Skeleton-Imports/Konstanten entfernen (sonst Doctor unused-import/export im Full-Scan). Bei Tracks/Albums/Artists den `isLoadingMore`-Spinner nicht anfassen.

## Verified facts (Plan-write-time, 2026-07-05)

- Initial-Load-Skeleton-Blöcke (grep, `animate-pulse` + isLoading-Triade; exakte Zeilenbereiche vor jedem Edit re-verifizieren):
  - DeveloperAccountsPage.tsx: ~118-134
  - ApiClientsPage.tsx: ~174-187
  - ApiAccessRequestsPage.tsx: ~123-139
  - TracksPage.tsx: Initial-Skeleton ~285-296, Pagination-Spinner `isLoadingMore` 330-332 (bleibt)
  - AlbumsPage.tsx: Initial-Skeleton ~286-296, `isLoadingMore` 326-328 (bleibt)
  - ArtistsPage.tsx: Initial-Skeleton ~283-293, `isLoadingMore` 323-325 (bleibt)
  - UsersPage.tsx: 51-54 (`ItemCard className="h-16 animate-pulse"`)
- Die ausgeschlossenen `animate-pulse`-Files sind Editor-/Bild-/Config-Platzhalter, keine List-Load-Skeletons. (grep)
- `ContentLoadingView` stammt aus MC-094 (`apps/dashboard/src/components/ui/ContentLoadingView.tsx`).

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (Pfade, Zeilenbereiche, Import-Namen)
- [x] DeveloperAccountsPage: Skeleton → ContentLoadingView
- [x] ApiClientsPage: Skeleton → ContentLoadingView
- [x] ApiAccessRequestsPage: Skeleton → ContentLoadingView
- [x] TracksPage: Initial-Skeleton → ContentLoadingView (Pagination-Spinner bleibt)
- [x] AlbumsPage: Initial-Skeleton → ContentLoadingView (Pagination-Spinner bleibt)
- [x] ArtistsPage: Initial-Skeleton → ContentLoadingView (Pagination-Spinner bleibt)
- [x] UsersPage: Card-Skeleton → ContentLoadingView
- [x] Ungenutzte Skeleton-Imports/Konstanten entfernt (Typecheck bestätigt keine verwaisten Imports)
- [x] Gates grün: `typecheck`, `pnpm lint` (976 Files), `pnpm run doctor:diff` (8 Files, 0 Issues), `test:run` (61/61)
- [x] Kleine logische Commits (auf User-Freigabe)
