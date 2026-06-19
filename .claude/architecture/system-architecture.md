# musiccloud System Architecture

> Snapshot 2026-04-19 — after the page display modes + segmented pages feature landed.

## Content pages

A content page is an admin-managed markdown document reachable under `/:slug`. It can render in one of three ways, driven by the page row itself:

| Field | Values | Effect |
|-------|--------|--------|
| `pageType` | `default` · `segmented` | `segmented` pages host multiple default pages as tabs; the row's own markdown body is ignored. |
| `displayMode` | `fullscreen` · `embossed` · `translucent` | `fullscreen` is the classic `/:slug` article. The overlay modes render the landing backdrop + a floating card. |
| `overlayWidth` | `small` (420) · `regular` (560) · `big` (820) | Max-width applied when `displayMode !== "fullscreen"`. |
| `overlayHeight` | `small` (40vh) · `regular` (60vh) · `dynamic` (fit 85vh) · `expanded` (85vh) | Height behaviour when `displayMode !== "fullscreen"`. |

Defaults: `default / fullscreen / regular / regular`. Existing pages before migration `0013_page_display_modes.sql` keep working unchanged because the defaults are applied at migration time.

### Persistence

- `content_pages` gains four columns (all `text NOT NULL` with the defaults above).
- New `page_segments` table holds ordered `{ owner_slug, target_slug, position, label }` rows. Both FKs cascade on delete.
- Segments are managed atomically via `PUT /api/admin/pages/:slug/segments`. The backend enforces:
  - owner must be `pageType === "segmented"`,
  - every target must be `pageType === "default"` and must exist,
  - no self-reference,
  - positions are normalised to `0..N-1` on save,
  - labels are trimmed and must be non-empty,
  - `segmented -> default` transition deletes the owner's segments.

### Public API shape

`GET /api/v1/content/:slug` now returns `pageType`, `displayMode`, `overlayWidth`, `overlayHeight`, plus a `segments` array that is empty for default pages and populated for segmented pages (each entry carries the target's server-rendered HTML). Unpublished target pages are filtered out of the segments array. The OpenAPI schemas (`PublicContentPageSchema`, `PublicPageSegmentSchema`, `ContentPageSummarySchema`, `NavItemSchema`) declare every new field so Fastify's response validation does not strip them.

### Frontend rendering

`apps/frontend/src/pages/[shortId].astro` branches on `displayMode`:

1. `fullscreen` + `default` — classic `<article>` inside the main column.
2. `fullscreen` + `segmented` — `SegmentedPageFullscreen` island (EmbossedCard with `EmbossedCard.SegmentedControl`).
3. `embossed` / `translucent` — landing hero as backdrop, `PageOverlayIsland` mounted; the overlay opens itself on mount via `OverlayContext.open(initialPage)`.
4. Share URLs (non-content) keep rendering `ShareLayout` unchanged.

The three overlay renderers live in `PageOverlayContent.tsx` and share:

- `useSegmented(page)` — local state holding the active target slug,
- `MarkdownHtml` — single HTML-injection site; server-sanitised markdown only,
- `overlayClasses(mode, width, height)` from `PageOverlay.tsx` — the single source of truth for overlay sizing.

### Nav click flow

`NavItem` carries optional `pageType / pageDisplayMode / pageOverlayWidth / pageOverlayHeight` (nullable when the item points at an external URL). `PageHeader.handleNavClick`:

- only intercepts unmodified primary-button clicks,
- lets browser handle ctrl/cmd/shift/alt + middle-click + `target=_blank`,
- skips when `pageDisplayMode === "fullscreen"` or no `pageSlug`,
- skips when no `PageOverlayIsland` is mounted (`window.__mcOverlayActive` flag advertised by `OverlayProvider`),
- otherwise dispatches a `mc:overlay-open` CustomEvent. `OverlayProvider` listens, fetches `/api/v1/content/:slug` via the Astro proxy at `src/pages/api/v1/content/[slug].ts`, and calls `open(page)`.

Deep-link behaviour: `OverlayProvider.open` pushes `/${slug}` + swaps `document.title`; `close()` restores the previous URL + title. `popstate` closes the overlay, so back-navigation feels native.

### Dashboard UI

- `PagesListPage` create dialog carries a `Default / Segmented` radio pair; the table shows a type badge column.
- `ContentEditorPage` mounts `PageDisplaySettings` (displayMode + overlayWidth + overlayHeight pickers; width/height are hidden when mode is `fullscreen`).
- Segmented pages swap the markdown editor for `SegmentManager`: draft list with up/down, label input, target select (only default pages; current page filtered), remove, live preview, save-all.
- i18n keys (DE + EN) live in `apps/dashboard/src/i18n/messages.ts` under `content.pages.display` + `content.pages.segments`.

## Rest of the stack (unchanged)

- **Backend**: Fastify (TypeScript), Drizzle ORM, PostgreSQL on `localhost:5433`.
- **Frontend**: Astro SSR + React islands, Tailwind 4.
- **Dashboard**: React 18 + React Router 7 + TanStack Query + Biome.
- **Linter**: Biome 2.4.8.
- **Migrations**: Hand-authored SQL files in `apps/backend/src/db/migrations/postgres/` applied via `run-migrations.ts` on boot.

## Known gaps (2026-04-19)

- Landing route (`/`) does not mount an `OverlayProvider`, so clicking a header nav item that points at an overlay page from the landing performs a full navigation and lets the server render the overlay via `[shortId].astro`. Acceptable — the overlay backdrop is the landing hero either way.
- `Expanded` overlay height behaves as fixed `h[85vh]`; other heights use `max-h` so content shrinks to fit.
