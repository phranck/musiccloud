# EmbossedCard Compound Component + Genre Browse/Search Integration

Plan-Nr.: MC-001

**Date:** 2026-04-16
**Status:** Draft
**Author:** phranck (planning with Claude)

## Preface

The EmbossedCard is currently a simple wrapper div. It needs to become a compound component with Header, Body, Footer, and AddOn slots to support the genre-search and genre-browse UIs properly. The BackLink (back to search results) and footer actions ("Start a new search") need structured placement instead of ad-hoc positioning.

---

## Spec / Goal

### EmbossedCard Compound API

```tsx
<EmbossedCard className="rounded-2xl p-5">
  <EmbossedCard.AddOn align="leading">← Back to results</EmbossedCard.AddOn>
  <EmbossedCard.AddOn align="trailing"><SettingsIcon /></EmbossedCard.AddOn>
  <EmbossedCard.Header>
    <h2>Title</h2>
    <p>Subtitle</p>
  </EmbossedCard.Header>
  <EmbossedCard.Body className="flex-1 min-h-0">
    {/* scrollable content */}
  </EmbossedCard.Body>
  <EmbossedCard.Footer>
    <button>Start a new search</button>
  </EmbossedCard.Footer>
</EmbossedCard>
```

### Layout Rules

```
┌──────────────────────────────────────────────────┐
│ [AddOn leading]   HEADER (centered)   [AddOn trailing] │
│                                                          │
│ BODY (scrollable, flex-1)                                │
│                                                          │
│ FOOTER (centered)                                        │
└──────────────────────────────────────────────────┘
```

- **Header**: Always horizontally centered relative to the EmbossedCard, regardless of AddOns
- **AddOns**: Positioned left (`leading`) or right (`trailing`) of the Header, in the same row. Absolutely positioned so the Header centering is not affected by asymmetric AddOn widths.
- **Body**: The main content area. Takes remaining space (`flex-1 min-h-0`), scrollable.
- **Footer**: Below the Body. Centered. Flex-shrink-0.
- **Backward compatible**: When no sub-components are used, children render as-is (current behavior).

### Sub-component Detection

Use Symbol tags on component functions to identify which slot each child belongs to, rather than relying on `displayName` strings (which get stripped in production builds).

---

## Design

### Implementation Approach

The EmbossedCard partitions its children by checking for tagged sub-components:

1. `EmbossedCard.Header` -- tagged with `HEADER_TAG` symbol
2. `EmbossedCard.Body` -- tagged with `BODY_TAG` symbol
3. `EmbossedCard.Footer` -- tagged with `FOOTER_TAG` symbol
4. `EmbossedCard.AddOn` -- tagged with `ADDON_TAG` symbol, has `align: "leading" | "trailing"` prop

If any tagged sub-component is found, the card renders in "compound mode" with the structured layout. Otherwise it renders children as-is.

### Migration Plan

After the EmbossedCard is built, migrate these consumers:

1. **GenreSearchResults** -- Header (headline + subtitle), Body (3-column grid), Footer (warnings + "cancel" button)
2. **GenreBrowseGrid** -- Header (title + subtitle), Body (genre grid)
3. **DisambiguationPanel** -- Header (title), Body (candidate list)
4. **ArtistInfoCard** -- Body only (collapsible sections)
5. **MediaCard** -- Body only (keep as-is, complex layout)
6. **EmbedModal** -- Body only (keep as-is)

Only GenreSearchResults and GenreBrowseGrid get AddOns initially (BackLink for genre-search → result → back navigation).

### BackLink Integration

When the user reaches a genre-search result from the browse grid (`genre:?` → click genre → see results → click track → share page), the EmbossedCard in GenreSearchResults should show a `leading` AddOn with the BackLink.

