# ContentLoadingView + Tier-Editor Neuaufbau

Plan-Nr.: MC-094

## Preface / Kontext

Beim Öffnen von Dashboard → Developer → Tiers blitzte kurz ein Tabellen-Skeleton auf, bevor die `ContentUnavailableView` (leerer Zustand) erschien. Ein WIP-Fix (`useDelayedFlag`) hat das nur teilweise entschärft. User-Entscheidung: den Tier-Editor sauber neu bauen und dabei den Lade-Zustand vereinheitlichen — eine neue, wiederverwendbare `ContentLoadingView` (konform zur `ContentUnavailableView`) ersetzt das Fake-Tabellen-Skeleton durch einen neutralen Loader.

Dieser Plan (MC-094) liefert die neue Komponente + den neu gebauten Tier-Editor. Der Rollout an die übrigen List-Seiten liegt in [MC-095](2026-07-05-content-loading-view-rollout.md).

## Ziel

1. Neue `apps/dashboard/src/components/ui/ContentLoadingView.tsx` — zentrierter Spinner + Label, gleiches Layout/Container wie `ContentUnavailableView`.
2. `apps/dashboard/src/features/developer/TierEditorPage.tsx` von Grund auf neu (funktional identisch), Lade-Zustand über `ContentLoadingView` statt Skeleton.
3. `apps/dashboard/src/lib/hooks/useDelayedFlag.ts` löschen (WIP-Artefakt, nicht mehr gebraucht).

**Bleibt unverändert** (der identische Neuaufbau konsumiert es): Datenschicht (`api.ts`-Tier-Funktionen + Query-Hooks in `useDeveloperData.ts`), Route (`routeComponents.tsx`, `routes.tsx`), Nav (`Sidebar.tsx`), alle Tier-i18n-Keys. Entfernen + identisch neu anlegen wäre reine Churn (KISS).

**Bleibt unangetastet:** Backend-Tiers-API (admin CRUD + public `/api/v1/tiers`).

## Design

### ContentLoadingView

Props: `{ title?: string; subtitle?: string; className?: string }`. Kein Pflicht-`icon` — der Spinner IST der Loader.

- Container identisch zu `ContentUnavailableView`: `grid w-full h-full min-h-80 place-items-center self-stretch p-6 text-center` + `className`-Passthrough.
- Icon-Slot: `SpinnerGapIcon` (`@phosphor-icons/react`) mit `animate-spin`, muted (`text-[var(--ds-text-muted)]`), gleiche 48px-Größe wie das Empty-Icon (`[&_svg]:w-12 [&_svg]:h-12`) → Loader und Empty belegen denselben Platz, ruhiger Übergang.
- Label darunter, gleiche Typo wie der `ContentUnavailableView`-Titel. Default = `messages.common.loading` ("Wird geladen…"), intern via `useI18n()` (`@/context/I18nContext`). `title`/`subtitle` überschreibbar.
- Volle TSDoc.

### TierEditorPage (Neuaufbau)

Struktur wie die Geschwister-Seiten (`ApiClientsPage`/`DeveloperAccountsPage`) und gate-konform wie der zuletzt committete Stand (Page + interne Dialoge in einer Datei):

- `PageLayout` › `PageHeader` (Titel `dm.tiersTitle`, Create-Button).
- Body-Triade, **kein Skeleton**:
  - `isLoading` → `<ContentLoadingView />`
  - `!isLoading && tiers.length === 0` → `ContentUnavailableView` (`dm.noTiers` / `dm.noTiersHint`)
  - `!isLoading && tiers.length > 0` → `DashboardSection` + `DataTable`
- Spalten in einen `useTierColumns`-Hook (im selben File, analog `useClientColumns`).
- `TierFormDialog` (Create/Edit) + `TierDeleteConfirmDialog` intern (nicht exportiert), inhaltlich wie bisher.
- `useReducer` (Reducer inhaltlich wie bisher).
- Datenzugriff über die bestehenden Hooks `useTiers/useCreateTier/useUpdateTier/useDeleteTier`.

Damit ist der Skeleton→Empty-Flicker strukturell weg (kein Skeleton mehr); der Lade-Zustand ist der neutrale `ContentLoadingView`.

## Verified facts (Plan-write-time, 2026-07-05)

- `ContentUnavailableView`: `apps/dashboard/src/components/ui/ContentUnavailableView.tsx`, Props `{icon, title, subtitle?, className?}`, Container `grid w-full h-full min-h-80 place-items-center self-stretch p-6 text-center`, Icon-Slot `[&_svg]:w-12 [&_svg]:h-12` muted, Titel `text-lg font-bold font-heading`. (Read)
- `common.loading` liegt unter `messages.common.loading` (messages.ts:17; DE:730 "Wird geladen…", EN:1445 "Loading…"). (Read/grep)
- Spinner-Konvention: `SpinnerGap as SpinnerGapIcon` aus `@phosphor-icons/react`, `animate-spin text-[var(--ds-text-muted)]` (u.a. TracksPage.tsx:15/332, DeveloperDetailPage.tsx:2/105). (grep)
- `useI18n` aus `@/context/I18nContext` (TierEditorPage.tsx:18).
- Zu löschen: `apps/dashboard/src/lib/hooks/useDelayedFlag.ts` (nur von TierEditorPage importiert). (grep)
- Datenschicht Tier bleibt: `api.ts` `TierResponse`/`fetchTiers`/`createTier`/`updateTier`/`deleteTier` (123-156); Hooks `useTiers/useCreateTier/useUpdateTier/useDeleteTier` (useDeveloperData.ts:136-182). (Read)
- Route/Nav bleiben: routeComponents.tsx:177-181, routes.tsx:38+88, Sidebar.tsx:646-650. (Read/grep)
- Tier-only-i18n-Keys (bleiben, vom Neuaufbau genutzt): `tiersTitle/tierCreate/tierEdit/tierDeleteTitle/tierDeleteConfirm/colName/colPrice/colAttribution/colSortOrder/noTiers/noTiersHint` (developer-Namespace) + `tiers` (Sidebar-Namespace). Geteilt (nicht Tier-only): `colTraffic/detailRateLimitMinute/detailRateLimitDay`. (grep)
- `no-multi-comp`: der zuletzt committete `TierEditorPage.tsx` (3 Komponenten, Dialoge nicht exportiert) hat den Pre-Commit-Doctor-Full-Scan bestanden (commit 87dd9601) → gleiche Struktur ist gate-konform. (git log)
- Kein Frontend-Test referenziert Tiers. (grep)

## Checklist

- [x] Alle Code-Referenzen vor Execute re-verifiziert (Funktionen, Pfade, i18n-Keys)
- [x] `ContentLoadingView.tsx` erstellt (Spinner + Label, konform zu ContentUnavailableView, volle TSDoc)
- [x] `useDelayedFlag.ts` gelöscht
- [x] `TierEditorPage.tsx` neu gebaut (ContentLoadingView statt Skeleton, `useTierColumns`, Dialoge + Reducer)
- [x] Datenschicht/Route/Nav/i18n unverändert und vom Neuaufbau korrekt konsumiert (Typecheck grün)
- [x] Gates grün: `typecheck` (Dashboard + Backend), `pnpm lint` (976 Files clean), `pnpm run doctor:diff` (0 Issues), `test:run` (Dashboard 61/61, Tier-Route 6/6). Nebenbefund: 3 pre-existing Lint-Fehler in `admin-tiers.test.ts` (unused Import + 2× `any`) mitgefixt.
- [ ] Kleine logische Commits (auf User-Freigabe)
