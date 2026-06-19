# Page Display Modes and Segmented Pages Implementation Plan

Plan-Nr.: MC-003

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. **Mandatory:** after every commit, check off the corresponding `- [x]` boxes in this file in the same commit.

**Goal:** Extend the content-pages system so each page can render as fullscreen, as an `EmbossedCard` overlay, or as a new `TranslucentCard` overlay with configurable width/height. Introduce a second page type — *Segmented* — that hosts a set of sub-pages (Default pages) accessible through a segmented control inside the overlay/fullscreen shell.

**Architecture:**
- Backend: extend `content_pages` with display/sizing metadata and add a `page_segments` table (ordered, FK to `content_pages.slug` for both owner and target).
- Shared types: extend `ContentPage` / `PublicContentPage` with `pageType`, `displayMode`, `overlayWidth`, `overlayHeight`, `segments`.
- Frontend components: extract the glass-look of `InfoPanel` into a reusable `TranslucentCard` compound (Header / SegmentedControl / Body / Footer). Add `EmbossedCard.SegmentedControl` that wraps the existing `SegmentedControl` for the embed-overlay look. Introduce a `PageOverlay` primitive that maps size tokens to CSS.
- Frontend rendering: `[shortId].astro` branches on `displayMode`. Overlay modes render the `LandingPage` as backdrop and mount a client island that opens the overlay. Nav clicks to overlay-mode pages are intercepted client-side via a shared `OverlayContext` to avoid full-page reloads.
- Dashboard: create-dialog picks `pageType`. Editor exposes `displayMode`, `overlayWidth`, `overlayHeight` selectors (conditional). Segmented pages gain a segment manager that live-previews the segmented layout.

**Tech Stack:** Astro 5 SSR + React islands, Tailwind 4, Drizzle ORM on PostgreSQL, Fastify, TanStack Query, Biome.

**No-regression enforcement (non-negotiable):** Existing functionality MUST keep working identically at every commit. Every commit leaves the app green on lint + typecheck + tests + build. If a change requires a two-step migration, include the compat shim in the same commit that introduces the breaking signature.

Existing behaviour that must not change (spot-checked after every task):