When the user is on the share page after clicking a genre-search result, the existing BackLink in ShareLayout stays as-is (it's outside any EmbossedCard).

---

## Implementation

### Files to Change

| File | Change |
|------|--------|
| `cards/EmbossedCard.tsx` | Rewrite as compound component with Header/Body/Footer/AddOn |
| `panels/GenreSearchResults.tsx` | Migrate to compound API: Header, Body, Footer |
| `panels/GenreBrowseGrid.tsx` | Migrate to compound API: Header, Body |
| `panels/DisambiguationPanel.tsx` | Migrate to compound API: Header, Body |
| `share/ArtistInfoCard.tsx` | No change needed (uses EmbossedCard as simple wrapper) |
| `cards/MediaCard.tsx` | No change needed (uses EmbossedCard as simple wrapper) |

### What We Do NOT Change

- EmbossedButton (separate component, not related)
- MediaCard inner layout (complex, no Header/Footer needed)
- ArtistInfoCard (uses EmbossedCard as outer shell, inner layout is CollapsibleSections)
- EmbedModal (dialog content, no structured header/footer)

---

## Current State (2026-04-16)

The EmbossedCard compound component rewrite was **started but not committed**. The file `cards/EmbossedCard.tsx` has been modified with the new implementation but:

1. The compound component code is written but **not yet type-checked against all consumers**
2. No consumer has been migrated yet
3. The existing `children`-only usage must continue to work (backward compat)

### Uncommitted Changes Summary

These files have uncommitted changes from this session that should be committed together:

**Backend (genre-search Last.fm migration):**
- `db/schemas/postgres.ts` -- track_images + album_images tables
- `db/migrations/postgres/0009_*` -- Drizzle migration
- `services/image-cache.ts` -- consolidated image cache (artist/track/album)
- `services/artist-images.ts` -- re-export from image-cache
- `services/genre-search/lastfm.ts` -- Last.fm genre-search adapter
- `services/genre-search/index.ts` -- orchestrator switched to Last.fm
- `services/types.ts` -- GenreBrowseResponse type
- `services/resolver.ts` -- Last.fm URL parsing (extract artist+title → text search)
- `routes/resolve.ts` -- genre:? browse dispatch

**Frontend (genre-browse + controlled HeroInput):**
- `components/input/HeroInput.tsx` -- controlled component (value+onChange props)
- `components/LandingPage.tsx` -- inputValue state lifted up, genre-browse wiring
- `components/panels/GenreBrowseGrid.tsx` -- new genre browse grid component
- `components/cards/EmbossedCard.tsx` -- compound component (IN PROGRESS)
- `hooks/useAppState.ts` -- genre-browse state + exports
- `lib/types/app.ts` -- genre-browse AppState variant
- `lib/resolve/parsers.ts` -- GENRE_BROWSE reducer case
- `i18n/translations/{de,en}.json` -- genreBrowse.title/subtitle keys
- `packages/shared/src/api.ts` -- ApiGenreTile, ResolveGenreBrowseResponse types

---

## Checklist

### EmbossedCard Compound Component
- [x] EmbossedCard with Header, Body, Footer, AddOn sub-components
- [x] Symbol-based child detection (no displayName dependency)
- [x] Backward compatible (plain children still work)
- [x] Header always centered, AddOns absolute left/right
- [x] TypeScript: proper typing for all sub-components

### Consumer Migration
- [x] GenreSearchResults: Header + Body + Footer
- [x] GenreBrowseGrid: Header + Body
- [x] DisambiguationPanel: Header + Body
- [x] Verify ArtistInfoCard, MediaCard, EmbedModal still work unchanged

### Genre Browse Feature (already implemented, needs commit)
- [x] Backend: genre:? detection in orchestrator
- [x] Backend: Last.fm chart.getTopTags with album-cover thumbnails
- [x] Backend: tag blocklist (non-genre tags filtered)
- [x] Backend: alphabetical sorting, 120 genres, images-only filter
- [x] Frontend: GenreBrowseGrid component
- [x] Frontend: genre-browse AppState variant
- [x] Frontend: click tile → triggers genre:<name> search
- [x] Frontend: controlled HeroInput (value synced on genre select)

### BackLink in Genre Search Results
- [x] AddOn leading with BackLink when navigating back from share page
- [x] Footer with "Start a new search" cancel action

## Completed

- **Date:** 2026-04-28 (retroactive — plan was already executed, archived during housekeeping)
- **Original commit:** `8cbdef45` Feat: EmbossedCard compound component with Header/Body/Footer/AddOn
- **Follow-up commits extending the slot system:**
  - `90cbcde7` NavigationBackButton with centered AddOn
  - `b5a6c64e` Genre browse/search UX polish + artwork tweaks
  - `b3f06bfb` Auto-cascade padding + corner radii across EmbossedCard/RecessedCard
  - `882a8165` EmbossedCard.SegmentedControl slot for segmented content pages
  - `839cc918` Rename SegmentedControl → EmbossedSegmentedControl; dashboard port
  - `758db769` Overlay UX pass — animated height, segmented content switch, new close button
  - `7e87edc8` Title alignment, slug cascade, segmented-page editor polish
  - `3173ab6d` Refactor: Unify overlay surfaces and animations
- **Delivered:** EmbossedCard compound (`cards/EmbossedCard.tsx`) with `Header`, `Body`, `Footer`, `AddOn` slots, plus extras (`Header.Title`, `Header.AddOn`, `SegmentedControl`). Symbol-tag based child detection, backward-compatible plain-children mode.
- **Consumers migrated:** `GenreSearchResults`, `GenreBrowseGrid`, `DisambiguationPanel`. ArtistInfoCard / MediaCard / EmbedModal kept on simple-wrapper usage as planned.