- **`/imprint`, `/privacy`, `/about`, and every current published page** still render as fullscreen article on `/:slug` with the same visible output. DB defaults (`page_type='default'`, `display_mode='fullscreen'`) make this the zero-work case. Verify after Task 1, Task 6, Task 17.
- **Landing page `/`** — unchanged. The overlay mount in Task 17 is conditional on `contentPage && displayMode !== 'fullscreen'`; the landing route itself is not touched.
- **Info button on landing page** — opens `InfoPanel` with identical visual result. The Task 12 refactor is a markup swap only: tabs, transitions, content load, scroll container, close-on-escape all preserved. Run `/ui-test` info-panel plan after Task 12 AND after Task 14 to confirm pixel-level parity.
- **Embed modal (`EmbedModal.tsx`)** — unchanged. Task 13 attaches `EmbossedCard.SegmentedControl` as an optional sub-component; it does not touch the existing `<SegmentedControl>` usage inside `EmbedModal`. Verify by clicking the embed CTA on a share page after Task 13.
- **Share pages (`/:shortId` for track/album/artist)** — unchanged. The `[shortId].astro` branch in Task 17 keeps the existing `{!contentPage}` arm verbatim; do NOT refactor the share rendering in the same PR.
- **Admin create/edit/delete for existing Default pages** — unchanged flow. Task 8's create dialog defaults `pageType="default"` so the previous single-step create still works without the user ever touching the new radio. Task 9's display pickers are additive: leaving `displayMode="fullscreen"` yields today's behaviour.
- **Nav loader + header nav rendering** — unchanged for nav items that point to fullscreen pages. Task 18's click handler early-returns when `pageDisplayMode === "fullscreen"` or when the item is an external URL (`pageSlug === null`). Anchor href remains `/${slug}`, so middle-click, ctrl-click, copy-link, prefetch, keyboard activation all behave as today.
- **Public API contracts** — `/api/v1/content/:slug` still returns 404 for unknown/unpublished slugs. `/api/v1/nav/:navId` still returns the same items; new `pageType` / `pageDisplayMode` / `pageOverlayWidth` / `pageOverlayHeight` fields are additive + nullable, never required.
- **OpenAPI spec** — after Task 6.2 and Task 18.2, regenerate Swagger and confirm no existing schema reference broke. `ContentPageSummary` / `PublicContentPage` / `NavItem` gain fields; no field is renamed or removed.
- **Existing tests** — must all still pass with the new columns. If a test fixture builds a `ContentPage` literal, update the fixture to include the four new defaults rather than loosening the test.
- **Backend boot** — no new required env vars introduced. The migration is backward-compatible (all new columns have `DEFAULT` values + `NOT NULL`, so old rows populate instantly; new `page_segments` table is empty and unreferenced until a page is promoted to `segmented`).
- **Zerops deploy** — nothing in `zerops.yml` changes. Backend bundle (`apps/backend/dist`) still contains everything needed; new migration file lives under `apps/backend/src/db/migrations/postgres/` which is already in the deploy set (verify with `grep -n migrations apps/backend/zerops.yml` or the repo's top-level `zerops.yml` per the "check deploy pipeline" memory).
- **Drizzle schema definition file** is extended, never truncated. `content_pages` keeps every existing column; `nav_items` keeps every existing column; new `page_segments` is additive.
- **Dashboard routing** — `/pages`, `/pages/:slug` still work. Task 9's conditional hides the markdown editor ONLY when `page.pageType === "segmented"`; default pages keep the editor unchanged.

Rollback plan: every task is its own commit. Reverting any single task reverts only that task's surface. The migration is forward-only (adds columns + one table); a rollback step would use an inverse migration file — not part of this plan, but the migration is intentionally column-additive so `DROP COLUMN` + `DROP TABLE` is safe if needed.

**DRY enforcement (non-negotiable):** Duplication in this change is forbidden. Before writing code, look for an existing helper and reuse it; if two call-sites would repeat the same logic, extract it before the second one lands. Specifically:

- **Shared literal unions + arrays** (`PAGE_TYPES`, `PAGE_DISPLAY_MODES`, `OVERLAY_WIDTHS`, `OVERLAY_HEIGHTS`) are defined ONCE in `packages/shared/src/content.ts` (Task 2). Backend validation (`isOneOf`), frontend selectors, dashboard pickers, overlay class map — all derive from those arrays. Never hand-roll a parallel list in another file. If a consumer needs display-label text, it maps OVER the shared array to its i18n keys; it does NOT redeclare the values.
- **SQL column lists**: Task 3.1b introduces `CONTENT_COLUMNS` + `CONTENT_SUMMARY_COLUMNS` constants in `adapters/postgres.ts`. Every `SELECT` / `RETURNING` reuses those. No hand-typed column lists duplicated across five queries.
- **Row mappers**: `rowToContentPage` delegates to `rowToContentPageSummary` via spread — keep it that way when adding new columns. Same rule for `rowToSummary` → `rowToPage` in `admin-content.ts`.
- **Markdown rendering**: exactly one call site per file — `marked.parse(content, { async: false })`. If it appears twice in `getPublicContentPage`, extract a local `renderBody(content: string)` helper in the same step. Do not let the segmented branch grow a second copy.
- **Overlay size tokens → classes**: mapped in ONE file, `apps/frontend/src/components/layout/PageOverlay.tsx` (Task 15). Embossed + translucent renderers both consume `overlayClasses(...)`. No inline width/height switch statements elsewhere.
- **Markdown HTML injection wrapper**: Task 19 defines `MarkdownHtml` once. `InfoPanel`, segmented overlay, embossed overlay, fullscreen segmented island — all render body HTML via that one component. Any `dangerouslySetInnerHTML` usage outside `MarkdownHtml` is a plan violation.
- **TranslucentCard glass styles**: when Task 12 refactors `InfoPanel`, the old bespoke markup (lines 51-69 of the current file) must be DELETED — not left behind alongside the new compound. The card's look lives in `TranslucentCard.tsx` only.
- **`SegmentedControl`**: the existing `apps/frontend/src/components/ui/SegmentedControl.tsx` is reused by `EmbossedCard.SegmentedControl` (Task 13). Do not write a second track/indicator implementation for embossed use.
- **Segment-body renderer**: `SegmentedBody` (Task 19.1) is shared between `TranslucentOverlayContent`, `EmbossedOverlayContent`, and `SegmentedPageFullscreenIsland`. None of those three may copy the select-active-segment logic.
- **Admin meta-update validation**: the `isOneOf(list, v)` helper introduced in Task 5.1 is reused by Task 3's create + meta-update validations. Do not reimplement.
- **Dashboard `api` client**: every new hook in Task 7 goes through `@/lib/api`. No inline `fetch()` calls. If `api.put` is missing, add it once and reuse.
- **i18n keys**: display mode / overlay width / overlay height labels live in ONE block in `apps/dashboard/src/i18n/messages.ts`; the dashboard `PageDisplaySettings` maps the shared arrays to those keys via a single lookup.

Rule of thumb: any second occurrence of the same logic, string literal, or CSS-token→class mapping is wrong until it becomes a reference to the first occurrence.

**HTML sanitisation note:** Content pages render markdown-derived HTML via Astro `set:html` and (for client islands) the existing helper pattern already used by `InfoPanel.tsx` (dangerouslySetInnerHTML with `__html`). The plan reuses that exact pattern verbatim — it is safe here because the backend renders markdown through its sanitising renderer before the value ever leaves `PublicContentPage.contentHtml`. Do NOT introduce a separate sanitiser on the client side; that duplicates work and masks gaps in the backend renderer.

**Markdown renderer note:** The backend uses `marked.parse(row.content, { async: false })` (see `apps/backend/src/services/admin-content.ts:142`). Wherever this plan says `renderMarkdown(...)` as pseudocode, use that exact `marked.parse(...)` call in real code. Do not introduce a new helper.

**Response-validation trap:** Every public-content route serialises through a Fastify JSON schema registered in `apps/backend/src/schemas/openapi-schemas.ts` with `additionalProperties: false`. Adding new fields on `PublicContentPage` WITHOUT updating `PublicContentPageSchema` causes Fastify to silently strip them at send-time and the frontend will see `undefined` for every new field. Task 6 now explicitly covers these schema updates — do not skip.

**Raw SQL location:** Content-page persistence lives in two files, not one:
- `apps/backend/src/db/admin-repository.ts` — interfaces (`ContentPageRow`, `ContentPageSummaryRow`, `ContentPageCreateData`, `ContentPageMetaUpdate`, `AdminRepository` method contracts).
- `apps/backend/src/db/adapters/postgres.ts` — actual `pool.query(...)` calls, `rowToContentPage` / `rowToContentPageSummary` mappers, and local `ContentPageSqlRow` / `ContentPageSummarySqlRow` types.

Every change to the column set touches BOTH files. The repo does not use drizzle-kit generate — `apps/backend/src/db/run-migrations.ts` invokes `migrate()` from `drizzle-orm/node-postgres/migrator` directly against the SQL files in `migrations/postgres/`. Hand-authored SQL files are the norm here (despite the general "Drizzle only, NEVER manual SQL" rule, the in-repo migrations are raw SQL because `drizzle-kit generate` is not wired up). Add a plain SQL file; the `meta/_journal.json` format is what Drizzle-kit usually maintains — mirror the existing latest entry's shape or leave `_journal.json` untouched if migrations run without it in this repo (verify locally).

---

## Top-Level Checklist

- [x] Task 1: Drizzle schema + migration for display/sizing columns and `page_segments` table
- [x] Task 2: Shared type extensions (`ContentPage`, `PublicContentPage`, `PageSegment`, literal unions)
- [x] Task 3: Admin repository/service updates for new page columns
- [x] Task 4: Admin segments repository + service (list / replace / validate)
- [x] Task 5: Admin API: extend `PATCH /admin/pages/:slug`; add `PUT /admin/pages/:slug/segments`
- [x] Task 6: Public content API: include display metadata + segments (rendered HTML per segment)
- [x] Task 7: Dashboard hooks for new fields + segments (TanStack Query)
- [x] Task 8: Dashboard PagesListPage: page-type selector in create dialog + type badge in list
- [x] Task 9: Dashboard ContentEditorPage: `displayMode` + width/height pickers (default pages)
- [x] Task 10: Dashboard Segmented-Page editor: segment manager UI
- [x] Task 11: Frontend `TranslucentCard` compound component (extracted from InfoPanel)
- [x] Task 12: Refactor InfoPanel to use `TranslucentCard`
- [x] Task 13: Frontend `EmbossedCard.SegmentedControl` sub-component
- [x] Task 14: Frontend `TranslucentCard.SegmentedControl` sub-component (tabs look)
- [x] Task 15: Frontend `PageOverlay` primitive (size tokens → CSS)
- [x] Task 16: Frontend `PageOverlayIsland` + `OverlayContext` (open/close, deep-link, escape, backdrop)
- [x] Task 17: Frontend `[shortId].astro` render branches (fullscreen vs overlay-on-landing)
- [x] Task 18: Frontend `PageHeader` nav click interception for overlay-mode pages
- [x] Task 19: Frontend segmented-page rendering (segments → content swap inside overlay/fullscreen)
- [x] Task 20: E2E smoke pass + architecture doc update

---

## File Structure

**New files:**
- `apps/backend/src/db/migrations/postgres/0013_page_display_modes.sql`
- `apps/backend/src/services/admin-segments.ts`
- `apps/frontend/src/components/cards/TranslucentCard.tsx`
- `apps/frontend/src/components/layout/PageOverlay.tsx`
- `apps/frontend/src/components/layout/PageOverlayIsland.tsx`
- `apps/frontend/src/context/OverlayContext.tsx`
- `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx`
- `apps/dashboard/src/features/content/pages/SegmentManager.tsx`

**Modified files:**
- `apps/backend/src/db/schemas/postgres.ts`
- `packages/shared/src/content.ts`
- `apps/backend/src/db/admin-repository.ts` *(row interfaces + `AdminRepository` method contracts)*
- `apps/backend/src/db/adapters/postgres.ts` *(raw SQL + `rowToContentPage` / `rowToContentPageSummary` / `rowToNavItem` + new segment methods)*
- `apps/backend/src/services/admin-content.ts` *(`rowToSummary` / `rowToPage` mappers + public-page builder)*
- `apps/backend/src/services/admin-nav.ts` *(if `NavItem` gains display fields — see Task 18 recommendation)*
- `apps/backend/src/routes/admin-content.ts`
- `apps/backend/src/routes/public-content-nav.ts`
- `apps/backend/src/schemas/openapi-schemas.ts` *(extend `PublicContentPageSchema` + `ContentPageSummarySchema`; add `PublicPageSegmentSchema`; optionally extend `NavItemSchema`)*
- `apps/dashboard/src/features/content/hooks/useAdminContent.ts` *(replace the local `ContentPage` interface with the shared one)*
- `apps/dashboard/src/features/content/pages/PagesListPage.tsx`
- `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`
- `apps/frontend/src/components/ui/SegmentedControl.tsx` *(augment with compound exports if required)*
- `apps/frontend/src/components/cards/EmbossedCard.tsx` *(attach `SegmentedControl` sub-component)*
- `apps/frontend/src/components/panels/InfoPanel.tsx` *(refactor to `TranslucentCard`)*
- `apps/frontend/src/components/layout/PageHeader.tsx`
- `apps/frontend/src/pages/[shortId].astro`
- `.claude/architecture/system-architecture.md`

---

## Terminology

| Token | Meaning |
|-------|---------|
| `pageType` | `"default"` or `"segmented"` |
| `displayMode` | `"fullscreen"` (current behaviour) · `"embossed"` (EmbossedCard overlay) · `"translucent"` (TranslucentCard overlay) |
| `overlayWidth` | `"small"` (`420px`) · `"regular"` (`560px`) · `"big"` (`820px`) — max-width. Ignored when `displayMode="fullscreen"`. |
| `overlayHeight` | `"small"` (`40vh`) · `"regular"` (`60vh`) · `"dynamic"` (fit-content up to `85vh`) · `"expanded"` (`85vh`). Ignored when `displayMode="fullscreen"`. |

These values are the single source of truth — every renderer derives its CSS from them.

---

## Task 1: Drizzle schema + migration

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts`
- Create: `apps/backend/src/db/migrations/postgres/0013_page_display_modes.sql`
- Create: `apps/backend/src/db/migrations/postgres/meta/_journal.json` *(update via `drizzle-kit generate` — see step 3)*

- [x] **Step 1.1: Extend `contentPages` and add `pageSegments` table**

In `apps/backend/src/db/schemas/postgres.ts`, replace the `contentPages` block and append the new table:

```ts
export const contentPages = pgTable("content_pages", {
  slug: text("slug").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  status: text("status").notNull().default("draft"),
  showTitle: boolean("show_title").notNull().default(true),
  pageType: text("page_type").notNull().default("default"),
  displayMode: text("display_mode").notNull().default("fullscreen"),
  overlayWidth: text("overlay_width").notNull().default("regular"),
  overlayHeight: text("overlay_height").notNull().default("regular"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  createdBy: text("created_by").references(() => adminUsers.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
});

export type ContentPageRow = typeof contentPages.$inferSelect;
export type ContentPageInsert = typeof contentPages.$inferInsert;

// Ordered segment list for pages with `page_type = 'segmented'`.
// Each segment references another content page (must be `page_type = 'default'`).
// Validation of that invariant lives in the service layer.
export const pageSegments = pgTable(
  "page_segments",
  {
    id: serial("id").primaryKey(),
    ownerSlug: text("owner_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade" }),
    targetSlug: text("target_slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    label: text("label").notNull(),
  },
  (table) => [index("idx_page_segments_owner").on(table.ownerSlug)],
);

export type PageSegmentRow = typeof pageSegments.$inferSelect;
export type PageSegmentInsert = typeof pageSegments.$inferInsert;
```

- [x] **Step 1.2: Write the SQL migration**

Create `apps/backend/src/db/migrations/postgres/0013_page_display_modes.sql`:

```sql
ALTER TABLE "content_pages"
  ADD COLUMN "page_type" text NOT NULL DEFAULT 'default',
  ADD COLUMN "display_mode" text NOT NULL DEFAULT 'fullscreen',
  ADD COLUMN "overlay_width" text NOT NULL DEFAULT 'regular',
  ADD COLUMN "overlay_height" text NOT NULL DEFAULT 'regular';

CREATE TABLE IF NOT EXISTS "page_segments" (
  "id" serial PRIMARY KEY NOT NULL,
  "owner_slug" text NOT NULL REFERENCES "content_pages"("slug") ON DELETE CASCADE,
  "target_slug" text NOT NULL REFERENCES "content_pages"("slug") ON DELETE CASCADE,
  "position" integer NOT NULL DEFAULT 0,
  "label" text NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_page_segments_owner" ON "page_segments"("owner_slug");
```

- [x] **Step 1.3: Apply locally**

The repo does NOT wire up `drizzle-kit generate` — migrations are hand-authored SQL files in `apps/backend/src/db/migrations/postgres/` and applied via `run-migrations.ts` which calls `migrate()` from `drizzle-orm/node-postgres/migrator`. So: commit the `.sql` file directly.

The Drizzle migrator reads `meta/_journal.json` to know which migrations have been applied. Before running, append a new journal entry that matches the shape of the last existing entry (bump `idx`, set `tag: "0013_page_display_modes"`, set a current `when` timestamp, keep `version` / `dialect` identical). Open the existing file first — do NOT guess the schema.

Apply (there is no specific `drizzle:migrate` script — run-migrations is invoked by backend startup or via `tsx` directly):

```bash
# confirm the script name first
cat apps/backend/package.json | grep -i migrate
# either the repo has a `db:migrate` script, or run the file directly:
npx tsx apps/backend/src/db/run-migrations.ts
```

Expected: migration `0013_page_display_modes` applied; `psql $DATABASE_URL -c "SELECT page_type, display_mode, overlay_width, overlay_height FROM content_pages LIMIT 1"` returns a row (existing pages default to `default / fullscreen / regular / regular`).

- [x] **Step 1.4: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres/
git commit -m "Feat: add page display modes + segments schema

- Extend content_pages with page_type, display_mode, overlay_width, overlay_height
- Add page_segments table (owner_slug + target_slug FKs to content_pages, ordered)"
```

Check off Task 1 in the top-level checklist.

---

## Task 2: Shared type extensions

**Files:**
- Modify: `packages/shared/src/content.ts`

- [x] **Step 2.1: Add literal unions and extend interfaces**

Replace the file body with the additions below (existing exports remain):

```ts
export type NavId = "header" | "footer";
export type NavTarget = "_self" | "_blank";

export interface NavItem {
  id: number;
  navId: NavId;
  pageSlug: string | null;
  pageTitle: string | null;
  url: string | null;
  target: NavTarget;
  label: string | null;
  position: number;
}

export interface NavItemInput {
  pageSlug?: string | null;
  url?: string | null;
  label?: string | null;
  target?: NavTarget;
}

export type ContentStatus = "draft" | "published" | "hidden";
export type PageType = "default" | "segmented";
export type PageDisplayMode = "fullscreen" | "embossed" | "translucent";
export type OverlayWidth = "small" | "regular" | "big";
export type OverlayHeight = "small" | "regular" | "dynamic" | "expanded";

export const PAGE_TYPES: readonly PageType[] = ["default", "segmented"] as const;
export const PAGE_DISPLAY_MODES: readonly PageDisplayMode[] = ["fullscreen", "embossed", "translucent"] as const;
export const OVERLAY_WIDTHS: readonly OverlayWidth[] = ["small", "regular", "big"] as const;
export const OVERLAY_HEIGHTS: readonly OverlayHeight[] = ["small", "regular", "dynamic", "expanded"] as const;

export interface PageSegment {
  id: number;
  position: number;
  label: string;
  targetSlug: string;
}

export interface PageSegmentInput {
  position: number;
  label: string;
  targetSlug: string;
}

export interface ContentPageSummary {
  slug: string;
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  createdByUsername: string | null;
  updatedByUsername: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface ContentPage extends ContentPageSummary {
  content: string;
  segments: PageSegment[];
}

export interface PublicPageSegment {
  label: string;
  targetSlug: string;
  title: string;
  showTitle: boolean;
  content: string;
  contentHtml: string;
}

export interface PublicContentPage {
  slug: string;
  title: string;
  showTitle: boolean;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  content: string;
  contentHtml: string;
  segments: PublicPageSegment[];
}
```

- [x] **Step 2.2: Build shared package**

```bash
npm run -w packages/shared build
```

Expected: clean build.

- [x] **Step 2.3: Commit**

```bash
git add packages/shared/src/content.ts packages/shared/dist
git commit -m "Feat: share page-display-mode and segment types

- Add PageType / PageDisplayMode / OverlayWidth / OverlayHeight unions + ordered arrays
- Extend ContentPage / PublicContentPage with display metadata and segments arrays"
```

Check off Task 2.

---

## Task 3: Admin repository/service updates for new columns

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts` (interfaces + `AdminRepository` contract)
- Modify: `apps/backend/src/db/adapters/postgres.ts` (raw SQL + mappers)
- Modify: `apps/backend/src/services/admin-content.ts` (`rowToSummary` / `rowToPage`)

Before editing, read these files to confirm the existing function names (`getManagedContentPage`, `getManagedContentPages`, `updateManagedContentPageMeta`, `createManagedContentPage`). Match their style exactly; do not rename them.

- [x] **Step 3.1a: Extend repository interfaces in `admin-repository.ts`**

Add the four display columns + `pageType` to both interfaces, and add `pageType?: PageType` to create + meta-update inputs:

```ts
import type { OverlayHeight, OverlayWidth, PageDisplayMode, PageType } from "@musiccloud/shared";

export interface ContentPageSummaryRow {
  slug: string;
  title: string;
  status: ContentStatus;
  showTitle: boolean;
  pageType: PageType;
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export interface ContentPageRow extends ContentPageSummaryRow {
  content: string;
}

export interface ContentPageCreateData {
  slug: string;
  title: string;
  status?: ContentStatus;
  pageType?: PageType;
  createdBy: string | null;
}

export interface ContentPageMetaUpdate {
  title?: string;
  slug?: string;
  status?: ContentStatus;
  showTitle?: boolean;
  pageType?: PageType;          // allow promoting default ↔ segmented
  displayMode?: PageDisplayMode;
  overlayWidth?: OverlayWidth;
  overlayHeight?: OverlayHeight;
  updatedBy: string | null;
}
```

- [x] **Step 3.1b: Update SQL + mappers in `adapters/postgres.ts`**

Extend the interface types `ContentPageSummarySqlRow` / `ContentPageSqlRow` with `page_type`, `display_mode`, `overlay_width`, `overlay_height`. Update `rowToContentPageSummary` to copy them through (`pageType: row.page_type as PageType` …). Then extend the column lists in EVERY query:
- `listContentPageSummaries` SELECT
- `getContentPageBySlug` SELECT
- `createContentPage` INSERT + RETURNING (add `page_type` to the `INSERT INTO ... (...)` list with `data.pageType ?? 'default'` as the value; columns `display_mode`, `overlay_width`, `overlay_height` use the SQL defaults set in Task 1)
- `updateContentPageMeta` — add `if (data.displayMode !== undefined) { setClauses.push('display_mode = $...'); values.push(data.displayMode); }` blocks for each of the four new fields plus `pageType`; then add the four new columns to the RETURNING list
- `updateContentPageBody` RETURNING
- `getPublishedContentPageBySlug` SELECT

The mapper change is small; the SELECT/RETURNING churn is repetitive. Commit-time tip: write one helper `const CONTENT_COLUMNS = "slug, title, content, status, show_title, page_type, display_mode, overlay_width, overlay_height, created_by, updated_by, created_at, updated_at"` and reuse it (same for a summary-columns string without `content`).

- [x] **Step 3.2: Service-layer mapper (`rowToSummary` / `rowToPage`)**

In `apps/backend/src/services/admin-content.ts`, extend `rowToSummary` to include `pageType`, `displayMode`, `overlayWidth`, `overlayHeight` from the repository row. `rowToPage` inherits via spread.

`pageType` changes are allowed only in one direction per update (`default → segmented` or `segmented → default`). On `segmented → default` the service deletes existing segments. Tests for this live in Task 4.

- [x] **Step 3.3: Extend `createManagedContentPage` to accept `pageType`**

Add an optional `pageType` (`"default" | "segmented"`, default `"default"`) to the create input. Insert the value alongside the existing defaults; everything else (display mode, width, height) uses the column defaults set in Task 1. Validate it against `PAGE_TYPES` and reject anything else with `INVALID_INPUT`. `updateManagedContentPageMeta` gains the same validation for `pageType`, `displayMode`, `overlayWidth`, `overlayHeight` (use `isOneOf` with the shared arrays — the same helper is added in Task 5.1).

- [x] **Step 3.4: Extend `getManagedContentPage` to fetch segments**

When `row.pageType === "segmented"`, also fetch ordered segments and attach as `segments`. For `"default"`, return `segments: []` to keep the interface uniform.

```ts
// pseudocode — real call goes through the repository method added in Task 4
const segments = row.pageType === "segmented"
  ? await repo.listSegmentsForOwner(row.slug)
  : [];
return { ok: true, data: { ...rowToPage(row, usernames), segments } };
```

`repo.listSegmentsForOwner` is added to the `AdminRepository` interface in Task 4; stub it for now by returning `segments: []` unconditionally, and fill it in Task 4.

- [x] **Step 3.5: Run backend tests**

```bash
npm run -w apps/backend test
```

Expected: baseline tests pass. If any existing test snapshots now need the four new fields on `ContentPage`, update those snapshots in this commit (they are trivial additions).

- [x] **Step 3.6: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/services/admin-content.ts apps/backend/src/__tests__
git commit -m "Feat: surface page display columns in admin content service

- Map page_type, display_mode, overlay_width, overlay_height on all content-page reads
- Accept pageType/displayMode/overlayWidth/overlayHeight in update + create inputs
- Stub segments fetch so ContentPage always carries a (possibly empty) segments array"
```

Check off Task 3.

---

## Task 4: Segments repository + service

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts` (add segment method contracts to `AdminRepository`; add `PageSegmentRow` + `PageSegmentInput` types)
- Modify: `apps/backend/src/db/adapters/postgres.ts` (implement the new methods via raw SQL — matches the house style)
- Create: `apps/backend/src/services/admin-segments.ts`

- [x] **Step 4.1a: Repository contracts**

In `admin-repository.ts` add after the content-page block:

```ts
export interface PageSegmentRow {
  id: number;
  ownerSlug: string;
  targetSlug: string;
  position: number;
  label: string;
}

export interface PageSegmentInputRow {
  position: number;
  label: string;
  targetSlug: string;
}
```

Then extend `AdminRepository` with three new methods:

```ts
listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]>;
replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]>;
deleteSegmentsForOwner(ownerSlug: string): Promise<void>;
```

- [x] **Step 4.1b: Raw-SQL implementation in `adapters/postgres.ts`**

Append three methods to the Postgres adapter class, matching the existing `pool.query` style. Use a transaction via `this.pool.connect()` + `BEGIN` / `COMMIT` / `ROLLBACK` for `replaceSegmentsForOwner`:

```ts
async listSegmentsForOwner(ownerSlug: string): Promise<PageSegmentRow[]> {
  const result = await this.pool.query<{ id: number; owner_slug: string; target_slug: string; position: number; label: string }>(
    `SELECT id, owner_slug, target_slug, position, label
     FROM page_segments
     WHERE owner_slug = $1
     ORDER BY position ASC`,
    [ownerSlug],
  );
  return result.rows.map((r) => ({
    id: r.id, ownerSlug: r.owner_slug, targetSlug: r.target_slug, position: r.position, label: r.label,
  }));
}

async deleteSegmentsForOwner(ownerSlug: string): Promise<void> {
  await this.pool.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
}

async replaceSegmentsForOwner(ownerSlug: string, segments: PageSegmentInputRow[]): Promise<PageSegmentRow[]> {
  const client = await this.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM page_segments WHERE owner_slug = $1`, [ownerSlug]);
    const rows: PageSegmentRow[] = [];
    for (const s of segments) {
      const r = await client.query<{ id: number }>(
        `INSERT INTO page_segments (owner_slug, target_slug, position, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [ownerSlug, s.targetSlug, s.position, s.label],
      );
      rows.push({ id: r.rows[0].id, ownerSlug, targetSlug: s.targetSlug, position: s.position, label: s.label });
    }
    await client.query("COMMIT");
    return rows.sort((a, b) => a.position - b.position);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

- [x] **Step 4.2: Service layer with validation**

```ts
// apps/backend/src/services/admin-segments.ts
import type { PageSegment, PageSegmentInput } from "@musiccloud/shared";
import { getAdminRepository } from "../db/index.js";

type ReplaceResult =
  | { ok: true; data: PageSegment[] }
  | { ok: false; code: "NOT_FOUND" | "INVALID_INPUT" | "TARGET_NOT_FOUND" | "TARGET_NOT_DEFAULT"; message: string };

export async function replaceSegments(ownerSlug: string, inputs: PageSegmentInput[]): Promise<ReplaceResult> {
  const repo = await getAdminRepository();
  const owner = await repo.getContentPageBySlug(ownerSlug);
  if (!owner) return { ok: false, code: "NOT_FOUND", message: `no page '${ownerSlug}'` };
  if (owner.pageType !== "segmented") {
    return { ok: false, code: "INVALID_INPUT", message: "owner page is not of type 'segmented'" };
  }

  if (inputs.some((s) => !s.label.trim())) {
    return { ok: false, code: "INVALID_INPUT", message: "segment label must not be empty" };
  }

  // NOTE: `selectContentPagesBySlugs` does not exist in the current repo.
  // Either add it via `AdminRepository.getContentPagesBySlugs(slugs: string[])`
  // (preferred — one round-trip) or call `repo.getContentPageBySlug(slug)` in
  // a `Promise.all` loop over `uniqueTargets`. Pick one and implement it in
  // this step — do not leave a dangling reference.
  const uniqueTargets = Array.from(new Set(inputs.map((s) => s.targetSlug)));
  const targetRows = await repo.getContentPagesBySlugs(uniqueTargets);
  const byTarget = new Map(targetRows.map((r) => [r.slug, r]));

  for (const s of inputs) {
    const row = byTarget.get(s.targetSlug);
    if (!row) return { ok: false, code: "TARGET_NOT_FOUND", message: `segment target '${s.targetSlug}' not found` };
    if (row.pageType !== "default") {
      return { ok: false, code: "TARGET_NOT_DEFAULT", message: `segment target '${s.targetSlug}' must be a default page` };
    }
    if (row.slug === ownerSlug) {
      return { ok: false, code: "INVALID_INPUT", message: "segment cannot target its owner" };
    }
  }

  const normalised = inputs
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((s, i) => ({ position: i, label: s.label.trim(), targetSlug: s.targetSlug }));

  const rows = await repo.replaceSegmentsForOwner(ownerSlug, normalised);
  return { ok: true, data: rows.map((r) => ({ id: r.id, position: r.position, label: r.label, targetSlug: r.targetSlug })) };
}
```

- [x] **Step 4.3: Wire into `getManagedContentPage`**

Replace the stub from Task 3.4 with `repo.listSegmentsForOwner` and map rows to `PageSegment`.

- [x] **Step 4.4: Hook into meta update**

Inside `updateManagedContentPageMeta`, when `pageType` transitions from `segmented → default`, call `repo.deleteSegmentsForOwner(slug)` before returning the updated row. The transition is detected by comparing the pre-update row (fetch before the SQL update) against the incoming `pageType`.

- [x] **Step 4.5: Unit test for validation**

Add `apps/backend/src/__tests__/admin-segments.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { replaceSegments } from "../services/admin-segments.js";

describe("replaceSegments", () => {
  it("rejects pointing a segment at a non-default page", async () => {
    // arrange: seed owner (segmented) + target (segmented)
    // ... (use existing test harness in apps/backend/src/__tests__)
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "Segment A", targetSlug: "segmented-target" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("TARGET_NOT_DEFAULT");
  });

  it("rejects self-reference", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 0, label: "Self", targetSlug: "owner-slug" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("normalises positions to a contiguous 0..N-1 range", async () => {
    const result = await replaceSegments("owner-slug", [
      { position: 10, label: "A", targetSlug: "default-a" },
      { position: 2, label: "B", targetSlug: "default-b" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.map((s) => s.position)).toEqual([0, 1]);
      expect(result.data.map((s) => s.label)).toEqual(["B", "A"]);
    }
  });
});
```

Run the test (expect all three to pass after the service is implemented):

```bash
npm run -w apps/backend test -- admin-segments
```

- [x] **Step 4.6: Commit**

```bash
git add apps/backend/src/db/ apps/backend/src/services/admin-segments.ts apps/backend/src/__tests__/admin-segments.test.ts
git commit -m "Feat: segment management service with validation

- Repository CRUD for page_segments keyed on owner_slug
- Service-level checks: owner must be segmented, target must be default, no self-reference
- Positions are normalised to 0..N-1 on every replace"
```

Check off Task 4.

---

## Task 5: Admin API endpoints

**Files:**
- Modify: `apps/backend/src/routes/admin-content.ts`
- Modify: `packages/shared/src/endpoints.ts` *(if the project registers admin endpoints there — grep for `admin.pages` first and follow the existing pattern)*

- [x] **Step 5.1: Extend `validateCreateBody` and `validateMetaBody`**

Add the four new optional fields to `ContentMetaBody` with literal-union validation. Reuse the shared arrays from Task 2:

```ts
import { OVERLAY_HEIGHTS, OVERLAY_WIDTHS, PAGE_DISPLAY_MODES, PAGE_TYPES } from "@musiccloud/shared";

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === "string" && (list as readonly string[]).includes(v);
}

function validateMetaBody(body: unknown): ContentMetaBody | string {
  if (!isPlainObject(body)) return "body must be an object";
  const out: ContentMetaBody = {};
  // ...existing title/slug/status/showTitle validation kept as-is...
  if (body.pageType !== undefined) {
    if (!isOneOf(PAGE_TYPES, body.pageType)) return "pageType must be 'default' or 'segmented'";
    out.pageType = body.pageType;
  }
  if (body.displayMode !== undefined) {
    if (!isOneOf(PAGE_DISPLAY_MODES, body.displayMode)) return "displayMode invalid";
    out.displayMode = body.displayMode;
  }
  if (body.overlayWidth !== undefined) {
    if (!isOneOf(OVERLAY_WIDTHS, body.overlayWidth)) return "overlayWidth invalid";
    out.overlayWidth = body.overlayWidth;
  }
  if (body.overlayHeight !== undefined) {
    if (!isOneOf(OVERLAY_HEIGHTS, body.overlayHeight)) return "overlayHeight invalid";
    out.overlayHeight = body.overlayHeight;
  }
  return out;
}
```

Apply the same `pageType` addition to `validateCreateBody`.

- [x] **Step 5.2: Segments endpoint**

Append inside `adminContentRoutes`:

```ts
// PUT /api/admin/pages/:slug/segments — replace segment list
app.put<{ Params: { slug: string }; Body: unknown }>(
  `${ROUTE_TEMPLATES.admin.pages.detail}/segments`,
  async (request, reply) => {
    const body = request.body;
    if (!Array.isArray(body)) {
      return reply.status(400).send({ error: "INVALID_INPUT", message: "body must be an array" });
    }
    const inputs: PageSegmentInput[] = [];
    for (const raw of body) {
      if (!isPlainObject(raw)) {
        return reply.status(400).send({ error: "INVALID_INPUT", message: "segment must be an object" });
      }
      if (typeof raw.label !== "string") return reply.status(400).send({ error: "INVALID_INPUT", message: "label must be string" });
      if (typeof raw.targetSlug !== "string") return reply.status(400).send({ error: "INVALID_INPUT", message: "targetSlug must be string" });
      if (typeof raw.position !== "number") return reply.status(400).send({ error: "INVALID_INPUT", message: "position must be number" });
      inputs.push({ label: raw.label, targetSlug: raw.targetSlug, position: raw.position });
    }
    const result = await replaceSegments(request.params.slug, inputs);
    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return reply.status(status).send({ error: result.code, message: result.message });
    }
    return result.data;
  },
);
```

- [x] **Step 5.3: Integration test**

In the existing admin routes test (or add `apps/backend/src/__tests__/admin-pages.test.ts`):

```ts
it("PUT /admin/pages/:slug/segments replaces segments in order", async () => {
  // seed owner (segmented) + two defaults (default-a, default-b) beforehand
  const res = await app.inject({
    method: "PUT",
    url: "/api/admin/pages/owner/segments",
    payload: [
      { position: 5, label: "Second", targetSlug: "default-b" },
      { position: 1, label: "First", targetSlug: "default-a" },
    ],
    headers: { authorization: `Bearer ${adminToken}` },
  });
  expect(res.statusCode).toBe(200);
  const data = res.json();
  expect(data.map((s: PageSegment) => s.label)).toEqual(["First", "Second"]);
  expect(data.map((s: PageSegment) => s.position)).toEqual([0, 1]);
});
```

Run: `npm run -w apps/backend test -- admin-pages`. Expected: pass.

- [x] **Step 5.4: Commit**

```bash
git add apps/backend/src/routes/admin-content.ts apps/backend/src/__tests__ packages/shared
git commit -m "Feat: admin API for page display modes + segments

- PATCH /admin/pages/:slug now accepts pageType/displayMode/overlayWidth/overlayHeight
- POST validates pageType
- New PUT /admin/pages/:slug/segments replaces the segment list atomically"
```

Check off Task 5.

---

## Task 6: Public content API

**Files:**
- Modify: `apps/backend/src/services/admin-content.ts` (`getPublicContentPage` — add display metadata + segments)
- Modify: `apps/backend/src/schemas/openapi-schemas.ts` (**MANDATORY** — extend `PublicContentPageSchema`; add `PublicPageSegmentSchema`; optionally extend `ContentPageSummarySchema`)

**Critical:** Fastify response validation (`additionalProperties: false` in every schema) silently strips fields the schema does not declare. If you skip Step 6.2 the four new fields + segments reach the serialiser and are DELETED before the frontend sees them. This is why the architecture-check bullet below is load-bearing.

- [x] **Step 6.1: Extend the public resolver**

Return the four metadata fields plus a `segments` array. For `pageType === "default"`, `segments` is `[]`. For `pageType === "segmented"`, fetch segments, fetch each target page, and render markdown HTML per target using the same `marked.parse(content, { async: false })` call already used for `contentHtml` in `getPublicContentPage` — do not introduce a new renderer.

```ts
async function buildPublicPage(page: ContentPageRow): Promise<PublicContentPage> {
  const base = {
    slug: page.slug,
    title: page.title,
    showTitle: page.showTitle,
    pageType: page.pageType as PageType,
    displayMode: page.displayMode as PageDisplayMode,
    overlayWidth: page.overlayWidth as OverlayWidth,
    overlayHeight: page.overlayHeight as OverlayHeight,
    content: page.content,
    contentHtml: renderMarkdown(page.content),
  };

  if (page.pageType !== "segmented") {
    return { ...base, segments: [] };
  }

  const segmentRows = await selectSegmentsForOwner(page.slug);
  if (segmentRows.length === 0) return { ...base, segments: [] };

  const targets = await selectContentPagesBySlugs(segmentRows.map((s) => s.targetSlug));
  const bySlug = new Map(targets.map((t) => [t.slug, t]));

  const segments: PublicPageSegment[] = segmentRows
    .filter((s) => bySlug.has(s.targetSlug))
    .map((s) => {
      const t = bySlug.get(s.targetSlug)!;
      return {
        label: s.label,
        targetSlug: s.targetSlug,
        title: t.title,
        showTitle: t.showTitle,
        content: t.content,
        contentHtml: renderMarkdown(t.content),
      };
    });

  return { ...base, segments };
}
```

Also: only publish segments for which the target page is `status === "published"`. Drafts/hidden targets are filtered out of the public response.

The current implementation in `admin-content.ts:133-144` only exposes `slug / title / showTitle / content / contentHtml`. Replace the whole `getPublicContentPage` function with a version that builds the full `PublicContentPage`. Use `getPublishedContentPageBySlug` for the owner, then (when segmented) a new `repo.getPublishedContentPagesBySlugs(slugs)` — add that method to `AdminRepository` in the same step — so drafts/hidden rows never leak into segments. The repo method must filter by `status = 'published'` at SQL level, not in JS.

- [x] **Step 6.2: Update OpenAPI schemas (MANDATORY — response-validation trap)**

In `apps/backend/src/schemas/openapi-schemas.ts`:

```ts
export const PublicPageSegmentSchema = {
  $id: "PublicPageSegment",
  type: "object",
  description: "One segment of a segmented public content page — carries the target page's rendered body.",
  required: ["label", "targetSlug", "title", "showTitle", "content", "contentHtml"],
  additionalProperties: false,
  properties: {
    label: { type: "string" },
    targetSlug: { type: "string" },
    title: { type: "string" },
    showTitle: { type: "boolean" },
    content: { type: "string" },
    contentHtml: { type: "string" },
  },
  example: { label: "Overview", targetSlug: "about-overview", title: "Overview", showTitle: true, content: "…", contentHtml: "<p>…</p>" },
} as const;
```

Extend `PublicContentPageSchema.properties` with:

```ts
  pageType: { type: "string", enum: ["default", "segmented"] },
  displayMode: { type: "string", enum: ["fullscreen", "embossed", "translucent"] },
  overlayWidth: { type: "string", enum: ["small", "regular", "big"] },
  overlayHeight: { type: "string", enum: ["small", "regular", "dynamic", "expanded"] },
  segments: { type: "array", items: { $ref: "PublicPageSegment#" } },
```

Add them to `required` (segments MUST be present — empty array for default pages). Append `PublicPageSegmentSchema` to the `OPENAPI_SCHEMAS` array BEFORE `PublicContentPageSchema` (dependents last). Also extend `ContentPageSummarySchema` with the four new fields so `ContentPage` admin responses don't strip them either.

- [x] **Step 6.3: Update `fetchPublicContentPage` client helper**

In `apps/frontend/src/api/client.ts:125-137`, the return type already references `PublicContentPage` from `@musiccloud/shared`, so this is type-only after Task 2 ships. Verify by running `npm run -w apps/frontend typecheck`.

- [x] **Step 6.4: Commit**

```bash
git add apps/backend/src/services apps/backend/src/schemas/openapi-schemas.ts apps/backend/src/db apps/frontend/src/api/client.ts
git commit -m "Feat: surface display metadata + segments in public content API

- Public GET returns pageType/displayMode/overlayWidth/overlayHeight + segments
- Segmented pages hydrate segments with rendered HTML from their default targets
- Unpublished target pages are filtered out of the public segments array
- OpenAPI schemas updated so response serialisation no longer strips new fields"
```

Check off Task 6.

---

## Task 7: Dashboard hooks

**Files:**
- Modify: `apps/dashboard/src/features/content/hooks/useAdminContent.ts`

The current file defines its own local `ContentPage` interface (lines 5-16) with an `id: number` field that the backend never returns. Replace it with the shared type.

- [x] **Step 7.1: Replace the local `ContentPage` type**

Drop the local interface. Import and re-export the shared one:

```ts
import type { ContentPage, ContentPageSummary, PageSegment, PageSegmentInput } from "@musiccloud/shared";
export type { ContentPage };
```

Update `useContentPages` to use `ContentPageSummary[]` (that's what `GET /admin/pages` actually returns). Update `useAdminContentPage` to use `ContentPage` (body + segments). Call-sites that expect the phantom `id: number` do not exist — `PagesListPage` keys by `slug` (`getRowKey={(page) => page.slug}`), so the rename is safe.

- [x] **Step 7.2: Extend `usePatchContentPage`**

Input widens naturally since `Partial<ContentPage>` now includes the four new fields + `pageType`. No code change beyond the type import.

- [x] **Step 7.3: Add segments hook**

Reuse the existing `api` client (`@/lib/api`) — do not hand-roll `fetch` + auth headers; every other hook in this file goes through `api.put` / `api.patch` / etc.:

```ts
export function useSaveContentPageSegments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ slug, segments }: { slug: string; segments: PageSegmentInput[] }) =>
      api.put<PageSegment[]>(`/admin/pages/${slug}/segments`, segments),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["content-pages", vars.slug] });
      qc.invalidateQueries({ queryKey: ["content-pages"] });
    },
  });
}
```

If `api.put` is not defined on the existing client (`@/lib/api`), add it in the same commit — keep the fetch logic in the one place the rest of the dashboard uses it.

- [x] **Step 7.2: Commit**

```bash
git add apps/dashboard/src/features/content/hooks/useAdminContent.ts
git commit -m "Feat: dashboard hooks accept display metadata + expose segments mutation"
```

Check off Task 7.

---

## Task 8: Dashboard PagesListPage

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/PagesListPage.tsx`

- [x] **Step 8.1: Add a page-type radio to the create dialog**

Inside the `<Dialog>` form, between the slug field and the action row, add:

```tsx
<div>
  <span className="block text-xs font-medium text-[var(--ds-text-muted)] mb-1">
    {text.fieldPageType}
  </span>
  <div className="flex gap-2">
    {(["default", "segmented"] as const).map((pt) => (
      <label
        key={pt}
        className={cn(
          "flex-1 px-3 py-2 text-xs border rounded-control cursor-pointer text-center",
          pageType === pt
            ? "border-[var(--color-primary)] text-[var(--ds-text)]"
            : "border-[var(--ds-border)] text-[var(--ds-text-muted)]",
        )}
      >
        <input
          type="radio"
          name="pageType"
          value={pt}
          checked={pageType === pt}
          onChange={() => dispatch({ pageType: pt })}
          className="sr-only"
        />
        {pt === "default" ? text.pageTypeDefault : text.pageTypeSegmented}
      </label>
    ))}
  </div>
</div>
```

Extend `PagesListState` with `pageType: PageType` (default `"default"`). Pass `pageType` to `createPage.mutateAsync({ slug, title, pageType })`.

- [x] **Step 8.2: Add a type badge in the table**

Insert a new column between `slug` and `status`:

```tsx
{
  id: "type",
  header: text.table.type,
  cell: (page) => (
    <span className="text-xs text-[var(--ds-text-muted)]">
      {page.pageType === "segmented" ? text.pageTypeSegmented : text.pageTypeDefault}
    </span>
  ),
},
```

- [x] **Step 8.3: i18n keys**

Add `content.pages.fieldPageType`, `content.pages.pageTypeDefault`, `content.pages.pageTypeSegmented`, `content.pages.table.type` in `apps/dashboard/src/i18n/messages.ts`.

- [x] **Step 8.4: Commit**

```bash
git add apps/dashboard/src/features/content apps/dashboard/src/i18n
git commit -m "Feat: pages list shows page type + create dialog picks default/segmented"
```

Check off Task 8.

---

## Task 9: Dashboard ContentEditorPage display pickers

**Files:**
- Create: `apps/dashboard/src/features/content/pages/PageDisplaySettings.tsx`
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`

- [x] **Step 9.1: Extract display settings into a dedicated component**

`PageDisplaySettings.tsx`:

```tsx
import {
  OVERLAY_HEIGHTS,
  OVERLAY_WIDTHS,
  PAGE_DISPLAY_MODES,
  type OverlayHeight,
  type OverlayWidth,
  type PageDisplayMode,
} from "@musiccloud/shared";

interface Props {
  displayMode: PageDisplayMode;
  overlayWidth: OverlayWidth;
  overlayHeight: OverlayHeight;
  onChange: (patch: Partial<{ displayMode: PageDisplayMode; overlayWidth: OverlayWidth; overlayHeight: OverlayHeight }>) => void;
  labels: {
    displayMode: string;
    fullscreen: string;
    embossed: string;
    translucent: string;
    overlayWidth: string;
    overlayHeight: string;
    widths: Record<OverlayWidth, string>;
    heights: Record<OverlayHeight, string>;
  };
}

export function PageDisplaySettings({ displayMode, overlayWidth, overlayHeight, onChange, labels }: Props) {
  const isOverlay = displayMode !== "fullscreen";
  return (
    <div className="flex flex-wrap gap-6 py-3">
      <Picker
        label={labels.displayMode}
        value={displayMode}
        options={PAGE_DISPLAY_MODES.map((m) => ({ value: m, label: labels[m as keyof typeof labels] as string }))}
        onChange={(v) => onChange({ displayMode: v as PageDisplayMode })}
      />
      {isOverlay && (
        <>
          <Picker
            label={labels.overlayWidth}
            value={overlayWidth}
            options={OVERLAY_WIDTHS.map((w) => ({ value: w, label: labels.widths[w] }))}
            onChange={(v) => onChange({ overlayWidth: v as OverlayWidth })}
          />
          <Picker
            label={labels.overlayHeight}
            value={overlayHeight}
            options={OVERLAY_HEIGHTS.map((h) => ({ value: h, label: labels.heights[h] }))}
            onChange={(v) => onChange({ overlayHeight: v as OverlayHeight })}
          />
        </>
      )}
    </div>
  );
}

function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--ds-text-muted)]">
      <span className="font-medium">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-[var(--ds-input-bg)] border border-[var(--ds-border)] rounded px-1.5 py-0.5 text-[var(--ds-text)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
```

- [x] **Step 9.2: Mount it inside `ContentEditorPage`**

Place `<PageDisplaySettings …/>` between the existing `<EditorMetadataBar>` and the `<DashboardSection>` body. Wire its `onChange` to `handlePatch` from the existing editor.

- [x] **Step 9.3: Hide the markdown editor for Segmented pages**

If `page.pageType === "segmented"`, replace the `<MarkdownEditor>` block with `<SegmentManager page={page} />` (comes in Task 10).

- [x] **Step 9.4: i18n keys**

Add the labels used by `PageDisplaySettings` (display mode + width/height + their option labels) in `apps/dashboard/src/i18n/messages.ts` (single consolidated messages file — both locales live there side-by-side, not in separate per-locale files).

- [x] **Step 9.5: Commit**

```bash
git add apps/dashboard/src/features/content apps/dashboard/src/i18n
git commit -m "Feat: content editor exposes display mode + overlay size pickers"
```

Check off Task 9.

---

## Task 10: Segment manager UI

**Files:**
- Create: `apps/dashboard/src/features/content/pages/SegmentManager.tsx`
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` (mount)

- [x] **Step 10.1: Data flow**

Fetch list of all Default pages (`useContentPages()` — filter `pageType === "default"`) and render a drag-orderable list of segments. Local state holds a draft; a Save button calls `useSaveContentPageSegments()`.

```tsx
export function SegmentManager({ page }: { page: ContentPage }) {
  const { data: allPages = [] } = useContentPages();
  const defaultPages = allPages.filter((p) => p.pageType === "default" && p.slug !== page.slug);
  const saveSegments = useSaveContentPageSegments();

  const [draft, setDraft] = useState<PageSegmentInput[]>(() =>
    page.segments.map((s) => ({ position: s.position, label: s.label, targetSlug: s.targetSlug })),
  );

  // render list with up/down buttons, label input, target <select>, remove button
  // a "+ Add segment" button pushes a new draft entry using the first unused default page
  // a top-level Save button calls saveSegments.mutate({ slug: page.slug, segments: draft })
  // a live preview row renders the segmented control with the current labels

  return (/* ...list + preview... */);
}
```

Up/down buttons swap adjacent entries in the draft. Renormalise `position` to `0..N-1` before saving.

- [x] **Step 10.2: Live preview**

Render a non-interactive preview that mirrors the frontend look. Use the existing dashboard `SegmentedControl` (`apps/dashboard/src/components/ui/SegmentedControl.tsx`) — it already matches the embed-modal style.

- [x] **Step 10.3: Validation surface**

Disable the Save button when any segment has an empty label. Surface server errors inline (use the same `patchError` style as `EditorMetadataBar`).

- [x] **Step 10.4: Commit**

```bash
git add apps/dashboard/src/features/content
git commit -m "Feat: dashboard segment manager with live preview + atomic save"
```

Check off Task 10.

---

## Task 11: Frontend `TranslucentCard` compound component

**Files:**
- Create: `apps/frontend/src/components/cards/TranslucentCard.tsx`

- [x] **Step 11.1: Build the component**

Mirror the shape of `EmbossedCard`: `Header`, `Body`, `Footer`, optional `SegmentedControl` (to be added in Task 14). Use the glassy look copied from `InfoPanel` (lines 57-67 of the existing file):

```tsx
import { Children, isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const HEADER_TAG = Symbol("TranslucentCard.Header");
const BODY_TAG = Symbol("TranslucentCard.Body");
const FOOTER_TAG = Symbol("TranslucentCard.Footer");
const SEGMENTS_TAG = Symbol("TranslucentCard.SegmentedControl");

function tagged<P>(Component: (p: P) => JSX.Element, tag: symbol) {
  (Component as unknown as Record<symbol, boolean>)[tag] = true;
  return Component;
}

function hasTag(child: unknown, tag: symbol) {
  return isValidElement(child) && (child.type as unknown as Record<symbol, boolean>)?.[tag] === true;
}

export function TranslucentCard({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const arr = Children.toArray(children);
  const header = arr.find((c) => hasTag(c, HEADER_TAG));
  const segments = arr.find((c) => hasTag(c, SEGMENTS_TAG));
  const body = arr.find((c) => hasTag(c, BODY_TAG));
  const footer = arr.find((c) => hasTag(c, FOOTER_TAG));

  return (
    <div
      className={cn(
        "flex flex-col",
        "bg-white/[0.05] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden",
        className,
      )}
      style={style}
    >
      {header}
      {segments}
      {body}
      {footer}
    </div>
  );
}

TranslucentCard.Header = tagged(function Header({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-shrink-0 px-6 pt-5", className)}>{children}</div>;
}, HEADER_TAG);

TranslucentCard.Body = tagged(function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-5", className)}>{children}</div>;
}, BODY_TAG);

TranslucentCard.Footer = tagged(function Footer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex-shrink-0 px-6 pb-5", className)}>{children}</div>;
}, FOOTER_TAG);

// Placeholder — the SegmentedControl sub-component is attached in Task 14.
TranslucentCard.SegmentedControl = tagged(function Placeholder() {
  return null;
}, SEGMENTS_TAG);
```

- [x] **Step 11.2: Commit**

```bash
git add apps/frontend/src/components/cards/TranslucentCard.tsx
git commit -m "Feat: add TranslucentCard compound component (glass look)"
```

Check off Task 11.

---

## Task 12: Refactor `InfoPanel` onto `TranslucentCard`

**Files:**
- Modify: `apps/frontend/src/components/panels/InfoPanel.tsx`

- [x] **Step 12.1: Replace the bespoke markup**

Keep the open/close animation + tab behaviour, swap the surface markup for `TranslucentCard`. The tab row will move into `TranslucentCard.SegmentedControl` once Task 14 lands; for now keep the existing tab row inside `TranslucentCard.Header` and mark a `// TODO(Task 14)` comment. (Comment is acceptable here because it is referenced in the plan and removed before the plan is done — delete the TODO in Task 14.)

- [x] **Step 12.2: Visual parity check**

Open `http://localhost:3000/`, click the info button, confirm the panel looks identical to before. Run the frontend ui-test suite:

```bash
npm run -w apps/frontend ui-test -- --plan info-panel
```

If that plan key does not exist, do a manual screenshot comparison.

- [x] **Step 12.3: Commit**

```bash
git add apps/frontend/src/components/panels/InfoPanel.tsx
git commit -m "Refactor: InfoPanel built on TranslucentCard compound"
```

Check off Task 12.

---

## Task 13: `EmbossedCard.SegmentedControl`

**Files:**
- Modify: `apps/frontend/src/components/cards/EmbossedCard.tsx`
- Reuse: existing `apps/frontend/src/components/ui/SegmentedControl.tsx`

- [x] **Step 13.1: Attach a sub-component**

Extend `EmbossedCard` so it recognises a `SegmentedControl` child slot rendered between header and body at full width:

```ts
const SEGMENTS_TAG = Symbol("EmbossedCard.SegmentedControl");

// inside compound render: place the segments child right after headerChild,
// before bodyChild
{hasAddOns ? (/*...*/) : headerChild}
{segmentsChild}
{bodyChild}
{footerChild}

function SegmentedControlSlot<T extends string>(props: SegmentedControlProps<T>) {
  return <SegmentedControl {...props} className={cn("mt-3", props.className)} />;
}
(SegmentedControlSlot as unknown as Record<symbol, boolean>)[SEGMENTS_TAG] = true;
EmbossedCard.SegmentedControl = SegmentedControlSlot;
```

Ensure the segmented control always spans full width inside the card — pass `className="w-full"` by default.

- [x] **Step 13.2: Commit**

```bash
git add apps/frontend/src/components/cards/EmbossedCard.tsx
git commit -m "Feat: EmbossedCard.SegmentedControl slot for segmented pages"
```

Check off Task 13.

---

## Task 14: `TranslucentCard.SegmentedControl`

**Files:**
- Modify: `apps/frontend/src/components/cards/TranslucentCard.tsx`

- [x] **Step 14.1: Build the tab-style control**

Replace the placeholder slot from Task 11 with a real component modelled on the tab row from the old `InfoPanel` (bottom-border active indicator, no track). It accepts the same `{ segments, value, onChange }` props as `SegmentedControl` but renders a flat tab row:

```tsx
interface Seg<T extends string> { key: T; label: string }

TranslucentCard.SegmentedControl = tagged(function Segments<T extends string>({
  segments,
  value,
  onChange,
}: {
  segments: Seg<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-6 border-b border-white/[0.08] px-6">
      {segments.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            "pb-3 text-base font-medium tracking-[-0.01em] transition-colors duration-150 border-b-2 -mb-px focus:outline-none",
            value === key ? "text-white border-white/50" : "text-white/30 border-transparent hover:text-white/55",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}, SEGMENTS_TAG);
```

- [x] **Step 14.2: Use it inside `InfoPanel`**

Remove the old inline tab row, mount `TranslucentCard.SegmentedControl` between header and body, remove the `TODO(Task 14)` comment from Task 12.

- [x] **Step 14.3: Commit**

```bash
git add apps/frontend/src/components/cards/TranslucentCard.tsx apps/frontend/src/components/panels/InfoPanel.tsx
git commit -m "Feat: TranslucentCard.SegmentedControl tab row; adopt in InfoPanel"
```

Check off Task 14.

---

## Task 15: `PageOverlay` primitive

**Files:**
- Create: `apps/frontend/src/components/layout/PageOverlay.tsx`

- [x] **Step 15.1: Map size tokens to classes**

```tsx
import type { OverlayHeight, OverlayWidth, PageDisplayMode } from "@musiccloud/shared";
import { cn } from "@/lib/utils";

const widthClass: Record<OverlayWidth, string> = {
  small: "max-w-[420px]",
  regular: "max-w-[560px]",
  big: "max-w-[820px]",
};

const heightClass: Record<OverlayHeight, string> = {
  small: "max-h-[40vh]",
  regular: "max-h-[60vh]",
  dynamic: "max-h-[85vh]",
  expanded: "h-[85vh] max-h-[85vh]",
};

export function overlayClasses(mode: Exclude<PageDisplayMode, "fullscreen">, w: OverlayWidth, h: OverlayHeight) {
  return cn(
    "w-[calc(100vw-2rem)]",
    widthClass[w],
    heightClass[h],
    mode === "translucent" ? "" : "",
    "flex flex-col",
  );
}
```

The component is a thin helper; actual card is rendered by the caller (overlay island) using `TranslucentCard` or `EmbossedCard`. Export `overlayClasses` so both renderers share one mapping.

- [x] **Step 15.2: Commit**

```bash
git add apps/frontend/src/components/layout/PageOverlay.tsx
git commit -m "Feat: overlay size token → Tailwind class mapper"
```

Check off Task 15.

---

## Task 16: `PageOverlayIsland` + `OverlayContext`

**Files:**
- Create: `apps/frontend/src/context/OverlayContext.tsx`
- Create: `apps/frontend/src/components/layout/PageOverlayIsland.tsx`

- [x] **Step 16.1: OverlayContext**

```tsx
// apps/frontend/src/context/OverlayContext.tsx
import { createContext, useCallback, useContext, useMemo, useReducer } from "react";
import type { PublicContentPage } from "@musiccloud/shared";

interface OverlayState { page: PublicContentPage | null }
type OverlayAction = { type: "open"; page: PublicContentPage } | { type: "close" };

interface OverlayAPI {
  page: PublicContentPage | null;
  open: (page: PublicContentPage) => void;
  close: () => void;
}

const OverlayCtx = createContext<OverlayAPI | null>(null);

export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(
    (_s: OverlayState, a: OverlayAction): OverlayState => (a.type === "open" ? { page: a.page } : { page: null }),
    { page: null },
  );
  const open = useCallback((page: PublicContentPage) => dispatch({ type: "open", page }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const value = useMemo(() => ({ page: state.page, open, close }), [state.page, open, close]);
  return <OverlayCtx.Provider value={value}>{children}</OverlayCtx.Provider>;
}

export function useOverlay() {
  const ctx = useContext(OverlayCtx);
  if (!ctx) throw new Error("useOverlay must be used inside OverlayProvider");
  return ctx;
}
```

- [x] **Step 16.2: PageOverlayIsland**

```tsx
// apps/frontend/src/components/layout/PageOverlayIsland.tsx
import { XIcon } from "@phosphor-icons/react";
import { useEffect } from "react";
import { EmbossedCard } from "@/components/cards/EmbossedCard";
import { TranslucentCard } from "@/components/cards/TranslucentCard";
import { overlayClasses } from "@/components/layout/PageOverlay";
import { OverlayProvider, useOverlay } from "@/context/OverlayContext";
import { LocaleProvider } from "@/i18n/context";
import type { PublicContentPage } from "@musiccloud/shared";
import { cn } from "@/lib/utils";

interface Props {
  initialPage: PublicContentPage | null;
}

export function PageOverlayIsland({ initialPage }: Props) {
  return (
    <LocaleProvider>
      <OverlayProvider>
        <OverlayShell initialPage={initialPage} />
      </OverlayProvider>
    </LocaleProvider>
  );
}

function OverlayShell({ initialPage }: { initialPage: PublicContentPage | null }) {
  const { page, open, close } = useOverlay();
  useEffect(() => {
    if (initialPage) open(initialPage);
  }, [initialPage, open]);

  useEffect(() => {
    if (!page) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, close]);

  if (!page || page.displayMode === "fullscreen") return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm cursor-default"
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none p-4">
        <div className={cn("pointer-events-auto relative", overlayClasses(page.displayMode, page.overlayWidth, page.overlayHeight))}>
          {page.displayMode === "translucent"
            ? <TranslucentOverlayContent page={page} onClose={close} />
            : <EmbossedOverlayContent page={page} onClose={close} />}
        </div>
      </div>
    </>
  );
}
```

Content components `TranslucentOverlayContent` and `EmbossedOverlayContent` render either static markdown or segmented content — implementation is in Task 19.

- [x] **Step 16.3: Commit**

```bash
git add apps/frontend/src/context apps/frontend/src/components/layout
git commit -m "Feat: OverlayProvider + PageOverlayIsland shell"
```

Check off Task 16.

---

## Task 17: `[shortId].astro` render branches

**Files:**
- Modify: `apps/frontend/src/pages/[shortId].astro`

- [x] **Step 17.1: Branch on `displayMode`**

Replace the existing `{contentPage ? (...) : (...)}` block with three cases:

```astro
{contentPage && contentPage.displayMode === "fullscreen" && (
  <main id="main-content" class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-12">
    {contentPage.showTitle && (
      <h1 class="text-3xl sm:text-4xl font-bold tracking-[-0.04em] mb-8">{contentPage.title}</h1>
    )}
    {contentPage.pageType === "segmented" ? (
      <SegmentedPageFullscreenIsland client:load page={contentPage} />
    ) : (
      <article class="prose prose-invert max-w-none" set:html={contentPage.contentHtml} />
    )}
  </main>
)}

{contentPage && contentPage.displayMode !== "fullscreen" && (
  <>
    <main id="main-content" class="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
      <!-- landing hero, re-used from the non-contentPage branch -->
      <HeroSection client:idle />
    </main>
    <PageOverlayIsland client:load initialPage={contentPage} />
  </>
)}

{!contentPage && (
  <!-- existing share branch, unchanged -->
)}
```

If there is no existing `HeroSection` island wrapper, render a minimal landing placeholder (brand name) — this backdrop is intentionally a placeholder because the landing page itself is a different route; a future task can widen it. The `set:html` usage above reuses the exact pattern from the current Astro file (same input value, already server-sanitised).

- [x] **Step 17.2: Commit**

```bash
git add apps/frontend/src/pages/[shortId].astro
git commit -m "Feat: page route branches by displayMode (fullscreen vs overlay)"
```

Check off Task 17.

---

## Task 18: Nav click interception

**Files:**
- Modify: `apps/frontend/src/components/layout/PageHeader.tsx`
- Modify: `apps/frontend/src/components/layout/PageHeaderIsland.tsx`

- [x] **Step 18.1: Pass the overlay API through**

`PageHeaderIsland` already wraps `PageHeader` in a `LocaleProvider`. Wrap it with `OverlayProvider` too, so clicks in the header can open overlays. If the page also mounts `PageOverlayIsland`, both must share the same provider — hoist `OverlayProvider` into a parent wrapper island (new `AppShellIsland.tsx`) that the Astro route mounts once.

- [x] **Step 18.2: Extend `NavItem` with display hints (preferred path)**

`apps/backend/src/db/adapters/postgres.ts:2416-2427` already `LEFT JOIN content_pages` when listing nav items (for `pageTitle`). Extend that JOIN to select the four display columns + `page_type` and propagate them through:

1. Shared type — add to `NavItem` in `packages/shared/src/content.ts`:
   ```ts
   pageType: PageType | null;        // null when the nav item is an external URL
   pageDisplayMode: PageDisplayMode | null;
   pageOverlayWidth: OverlayWidth | null;
   pageOverlayHeight: OverlayHeight | null;
   ```
   Also extend `NavItemRow` in `apps/backend/src/db/admin-repository.ts` and `NavItemSqlRow` + `rowToNavItem` in `adapters/postgres.ts`.
2. SQL: add `p.page_type, p.display_mode, p.overlay_width, p.overlay_height` to the JOIN projection (`LEFT JOIN` so external-URL items stay valid with nulls).
3. `NavItemSchema` in `openapi-schemas.ts` — add the four nullable properties (ENUM validations so wrong values surface immediately).
4. `apps/backend/src/services/admin-nav.ts:10-21` — `rowToNavItem` must copy the new fields through. This keeps `replaceManagedNavItems` untouched since it doesn't read display info.

With the JOIN in place, the header knows the display mode before any click — the frontend needs no extra round-trip.

- [x] **Step 18.3: Intercept nav clicks in `PageHeader.tsx`**

```tsx
function handleNavClick(e: React.MouseEvent<HTMLAnchorElement>, item: NavItem) {
  if (!item.pageSlug || !item.pageDisplayMode || item.pageDisplayMode === "fullscreen") {
    return; // external URL or fullscreen — let the browser navigate
  }
  e.preventDefault();
  // Only fetch the full body now that the user committed to opening it.
  void fetchPublicContentPage(item.pageSlug).then((page) => {
    if (!page) { window.location.href = `/${item.pageSlug}`; return; }
    overlay.open(page);
    window.history.pushState({}, "", `/${page.slug}`);
  });
}
```

`fetchPublicContentPage` already exists in `apps/frontend/src/api/client.ts:125` — reuse it. If there's no client-side wrapper (this is an SSR helper), inline a `fetch(\`/api/v1/content/${slug}\`)` with the same shape. Correct public path is `/api/v1/content/:slug` (per `ROUTE_TEMPLATES.v1.contentDetail`), NOT `/api/public/pages/:slug`.

- [x] **Step 18.4: popstate**

Listen for `popstate` in `OverlayProvider` — on back-navigation to a URL with no overlay, call `close()`. Only install the listener when an overlay is actually open.

- [x] **Step 18.5: Commit**

```bash
git add apps/frontend/src/components/layout apps/frontend/src/context
git commit -m "Feat: nav clicks open overlay pages client-side (with deep-link support)"
```

Check off Task 18.

---

## Task 19: Segmented-page rendering inside overlay/fullscreen

**Files:**
- Modify: `apps/frontend/src/components/layout/PageOverlayIsland.tsx`
- Create: `apps/frontend/src/components/layout/SegmentedPageFullscreenIsland.tsx`

- [x] **Step 19.1: Common renderer**

Render markdown HTML using the same React pattern `InfoPanel` uses today (the existing `dangerouslySetInnerHTML` call, lines 125-126 of `InfoPanel.tsx`). Input is pre-rendered server-side by the sanitising markdown renderer — do NOT wrap it in another sanitiser.

Extract a `SegmentedBody` component:

```tsx
function SegmentedBody({ page }: { page: PublicContentPage }) {
  const [active, setActive] = useState(page.segments[0]?.targetSlug ?? "");
  const current = page.segments.find((s) => s.targetSlug === active);
  // Render current.contentHtml via the same React html-injection pattern
  // already used in InfoPanel.tsx line 125-126 (server-sanitised markdown).
  return (/* ... */);
}
```

- [x] **Step 19.2: TranslucentOverlayContent**

Wire a `TranslucentCard` with header, segmented control (when `pageType === "segmented"`), and body. Body renders `current?.contentHtml` for segmented pages or `page.contentHtml` for default pages — both via the same React html-injection pattern used in `InfoPanel.tsx`.

```tsx
function TranslucentOverlayContent({ page, onClose }: { page: PublicContentPage; onClose: () => void }) {
  const [active, setActive] = useState(page.segments[0]?.targetSlug ?? "");
  const current = page.segments.find((s) => s.targetSlug === active) ?? null;
  const html = page.pageType === "segmented" ? (current?.contentHtml ?? "") : page.contentHtml;

  return (
    <TranslucentCard className="h-full">
      <TranslucentCard.Header className="flex items-start justify-between">
        <h2 className="text-xl font-semibold tracking-[-0.01em] text-white">
          {current?.showTitle === false ? null : (current?.title ?? page.title)}
        </h2>
        <button onClick={onClose} aria-label="Close" className="p-1.5 text-white/30 hover:text-white/70">
          <XIcon size={16} weight="duotone" />
        </button>
      </TranslucentCard.Header>
      {page.pageType === "segmented" && page.segments.length > 0 && (
        <TranslucentCard.SegmentedControl
          segments={page.segments.map((s) => ({ key: s.targetSlug, label: s.label }))}
          value={active}
          onChange={setActive}
        />
      )}
      <TranslucentCard.Body>
        <MarkdownHtml html={html} />
      </TranslucentCard.Body>
    </TranslucentCard>
  );
}

// Thin wrapper that performs the html injection — see InfoPanel.tsx lines 125-126
// for the existing identical call site. Single place to revisit if the project
// ever adds client-side sanitisation.
function MarkdownHtml({ html }: { html: string }) {
  return <article className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [x] **Step 19.3: EmbossedOverlayContent**

Same shape but `EmbossedCard` + `EmbossedCard.SegmentedControl`. Reuse the close button pattern from `EmbedModal`.

- [x] **Step 19.4: SegmentedPageFullscreenIsland**

For fullscreen segmented pages: render an `EmbossedCard` that fills the viewport's main column, with `EmbossedCard.SegmentedControl` between header and body. The container inside `[shortId].astro` already gives it width.

- [x] **Step 19.5: Manual smoke test**

```bash
npm run dev
```

Visit in order:
1. `/imprint` (default, fullscreen) — renders as before.
2. Create a Default page with `displayMode=embossed`, `overlayWidth=regular`, `overlayHeight=regular`. Click its nav link — EmbossedCard overlay appears.
3. Switch the same page to `displayMode=translucent`. Reload — TranslucentCard overlay appears.
4. Create a Segmented page pointing at two existing Default pages. For each `displayMode`, confirm segment switching swaps content in-place.

Document any visual polish follow-ups in `.claude/architecture/system-architecture.md` → "Known gaps".

- [x] **Step 19.6: Commit**

```bash
git add apps/frontend/src/components/layout
git commit -m "Feat: segmented-page rendering in overlay + fullscreen shells"
```

Check off Task 19.

---

## Task 20: E2E smoke + architecture doc update

**Files:**
- Modify: `.claude/architecture/system-architecture.md`
- Optional: `apps/frontend/src/e2e/` plans used by `ui-test` skill

- [x] **Step 20.1: Run full pre-push checks** (per `feedback_pre_push_checks.md`)

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Expected: all green.

- [x] **Step 20.2: Chrome-DevTools MCP smoke pass**

Run `/ui-test` for the frontend smoke plan. Record any regression.

- [x] **Step 20.3: Document**

Update `.claude/architecture/system-architecture.md` with a new "Content pages" subsection summarising:
- The `pageType` / `displayMode` / `overlayWidth` / `overlayHeight` matrix
- Nav-click client-side fetch flow + deep-link behaviour
- Segment validation rules (target must be default, no self-reference, unpublished targets filtered)

- [x] **Step 20.4: Commit**

```bash
git add .claude/architecture/system-architecture.md
git commit -m "Docs: architecture notes for page display modes + segments"
```

Check off Task 20.

---

## Completion workflow

When Task 20 is checked off:

1. Move this file to `.claude/plans/done/`: `git mv .claude/plans/open/2026-04-19-page-display-modes-and-segmented-pages.md .claude/plans/done/2026-04-19-page-display-modes-and-segmented-pages.md`
2. Append a `## Completed` section here with the final commit list.
3. Update `WHATS-NEXT.md`.
4. Archive any OpenSpec change if one was created for this effort.

---

## Completed 2026-04-19

Implemented autonomously overnight. 16 commits on branch `feat/page-display-modes`:

1. `b989284` Schema + migration 0013
2. `777c47e` Shared types + admin service hydration
3. `a297b08` Segment service + unit tests (8 passing)
4. `17309ea` Admin API routes + isOneOf validation
5. `41916a1` OpenAPI schemas (PublicPageSegmentSchema, extended contentPage + summary + NavItem)
6. `ccfe040` Dashboard hooks adopt shared types
7. `07f1466` PagesListPage + i18n
8. `5b523a3` PageDisplaySettings + SegmentManager + editor integration
9. `b63bbcb` TranslucentCard compound
10. `f0e2d63` InfoPanel refactor + real TranslucentCard.SegmentedControl
11. `8585326` EmbossedCard.SegmentedControl slot
12. `90c34f4` PageOverlay size-token mapper
13. `a11288e` OverlayProvider + PageOverlayIsland + renderers
14. `351deb4` [shortId].astro branches
15. `814e34e` Nav click interception + browser content proxy
16. `e7aa4cb` Biome auto-format + useExhaustiveDependencies annotation

Validation at the feature-branch tip:

- Biome (`npm run lint`): clean.
- Backend `tsc --noEmit`: clean.
- Dashboard `tsc --noEmit`: clean.
- Frontend `astro check`: 0 errors / 0 warnings / 4 unrelated hints (pre-existing phosphor-icons deprecations).
- Backend `vitest run`: **683 / 683 passing** (includes the 8 new admin-segments tests).
- Full monorepo `npm run build`: clean.

Not run (user asleep): `/ui-test` Chrome MCP smoke pass. Flagged as follow-up.

Architecture doc updated at `.claude/architecture/system-architecture.md`.
