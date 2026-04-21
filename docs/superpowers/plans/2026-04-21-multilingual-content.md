# Multilingual Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editors can author `content_pages`, `page_segments`, and `nav_items` in `en` (default) and `de`, with stale-translation markers, per-locale readiness flags, and public resolution that falls back to the default locale.

**Architecture:** Per-entity translation tables (`content_page_translations`, `page_segment_translations`, `nav_item_translations`) sit alongside unchanged parent tables. The parent row always holds the default-locale (`en`) value and acts as fallback. Admin APIs expose CRUD per translation; public APIs take a `?locale=` param and `COALESCE` the translated value over the parent value. Dashboard grows language tabs per page plus per-row expandables for segments/nav.

**Tech Stack:** Postgres + Drizzle (schema), Fastify (backend), Astro (frontend), React + React Query (dashboard), Vitest (tests). All new TypeScript code follows the existing repo style; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-21-multilingual-content-design.md`

**Working directory for all commands:** `App/` (monorepo root containing `apps/` and `packages/`).

**Git discipline:** the user wants to approve every commit individually. When executing this plan, pause at each commit step and wait for approval. Commit messages follow the repo convention `Feat: …` / `Fix: …` / `Refactor: …` / `Chore: …` (see recent history). No `Co-Authored-By` trailer.

---

## File Structure

### Created

| Path | Responsibility |
| --- | --- |
| `packages/shared/src/locales.ts` | `LOCALES`, `Locale`, `DEFAULT_LOCALE` exported as single source of truth |
| `apps/backend/src/db/migrations/postgres/0018_i18n_content.sql` | Schema migration: translation tables + `*_updated_at` columns + data seeding |
| `apps/backend/src/services/admin-translations.ts` | Service layer for page translations CRUD + stale computation |
| `apps/backend/src/routes/admin-page-translations.ts` | Admin endpoints for page translations |
| `apps/backend/src/__tests__/admin-translations.test.ts` | Service-level tests for page translations |
| `apps/backend/src/__tests__/admin-nav-translations.test.ts` | Service-level tests for nav translations |
| `apps/backend/src/__tests__/public-content-locale.test.ts` | Public resolver locale fallback tests |
| `apps/dashboard/src/features/content/pages/LanguageTabs.tsx` | Reusable language tab strip with badge states |
| `apps/dashboard/src/features/content/pages/usePageTranslations.ts` | React Query hooks for page translation CRUD |

### Modified

| Path | What changes |
| --- | --- |
| `packages/shared/src/content.ts` | Add `TranslationStatus`, `PageTranslation`; extend `PageSegment`, `NavItem`, `ContentPage`, `ContentPageSummary` |
| `packages/shared/src/endpoints.ts` | Add admin page-translation endpoint paths + document `?locale=` param on public endpoints |
| `packages/shared/src/index.ts` | Re-export `locales.ts` |
| `apps/backend/src/db/schemas/postgres.ts` | Add `contentPageTranslations`, `pageSegmentTranslations`, `navItemTranslations` tables + `*_updated_at` columns on parents |
| `apps/backend/src/db/admin-repository.ts` | Row types + method signatures for translation CRUD + stale flag hydration |
| `apps/backend/src/db/adapters/postgres.ts` | Implementations of the new repository methods |
| `apps/backend/src/services/admin-content.ts` | Touch `content_updated_at` iff title/content changed; include translations + status in response |
| `apps/backend/src/services/admin-segments.ts` | Accept per-segment `translations` map; persist via repo after bulk replace |
| `apps/backend/src/services/admin-nav.ts` | Accept per-item `translations`; persist with same bulk semantics |
| `apps/backend/src/services/public-content.ts` (existing resolver, locate during Task 9) | Locale-aware resolution, `COALESCE` fallback |
| `apps/backend/src/routes/admin-content.ts` | Wire `admin-page-translations` sub-router |
| `apps/backend/src/routes/admin-nav.ts` | Accept translations in PUT body, forward to service |
| `apps/backend/src/routes/resolve-public-get.ts` + `public-content-nav.ts` | Read `locale` from query / cookie / `Accept-Language`, pass through |
| `apps/frontend/src/i18n/locales.ts` | `LOCALES = ["en","de"]`, `LOCALE_META` trimmed, imports from `@musiccloud/shared` |
| `apps/frontend/src/api/client.ts` | `fetchPublicContentPage(slug, locale)` + nav fetch with `?locale=` |
| `apps/frontend/src/pages/[shortId].astro` + other Astro pages that fetch content/nav | Pass resolved locale into API client |
| `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` | Mount `LanguageTabs`; manage per-tab form state; stale + dirty badges |
| `apps/dashboard/src/features/content/pages/SegmentManager.tsx` | Per-row translation expandable |
| `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx` | Per-row translation expandable |
| `apps/dashboard/src/features/content/pages/PagesListPage.tsx` | `translationStatus` column |

### Deleted

| Path | Why |
| --- | --- |
| `apps/frontend/src/i18n/translations/cs.json` | Locale removed from supported set |
| `apps/frontend/src/i18n/translations/es.json` | idem |
| `apps/frontend/src/i18n/translations/fr.json` | idem |
| `apps/frontend/src/i18n/translations/it.json` | idem |
| `apps/frontend/src/i18n/translations/nl.json` | idem |
| `apps/frontend/src/i18n/translations/pt.json` | idem |
| `apps/frontend/src/i18n/translations/tr.json` | idem |

---

## Task 1: Shared locales module

**Files:**
- Create: `packages/shared/src/locales.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/__tests__/locales.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/locales.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "../locales.js";

describe("locales", () => {
  it("exposes exactly en and de", () => {
    expect(LOCALES).toEqual(["en", "de"]);
  });

  it("en is the default", () => {
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("isLocale narrows to Locale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/shared test -- locales`
Expected: FAIL with `Cannot find module '../locales.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/shared/src/locales.ts`:

```ts
/** Locales supported across backend, dashboard, and frontend.
 * The array order is the canonical UI order (default-locale first). */
export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
```

Modify `packages/shared/src/index.ts` to add:

```ts
export * from "./locales.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/shared test -- locales`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/locales.ts packages/shared/src/index.ts packages/shared/src/__tests__/locales.test.ts
git commit -m "Feat: add shared Locale module with en/de and DEFAULT_LOCALE"
```

---

## Task 2: Extend shared content types

**Files:**
- Modify: `packages/shared/src/content.ts`
- Modify: `packages/shared/src/endpoints.ts`
- Test: `packages/shared/src/__tests__/content-types.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/__tests__/content-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type {
  ContentPage,
  NavItem,
  PageSegment,
  PageTranslation,
  TranslationStatus,
} from "../content.js";

describe("content translation types", () => {
  it("PageTranslation shape compiles with required fields", () => {
    const t: PageTranslation = {
      locale: "de",
      title: "Titel",
      content: "# Inhalt",
      translationReady: true,
      isStale: false,
      sourceUpdatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(t.locale).toBe("de");
  });

  it("PageSegment carries translations map", () => {
    const s: PageSegment = {
      id: 1,
      position: 0,
      label: "Overview",
      targetSlug: "about",
      translations: { de: "Übersicht" },
    };
    expect(s.translations?.de).toBe("Übersicht");
  });

  it("NavItem carries translations map", () => {
    const n: NavItem = {
      id: 1,
      navId: "header",
      pageSlug: null,
      pageTitle: null,
      url: "/x",
      target: "_self",
      label: "Home",
      position: 0,
      pageType: null,
      pageDisplayMode: null,
      pageOverlayWidth: null,
      translations: { de: "Start" },
    };
    expect(n.translations?.de).toBe("Start");
  });

  it("ContentPage exposes translations + status", () => {
    const statuses: Record<string, TranslationStatus> = { en: "ready", de: "draft" };
    const p: ContentPage = {
      slug: "about",
      title: "About",
      status: "published",
      showTitle: true,
      titleAlignment: "left",
      pageType: "default",
      displayMode: "fullscreen",
      overlayWidth: "regular",
      createdByUsername: null,
      updatedByUsername: null,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      translationStatus: statuses as ContentPage["translationStatus"],
      content: "",
      segments: [],
      translations: [],
    };
    expect(p.translations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/shared test -- content-types`
Expected: FAIL with type errors (missing `PageTranslation`, missing `translations` on `PageSegment`/`NavItem`, missing `translationStatus` on `ContentPageSummary`).

- [ ] **Step 3: Write minimal implementation**

Modify `packages/shared/src/content.ts`. Add at the top near other type imports:

```ts
import type { Locale } from "./locales.js";
```

Add new types (after existing scalar type aliases):

```ts
export type TranslationStatus = "missing" | "draft" | "stale" | "ready";

export interface PageTranslation {
  locale: Locale;
  title: string;
  content: string;
  translationReady: boolean;
  isStale: boolean;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}
```

Modify `PageSegment`, `PageSegmentInput`, `NavItem`, `ContentPageSummary`, and `ContentPage` to add the following **additional** fields (keep all existing fields):

```ts
// PageSegment — add:
translations?: Partial<Record<Locale, string>>;

// PageSegmentInput — add (so dashboard can submit translations in bulk replace):
translations?: Partial<Record<Locale, string>>;

// NavItem — add:
translations?: Partial<Record<Locale, string>>;

// NavItemInput — add:
translations?: Partial<Record<Locale, string>>;

// ContentPageSummary — add:
translationStatus: Record<Locale, TranslationStatus>;

// ContentPage — add (alongside the existing `content` and `segments`):
translations: PageTranslation[];
```

Modify `packages/shared/src/endpoints.ts` to add entries under `admin.pages` (keep existing entries):

```ts
translations: {
  list: (slug: string) => `/api/admin/pages/${slug}/translations`,
  detail: (slug: string, locale: string) =>
    `/api/admin/pages/${slug}/translations/${locale}`,
},
```

And under `ROUTE_TEMPLATES.admin.pages` add:

```ts
translationsList: "/api/admin/pages/:slug/translations",
translationsDetail: "/api/admin/pages/:slug/translations/:locale",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/shared test -- content-types`
Expected: PASS (4 tests).

Run: `npm run -w @musiccloud/shared typecheck` (or `tsc -b` on the shared package)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/content.ts packages/shared/src/endpoints.ts packages/shared/src/__tests__/content-types.test.ts
git commit -m "Feat: extend shared content types with translations"
```

---

## Task 3: Database schema + migration

**Files:**
- Modify: `apps/backend/src/db/schemas/postgres.ts`
- Create: `apps/backend/src/db/migrations/postgres/0018_i18n_content.sql`

- [ ] **Step 1: Extend Drizzle schema**

Append to `apps/backend/src/db/schemas/postgres.ts` before the final export region:

```ts
// Per-locale translations of a content page. Parent row in `content_pages`
// holds the default-locale (en) source of truth + fallback. Missing or
// `translation_ready=false` rows trigger fallback at render time.
export const contentPageTranslations = pgTable(
  "content_page_translations",
  {
    slug: text("slug")
      .notNull()
      .references(() => contentPages.slug, { onDelete: "cascade", onUpdate: "cascade" }),
    locale: text("locale").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    translationReady: boolean("translation_ready").notNull().default(false),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text("updated_by").references(() => adminUsers.id, { onDelete: "set null" }),
  },
  (table) => [
    uniqueIndex("pk_content_page_translations").on(table.slug, table.locale),
  ],
);

export type ContentPageTranslationRow = typeof contentPageTranslations.$inferSelect;
export type ContentPageTranslationInsert = typeof contentPageTranslations.$inferInsert;

// Per-locale translation of a page segment's tab label.
export const pageSegmentTranslations = pgTable(
  "page_segment_translations",
  {
    segmentId: integer("segment_id")
      .notNull()
      .references(() => pageSegments.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pk_page_segment_translations").on(table.segmentId, table.locale),
  ],
);

export type PageSegmentTranslationRow = typeof pageSegmentTranslations.$inferSelect;
export type PageSegmentTranslationInsert = typeof pageSegmentTranslations.$inferInsert;

// Per-locale translation of a navigation item's custom label.
export const navItemTranslations = pgTable(
  "nav_item_translations",
  {
    navItemId: integer("nav_item_id")
      .notNull()
      .references(() => navItems.id, { onDelete: "cascade" }),
    locale: text("locale").notNull(),
    label: text("label").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("pk_nav_item_translations").on(table.navItemId, table.locale),
  ],
);

export type NavItemTranslationRow = typeof navItemTranslations.$inferSelect;
export type NavItemTranslationInsert = typeof navItemTranslations.$inferInsert;
```

Add a `contentUpdatedAt` column to the existing `contentPages` table definition (inside the existing `pgTable("content_pages", { … })` block), placed immediately after `updatedAt`:

```ts
contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
```

Add `labelUpdatedAt` to `pageSegments`:

```ts
labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
```

Add `labelUpdatedAt` to `navItems`:

```ts
labelUpdatedAt: timestamp("label_updated_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/backend/src/db/migrations/postgres/0018_i18n_content.sql`:

```sql
-- 0018_i18n_content.sql
-- Adds per-locale translation tables and source-timestamp columns for stale
-- detection. Seeds existing rows as `en` + translation_ready=true so the
-- site keeps behaving identically after migration.

ALTER TABLE content_pages
  ADD COLUMN content_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE page_segments
  ADD COLUMN label_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE nav_items
  ADD COLUMN label_updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE content_page_translations (
  slug              text        NOT NULL REFERENCES content_pages(slug)
                                ON DELETE CASCADE ON UPDATE CASCADE,
  locale            text        NOT NULL,
  title             text        NOT NULL,
  content           text        NOT NULL DEFAULT '',
  translation_ready boolean     NOT NULL DEFAULT false,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text        REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT pk_content_page_translations PRIMARY KEY (slug, locale)
);

CREATE TABLE page_segment_translations (
  segment_id        integer     NOT NULL REFERENCES page_segments(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_page_segment_translations PRIMARY KEY (segment_id, locale)
);

CREATE TABLE nav_item_translations (
  nav_item_id       integer     NOT NULL REFERENCES nav_items(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_nav_item_translations PRIMARY KEY (nav_item_id, locale)
);

-- Seed default-locale rows from existing content. Marked ready so public
-- site keeps serving them. Operators must review and re-tag to `de` where
-- the existing content is German.
INSERT INTO content_page_translations (slug, locale, title, content, translation_ready, source_updated_at, updated_at)
SELECT slug, 'en', title, content, true, content_updated_at, now() FROM content_pages;

INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now() FROM page_segments;

INSERT INTO nav_item_translations (nav_item_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now() FROM nav_items WHERE label IS NOT NULL;
```

- [ ] **Step 3: Run drizzle-kit to snapshot the new schema**

Drizzle keeps a `meta/_journal.json` + snapshot per migration. Since the SQL is hand-written, sync the meta by running:

Run: `npm run -w @musiccloud/backend db:generate -- --name i18n_content` (or whatever script the project uses)

Open `apps/backend/src/db/migrations/postgres/0018_i18n_content.sql` as produced by drizzle-kit; if it differs, replace its body with the SQL above. Keep the journal entry so Drizzle records the migration ran.

Expected: journal updated; snapshot file added under `meta/`.

- [ ] **Step 4: Dry-run the migration against a scratch DB**

Run: `npm run -w @musiccloud/backend db:migrate`
Expected: no errors. Then verify tables exist: `psql $DATABASE_URL -c '\dt content_page_translations page_segment_translations nav_item_translations'`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/schemas/postgres.ts apps/backend/src/db/migrations/postgres/0018_i18n_content.sql apps/backend/src/db/migrations/postgres/meta/
git commit -m "Feat: add translation tables and source-timestamp columns"
```

---

## Task 4: Repository — page translations

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts`
- Modify: `apps/backend/src/db/adapters/postgres.ts`
- Test: `apps/backend/src/__tests__/page-translations-repo.test.ts`

- [ ] **Step 1: Extend repository interface**

Append to `apps/backend/src/db/admin-repository.ts` (near the existing content page interfaces):

```ts
export interface ContentPageTranslationRow {
  slug: string;
  locale: string;
  title: string;
  content: string;
  translationReady: boolean;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PageSegmentTranslationRow {
  segmentId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

export interface NavItemTranslationRow {
  navItemId: number;
  locale: string;
  label: string;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
}

export interface ContentPageTranslationUpsert {
  slug: string;
  locale: string;
  title: string;
  content: string;
  translationReady: boolean;
  sourceUpdatedAt: Date | null;
  updatedBy: string | null;
}
```

Add methods to the `AdminRepository` interface:

```ts
// Page translations
listPageTranslations(slug: string): Promise<ContentPageTranslationRow[]>;
getPageTranslation(slug: string, locale: string): Promise<ContentPageTranslationRow | null>;
upsertPageTranslation(input: ContentPageTranslationUpsert): Promise<ContentPageTranslationRow>;
deletePageTranslation(slug: string, locale: string): Promise<boolean>;

// Segment translations (bulk replacement mirrors segments bulk-replace)
listSegmentTranslationsForOwner(ownerSlug: string): Promise<PageSegmentTranslationRow[]>;
replaceSegmentTranslations(
  segmentId: number,
  translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
): Promise<void>;

// Nav translations
listNavTranslations(navId: string): Promise<NavItemTranslationRow[]>;
replaceNavItemTranslations(
  navItemId: number,
  translations: { locale: string; label: string; sourceUpdatedAt: Date | null }[],
): Promise<void>;

// Touch content_updated_at atomically when saving title/content
setContentPageContentUpdatedAt(slug: string, when: Date): Promise<void>;
```

Add a field to the existing `ContentPageRow` interface:

```ts
contentUpdatedAt: Date;
```

And to the existing `PageSegmentRow`:

```ts
labelUpdatedAt: Date;
```

And to the existing nav row type (find the interface used in `listNavItems`, add):

```ts
labelUpdatedAt: Date;
```

- [ ] **Step 2: Write failing test**

Create `apps/backend/src/__tests__/page-translations-repo.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAdminRepository } from "../db/index.js";

describe("page translations repository", () => {
  const slug = "tt-about";

  beforeAll(async () => {
    const repo = await getAdminRepository();
    await repo.createContentPage({
      slug, title: "About", status: "draft",
      pageType: "default", createdBy: null,
    });
  });

  afterAll(async () => {
    const repo = await getAdminRepository();
    await repo.deleteContentPage(slug);
  });

  beforeEach(async () => {
    const repo = await getAdminRepository();
    // cleanup translations between tests
    await repo.deletePageTranslation(slug, "de");
  });

  it("upsert inserts then updates", async () => {
    const repo = await getAdminRepository();
    const now = new Date();
    const inserted = await repo.upsertPageTranslation({
      slug, locale: "de", title: "Über uns", content: "Hallo",
      translationReady: false, sourceUpdatedAt: now, updatedBy: null,
    });
    expect(inserted.title).toBe("Über uns");

    const updated = await repo.upsertPageTranslation({
      slug, locale: "de", title: "Über uns 2", content: "Hallo2",
      translationReady: true, sourceUpdatedAt: now, updatedBy: null,
    });
    expect(updated.title).toBe("Über uns 2");
    expect(updated.translationReady).toBe(true);
  });

  it("list returns all locales for slug", async () => {
    const repo = await getAdminRepository();
    await repo.upsertPageTranslation({
      slug, locale: "de", title: "x", content: "", translationReady: false,
      sourceUpdatedAt: null, updatedBy: null,
    });
    const rows = await repo.listPageTranslations(slug);
    expect(rows.map((r) => r.locale)).toContain("de");
  });

  it("delete returns true only when row existed", async () => {
    const repo = await getAdminRepository();
    await repo.upsertPageTranslation({
      slug, locale: "de", title: "x", content: "", translationReady: false,
      sourceUpdatedAt: null, updatedBy: null,
    });
    expect(await repo.deletePageTranslation(slug, "de")).toBe(true);
    expect(await repo.deletePageTranslation(slug, "de")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- page-translations-repo`
Expected: FAIL — methods not implemented in adapter.

- [ ] **Step 4: Implement in postgres adapter**

In `apps/backend/src/db/adapters/postgres.ts`, add imports at the top of the file (next to existing schema imports):

```ts
import {
  contentPageTranslations,
  pageSegmentTranslations,
  navItemTranslations,
} from "../schemas/postgres.js";
```

Add these methods on the repository implementation (end of the class / object):

```ts
async listPageTranslations(slug) {
  const rows = await db.select().from(contentPageTranslations).where(eq(contentPageTranslations.slug, slug));
  return rows.map(translationRowToDto);
},

async getPageTranslation(slug, locale) {
  const [row] = await db.select().from(contentPageTranslations)
    .where(and(eq(contentPageTranslations.slug, slug), eq(contentPageTranslations.locale, locale)))
    .limit(1);
  return row ? translationRowToDto(row) : null;
},

async upsertPageTranslation(input) {
  const now = new Date();
  const [row] = await db.insert(contentPageTranslations).values({
    slug: input.slug,
    locale: input.locale,
    title: input.title,
    content: input.content,
    translationReady: input.translationReady,
    sourceUpdatedAt: input.sourceUpdatedAt,
    updatedAt: now,
    updatedBy: input.updatedBy,
  }).onConflictDoUpdate({
    target: [contentPageTranslations.slug, contentPageTranslations.locale],
    set: {
      title: input.title,
      content: input.content,
      translationReady: input.translationReady,
      sourceUpdatedAt: input.sourceUpdatedAt,
      updatedAt: now,
      updatedBy: input.updatedBy,
    },
  }).returning();
  return translationRowToDto(row);
},

async deletePageTranslation(slug, locale) {
  const res = await db.delete(contentPageTranslations)
    .where(and(eq(contentPageTranslations.slug, slug), eq(contentPageTranslations.locale, locale)))
    .returning({ slug: contentPageTranslations.slug });
  return res.length > 0;
},

async setContentPageContentUpdatedAt(slug, when) {
  await db.update(contentPages)
    .set({ contentUpdatedAt: when, updatedAt: when })
    .where(eq(contentPages.slug, slug));
},
```

Add the helper `translationRowToDto` near other row mapper helpers in the file:

```ts
function translationRowToDto(row: typeof contentPageTranslations.$inferSelect): ContentPageTranslationRow {
  return {
    slug: row.slug,
    locale: row.locale,
    title: row.title,
    content: row.content,
    translationReady: row.translationReady,
    sourceUpdatedAt: row.sourceUpdatedAt,
    updatedAt: row.updatedAt,
    updatedBy: row.updatedBy,
  };
}
```

Also extend the existing `contentPageRowToDto` helper to include `contentUpdatedAt` from the row and map it to the `ContentPageRow` interface field.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- page-translations-repo`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/db/adapters/postgres.ts apps/backend/src/__tests__/page-translations-repo.test.ts
git commit -m "Feat: page translation repository CRUD"
```

---

## Task 5: Repository — segment + nav translations

**Files:**
- Modify: `apps/backend/src/db/admin-repository.ts`
- Modify: `apps/backend/src/db/adapters/postgres.ts`
- Test: `apps/backend/src/__tests__/segment-nav-translations-repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/__tests__/segment-nav-translations-repo.test.ts`:

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAdminRepository } from "../db/index.js";

describe("segment and nav translation repos", () => {
  const owner = "tt-owner";
  const child = "tt-child";
  let segmentId = 0;

  beforeAll(async () => {
    const repo = await getAdminRepository();
    await repo.createContentPage({ slug: child, title: "Child", status: "published", pageType: "default", createdBy: null });
    await repo.createContentPage({ slug: owner, title: "Owner", status: "published", pageType: "segmented", createdBy: null });
    const rows = await repo.replaceSegmentsForOwner(owner, [{ position: 0, label: "Child", targetSlug: child }]);
    segmentId = rows[0]!.id;
  });

  afterAll(async () => {
    const repo = await getAdminRepository();
    await repo.deleteContentPage(owner);
    await repo.deleteContentPage(child);
  });

  beforeEach(async () => {
    const repo = await getAdminRepository();
    await repo.replaceSegmentTranslations(segmentId, []);
  });

  it("replaceSegmentTranslations replaces entire set", async () => {
    const repo = await getAdminRepository();
    await repo.replaceSegmentTranslations(segmentId, [
      { locale: "de", label: "Kind", sourceUpdatedAt: new Date() },
    ]);
    const after = await repo.listSegmentTranslationsForOwner(owner);
    expect(after.map((r) => r.locale)).toEqual(["de"]);
    expect(after[0]!.label).toBe("Kind");

    // Replace with empty → row removed
    await repo.replaceSegmentTranslations(segmentId, []);
    expect(await repo.listSegmentTranslationsForOwner(owner)).toEqual([]);
  });

  it("replaceNavItemTranslations persists per-item/locale", async () => {
    const repo = await getAdminRepository();
    await repo.replaceNavItems("header", [
      { pageSlug: null, url: "/x", label: "Home", target: "_self" },
    ]);
    const nav = await repo.listNavItems("header");
    const navItemId = nav[0]!.id;
    await repo.replaceNavItemTranslations(navItemId, [
      { locale: "de", label: "Start", sourceUpdatedAt: new Date() },
    ]);
    const rows = await repo.listNavTranslations("header");
    expect(rows.find((r) => r.navItemId === navItemId)?.label).toBe("Start");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- segment-nav-translations-repo`
Expected: FAIL — methods not implemented.

- [ ] **Step 3: Implement in postgres adapter**

Add to `apps/backend/src/db/adapters/postgres.ts`:

```ts
async listSegmentTranslationsForOwner(ownerSlug) {
  const rows = await db
    .select({
      segmentId: pageSegmentTranslations.segmentId,
      locale: pageSegmentTranslations.locale,
      label: pageSegmentTranslations.label,
      sourceUpdatedAt: pageSegmentTranslations.sourceUpdatedAt,
      updatedAt: pageSegmentTranslations.updatedAt,
    })
    .from(pageSegmentTranslations)
    .innerJoin(pageSegments, eq(pageSegments.id, pageSegmentTranslations.segmentId))
    .where(eq(pageSegments.ownerSlug, ownerSlug));
  return rows;
},

async replaceSegmentTranslations(segmentId, translations) {
  await db.transaction(async (tx) => {
    await tx.delete(pageSegmentTranslations).where(eq(pageSegmentTranslations.segmentId, segmentId));
    if (translations.length > 0) {
      await tx.insert(pageSegmentTranslations).values(
        translations.map((t) => ({
          segmentId,
          locale: t.locale,
          label: t.label,
          sourceUpdatedAt: t.sourceUpdatedAt,
          updatedAt: new Date(),
        })),
      );
    }
  });
},

async listNavTranslations(navId) {
  return db
    .select({
      navItemId: navItemTranslations.navItemId,
      locale: navItemTranslations.locale,
      label: navItemTranslations.label,
      sourceUpdatedAt: navItemTranslations.sourceUpdatedAt,
      updatedAt: navItemTranslations.updatedAt,
    })
    .from(navItemTranslations)
    .innerJoin(navItems, eq(navItems.id, navItemTranslations.navItemId))
    .where(eq(navItems.navId, navId));
},

async replaceNavItemTranslations(navItemId, translations) {
  await db.transaction(async (tx) => {
    await tx.delete(navItemTranslations).where(eq(navItemTranslations.navItemId, navItemId));
    if (translations.length > 0) {
      await tx.insert(navItemTranslations).values(
        translations.map((t) => ({
          navItemId,
          locale: t.locale,
          label: t.label,
          sourceUpdatedAt: t.sourceUpdatedAt,
          updatedAt: new Date(),
        })),
      );
    }
  });
},
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- segment-nav-translations-repo`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/db/admin-repository.ts apps/backend/src/db/adapters/postgres.ts apps/backend/src/__tests__/segment-nav-translations-repo.test.ts
git commit -m "Feat: segment and nav translation repository methods"
```

---

## Task 6: Admin page translations service + status computation

**Files:**
- Create: `apps/backend/src/services/admin-translations.ts`
- Modify: `apps/backend/src/services/admin-content.ts`
- Create: `apps/backend/src/__tests__/admin-translations.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/__tests__/admin-translations.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminRepository,
  ContentPageRow,
  ContentPageTranslationRow,
} from "../db/admin-repository.js";
import {
  getPageTranslationsWithStatus,
  upsertPageTranslation,
} from "../services/admin-translations.js";

let page: ContentPageRow | null = null;
let translations: ContentPageTranslationRow[] = [];

const repo: Partial<AdminRepository> = {
  async getContentPageBySlug() { return page; },
  async listPageTranslations() { return translations; },
  async upsertPageTranslation(input) {
    const row: ContentPageTranslationRow = {
      slug: input.slug,
      locale: input.locale,
      title: input.title,
      content: input.content,
      translationReady: input.translationReady,
      sourceUpdatedAt: input.sourceUpdatedAt,
      updatedAt: new Date(),
      updatedBy: input.updatedBy,
    };
    translations = [...translations.filter((t) => t.locale !== input.locale), row];
    return row;
  },
  async setContentPageContentUpdatedAt() {},
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => repo }));

function mkPage(contentUpdatedAt: Date): ContentPageRow {
  return {
    slug: "s", title: "T", content: "", status: "published",
    showTitle: true, titleAlignment: "left", pageType: "default",
    displayMode: "fullscreen", overlayWidth: "regular",
    createdBy: null, updatedBy: null,
    createdAt: new Date(), updatedAt: null,
    contentUpdatedAt,
  };
}

describe("admin translations service", () => {
  beforeEach(() => { translations = []; });

  it("status is 'missing' when no translation row", async () => {
    page = mkPage(new Date());
    const status = await getPageTranslationsWithStatus("s");
    expect(status.statuses.de).toBe("missing");
    expect(status.statuses.en).toBe("ready"); // source is always 'ready'
  });

  it("status is 'draft' when translation_ready=false", async () => {
    page = mkPage(new Date("2025-01-01"));
    translations = [{
      slug: "s", locale: "de", title: "x", content: "",
      translationReady: false,
      sourceUpdatedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-02"), updatedBy: null,
    }];
    const status = await getPageTranslationsWithStatus("s");
    expect(status.statuses.de).toBe("draft");
  });

  it("status is 'stale' when source newer than snapshot", async () => {
    page = mkPage(new Date("2025-02-01"));
    translations = [{
      slug: "s", locale: "de", title: "x", content: "",
      translationReady: true,
      sourceUpdatedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-02"), updatedBy: null,
    }];
    const status = await getPageTranslationsWithStatus("s");
    expect(status.statuses.de).toBe("stale");
  });

  it("status is 'ready' when up-to-date and ready", async () => {
    page = mkPage(new Date("2025-01-01"));
    translations = [{
      slug: "s", locale: "de", title: "x", content: "",
      translationReady: true,
      sourceUpdatedAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-02"), updatedBy: null,
    }];
    const status = await getPageTranslationsWithStatus("s");
    expect(status.statuses.de).toBe("ready");
  });

  it("upsert rejects when locale === default-locale", async () => {
    page = mkPage(new Date());
    const res = await upsertPageTranslation("s", "en", {
      title: "x", content: "", translationReady: false,
    }, null);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("INVALID_INPUT");
  });

  it("upsert snapshots parent.content_updated_at", async () => {
    const cu = new Date("2025-03-01");
    page = mkPage(cu);
    const res = await upsertPageTranslation("s", "de", {
      title: "x", content: "", translationReady: true,
    }, null);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.sourceUpdatedAt?.toISOString()).toBe(cu.toISOString());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- admin-translations`
Expected: FAIL — service file does not exist.

- [ ] **Step 3: Implement the service**

Create `apps/backend/src/services/admin-translations.ts`:

```ts
import type { Locale, TranslationStatus } from "@musiccloud/shared";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "@musiccloud/shared";
import type {
  ContentPageRow,
  ContentPageTranslationRow,
} from "../db/admin-repository.js";
import { getAdminRepository } from "../db/index.js";

export type TranslationResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "NOT_FOUND" | "INVALID_INPUT"; message: string };

export interface PageTranslationsWithStatus {
  translations: ContentPageTranslationRow[];
  statuses: Record<Locale, TranslationStatus>;
  page: ContentPageRow;
}

const TITLE_MAX_LEN = 200;
const CONTENT_MAX_LEN = 100_000;

function computeStatus(
  page: ContentPageRow,
  translation: ContentPageTranslationRow | undefined,
  locale: Locale,
): TranslationStatus {
  if (locale === DEFAULT_LOCALE) return "ready";
  if (!translation) return "missing";
  if (!translation.translationReady) return "draft";
  const src = translation.sourceUpdatedAt?.getTime() ?? 0;
  if (page.contentUpdatedAt.getTime() > src) return "stale";
  return "ready";
}

export async function getPageTranslationsWithStatus(
  slug: string,
): Promise<PageTranslationsWithStatus> {
  const repo = await getAdminRepository();
  const page = await repo.getContentPageBySlug(slug);
  if (!page) {
    throw new Error(`Content page not found: ${slug}`);
  }
  const translations = await repo.listPageTranslations(slug);
  const byLocale = new Map(translations.map((t) => [t.locale, t]));
  const statuses = Object.fromEntries(
    LOCALES.map((l) => [l, computeStatus(page, byLocale.get(l), l)]),
  ) as Record<Locale, TranslationStatus>;
  return { translations, statuses, page };
}

export async function upsertPageTranslation(
  slug: string,
  locale: string,
  body: { title: string; content: string; translationReady: boolean },
  updatedBy: string | null,
): Promise<TranslationResult<ContentPageTranslationRow>> {
  if (!isLocale(locale)) {
    return { ok: false, code: "INVALID_INPUT", message: `unknown locale: ${locale}` };
  }
  if (locale === DEFAULT_LOCALE) {
    return {
      ok: false,
      code: "INVALID_INPUT",
      message: "Default-locale content is edited via the main page endpoint, not as a translation",
    };
  }
  if (!body.title || body.title.length > TITLE_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: "title required (max 200 chars)" };
  }
  if (body.content.length > CONTENT_MAX_LEN) {
    return { ok: false, code: "INVALID_INPUT", message: `content max ${CONTENT_MAX_LEN} chars` };
  }

  const repo = await getAdminRepository();
  const page = await repo.getContentPageBySlug(slug);
  if (!page) {
    return { ok: false, code: "NOT_FOUND", message: "Content page not found" };
  }
  const row = await repo.upsertPageTranslation({
    slug,
    locale,
    title: body.title,
    content: body.content,
    translationReady: body.translationReady,
    sourceUpdatedAt: page.contentUpdatedAt,
    updatedBy,
  });
  return { ok: true, data: row };
}

export async function deletePageTranslation(
  slug: string,
  locale: string,
): Promise<TranslationResult<true>> {
  if (!isLocale(locale)) {
    return { ok: false, code: "INVALID_INPUT", message: `unknown locale: ${locale}` };
  }
  if (locale === DEFAULT_LOCALE) {
    return { ok: false, code: "INVALID_INPUT", message: "Cannot delete the default-locale source" };
  }
  const repo = await getAdminRepository();
  const removed = await repo.deletePageTranslation(slug, locale);
  if (!removed) return { ok: false, code: "NOT_FOUND", message: "Translation not found" };
  return { ok: true, data: true };
}
```

Modify `apps/backend/src/services/admin-content.ts`:

Update `updateManagedContentPageBody` so that whenever `title` or `content` changes, it calls `repo.setContentPageContentUpdatedAt(slug, now)` in the same transaction. The existing function already has access to the old row — compare `oldRow.title !== newTitle || oldRow.content !== newContent` and only bump `content_updated_at` in that case. The surrounding `updatedAt` bump stays as-is.

Also update the page DTO mapper (`rowToPage`) to call `getPageTranslationsWithStatus` and attach both `translations` (non-default locales only, mapped to `PageTranslation`) and `translationStatus` to the returned `ContentPage`. Default-locale content continues to live in `ContentPage.content` (pulled from `content_pages.content`).

```ts
// rowToPage extension (pseudocode)
const { translations, statuses } = await getPageTranslationsWithStatus(row.slug);
return {
  ...rowToSummary(row, usernames),
  content: row.content,
  segments,
  translations: translations
    .filter((t) => t.locale !== DEFAULT_LOCALE)
    .map((t) => ({
      locale: t.locale as Locale,
      title: t.title,
      content: t.content,
      translationReady: t.translationReady,
      isStale: statuses[t.locale as Locale] === "stale",
      sourceUpdatedAt: t.sourceUpdatedAt?.toISOString() ?? null,
      updatedAt: t.updatedAt.toISOString(),
    })),
  translationStatus: statuses,
};
```

And `rowToSummary` must now accept `statuses` and include `translationStatus` — pass statuses in from the list endpoint, which needs to batch-fetch them:

```ts
// Inside getManagedContentPages:
const allTranslations = await Promise.all(rows.map((r) => getPageTranslationsWithStatus(r.slug)));
// then pair each row with its statuses and pass into rowToSummary.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- admin-translations`
Expected: PASS (6 tests).

Also run: `npm run -w @musiccloud/backend typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/admin-translations.ts apps/backend/src/services/admin-content.ts apps/backend/src/__tests__/admin-translations.test.ts
git commit -m "Feat: admin page translation service with stale/ready status"
```

---

## Task 7: Admin page translation HTTP routes

**Files:**
- Create: `apps/backend/src/routes/admin-page-translations.ts`
- Modify: `apps/backend/src/routes/admin-content.ts`
- Test: `apps/backend/src/__tests__/admin-page-translations.route.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/__tests__/admin-page-translations.route.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerAdminPageTranslationRoutes } from "../routes/admin-page-translations.js";

vi.mock("../services/admin-translations.js", () => ({
  getPageTranslationsWithStatus: vi.fn(async (slug: string) => ({
    translations: [],
    statuses: { en: "ready", de: "missing" },
    page: { slug } as never,
  })),
  upsertPageTranslation: vi.fn(async () => ({
    ok: true,
    data: {
      slug: "s", locale: "de", title: "T", content: "",
      translationReady: true,
      sourceUpdatedAt: new Date(), updatedAt: new Date(), updatedBy: null,
    },
  })),
  deletePageTranslation: vi.fn(async () => ({ ok: true, data: true as const })),
}));

function buildApp() {
  const app = Fastify();
  app.addHook("preHandler", (req, _res, done) => {
    (req as unknown as { user: unknown }).user = { sub: "admin-1" };
    done();
  });
  registerAdminPageTranslationRoutes(app);
  return app;
}

describe("admin-page-translations routes", () => {
  it("GET /api/admin/pages/:slug/translations returns translations + statuses", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "GET", url: "/api/admin/pages/s/translations" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.statuses.de).toBe("missing");
  });

  it("PUT /api/admin/pages/:slug/translations/:locale returns 200 on ok", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/pages/s/translations/de",
      payload: { title: "T", content: "", translationReady: true },
    });
    expect(res.statusCode).toBe(200);
  });

  it("PUT rejects missing title with 400", async () => {
    const app = buildApp();
    const res = await app.inject({
      method: "PUT",
      url: "/api/admin/pages/s/translations/de",
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it("DELETE returns 204 on success", async () => {
    const app = buildApp();
    const res = await app.inject({ method: "DELETE", url: "/api/admin/pages/s/translations/de" });
    expect(res.statusCode).toBe(204);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- admin-page-translations.route`
Expected: FAIL — route file missing.

- [ ] **Step 3: Implement the route file**

Create `apps/backend/src/routes/admin-page-translations.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  deletePageTranslation,
  getPageTranslationsWithStatus,
  upsertPageTranslation,
} from "../services/admin-translations.js";

interface TranslationBody {
  title?: unknown;
  content?: unknown;
  translationReady?: unknown;
}

function getCallerId(request: FastifyRequest): string | null {
  const payload = (request as unknown as { user?: { sub?: string } }).user;
  return payload?.sub ?? null;
}

function validateBody(body: unknown):
  | { ok: true; data: { title: string; content: string; translationReady: boolean } }
  | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, message: "body must be an object" };
  }
  const b = body as TranslationBody;
  if (typeof b.title !== "string") return { ok: false, message: "title must be string" };
  if (b.content !== undefined && typeof b.content !== "string") {
    return { ok: false, message: "content must be string" };
  }
  if (b.translationReady !== undefined && typeof b.translationReady !== "boolean") {
    return { ok: false, message: "translationReady must be boolean" };
  }
  return {
    ok: true,
    data: {
      title: b.title,
      content: typeof b.content === "string" ? b.content : "",
      translationReady: b.translationReady === true,
    },
  };
}

export function registerAdminPageTranslationRoutes(app: FastifyInstance): void {
  app.get<{ Params: { slug: string } }>(
    "/api/admin/pages/:slug/translations",
    async (request, reply) => {
      try {
        const data = await getPageTranslationsWithStatus(request.params.slug);
        return reply.send({
          statuses: data.statuses,
          translations: data.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            content: t.content,
            translationReady: t.translationReady,
            sourceUpdatedAt: t.sourceUpdatedAt?.toISOString() ?? null,
            updatedAt: t.updatedAt.toISOString(),
          })),
        });
      } catch {
        return reply.code(404).send({ error: "NOT_FOUND" });
      }
    },
  );

  app.put<{ Params: { slug: string; locale: string } }>(
    "/api/admin/pages/:slug/translations/:locale",
    async (request, reply) => {
      const parsed = validateBody(request.body);
      if (!parsed.ok) return reply.code(400).send({ error: "INVALID_INPUT", message: parsed.message });
      const res = await upsertPageTranslation(
        request.params.slug,
        request.params.locale,
        parsed.data,
        getCallerId(request),
      );
      if (!res.ok) {
        const code = res.code === "NOT_FOUND" ? 404 : 400;
        return reply.code(code).send({ error: res.code, message: res.message });
      }
      return reply.send({
        locale: res.data.locale,
        title: res.data.title,
        content: res.data.content,
        translationReady: res.data.translationReady,
        sourceUpdatedAt: res.data.sourceUpdatedAt?.toISOString() ?? null,
        updatedAt: res.data.updatedAt.toISOString(),
      });
    },
  );

  app.delete<{ Params: { slug: string; locale: string } }>(
    "/api/admin/pages/:slug/translations/:locale",
    async (request, reply) => {
      const res = await deletePageTranslation(request.params.slug, request.params.locale);
      if (!res.ok) {
        const code = res.code === "NOT_FOUND" ? 404 : 400;
        return reply.code(code).send({ error: res.code, message: res.message });
      }
      return reply.code(204).send();
    },
  );
}
```

Modify `apps/backend/src/routes/admin-content.ts` to register the new routes at the same mount point. Find the existing `export async function registerAdminContentRoutes(app: FastifyInstance)` (or equivalent) and add at the bottom:

```ts
registerAdminPageTranslationRoutes(app);
```

Add the import at the top:

```ts
import { registerAdminPageTranslationRoutes } from "./admin-page-translations.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- admin-page-translations.route`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/routes/admin-page-translations.ts apps/backend/src/routes/admin-content.ts apps/backend/src/__tests__/admin-page-translations.route.test.ts
git commit -m "Feat: admin page translation HTTP routes"
```

---

## Task 8: Segments — accept translations in bulk replace

**Files:**
- Modify: `apps/backend/src/services/admin-segments.ts`
- Modify: `apps/backend/src/routes/admin-content.ts` (the `/segments` PUT handler's body validation)
- Modify: `apps/backend/src/__tests__/admin-segments.test.ts`

- [ ] **Step 1: Extend the existing test**

In `apps/backend/src/__tests__/admin-segments.test.ts`, add a new `it` block inside the existing `describe("replaceSegments", …)`:

```ts
it("persists per-segment translations via repo.replaceSegmentTranslations", async () => {
  pages.set("owner", makePage({ slug: "owner", pageType: "segmented" }));
  pages.set("child", makePage({ slug: "child", pageType: "default" }));
  const calls: { segmentId: number; translations: { locale: string; label: string }[] }[] = [];
  const customRepo: Partial<AdminRepository> = {
    ...repo,
    async replaceSegmentTranslations(segmentId, translations) {
      calls.push({ segmentId, translations: translations.map((t) => ({ locale: t.locale, label: t.label })) });
    },
  };
  vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => customRepo }));
  const { replaceSegments } = await import("../services/admin-segments.js");

  await replaceSegments("owner", [
    { position: 0, label: "Child", targetSlug: "child", translations: { de: "Kind" } },
  ]);
  expect(calls.length).toBe(1);
  expect(calls[0]!.translations).toEqual([{ locale: "de", label: "Kind" }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- admin-segments`
Expected: FAIL — `replaceSegments` does not call `replaceSegmentTranslations`.

- [ ] **Step 3: Implement in service**

In `apps/backend/src/services/admin-segments.ts`, extend the per-segment input type (adding `translations`) and, after the repository's `replaceSegmentsForOwner` returns the persisted rows, iterate and call `replaceSegmentTranslations(row.id, …)` for each input's translations map. Skip default-locale entries (the base `label` field is the source). Source timestamp = owner page's `label_updated_at` snapshot — take from the page row loaded at the start of `replaceSegments`.

```ts
// Extend the service input type (align with PageSegmentInput from shared):
type SegmentInputWithTx = PageSegmentInput & { translations?: Partial<Record<Locale, string>> };

// After replaceSegmentsForOwner call:
for (let i = 0; i < rows.length; i++) {
  const input = inputs[i]!;
  const persisted = rows[i]!;
  const translations = Object.entries(input.translations ?? {})
    .filter(([locale, label]) => locale !== DEFAULT_LOCALE && typeof label === "string" && label.length > 0)
    .map(([locale, label]) => ({
      locale,
      label: label as string,
      sourceUpdatedAt: persisted.labelUpdatedAt,
    }));
  await repo.replaceSegmentTranslations(persisted.id, translations);
}
```

In the HTTP route (`apps/backend/src/routes/admin-content.ts`, the `/segments` PUT handler), extend body validation to pass through `translations` on each segment if it is a plain object mapping locale → string.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- admin-segments`
Expected: PASS (including new case).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/admin-segments.ts apps/backend/src/routes/admin-content.ts apps/backend/src/__tests__/admin-segments.test.ts
git commit -m "Feat: segment bulk replace accepts per-locale translations"
```

---

## Task 9: Nav — accept translations in bulk PUT

**Files:**
- Modify: `apps/backend/src/services/admin-nav.ts`
- Modify: `apps/backend/src/routes/admin-nav.ts`
- Create: `apps/backend/src/__tests__/admin-nav-translations.test.ts`

- [ ] **Step 1: Write failing test**

Create `apps/backend/src/__tests__/admin-nav-translations.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { AdminRepository } from "../db/admin-repository.js";
import { replaceNavItems } from "../services/admin-nav.js";

describe("replaceNavItems with translations", () => {
  it("forwards translations to repo.replaceNavItemTranslations", async () => {
    const calls: { navItemId: number; translations: { locale: string; label: string }[] }[] = [];
    const repo: Partial<AdminRepository> = {
      async replaceNavItems() {
        return [{
          id: 10, navId: "header", pageSlug: null, url: "/x",
          target: "_self", position: 0, label: "Home",
          labelUpdatedAt: new Date(),
        }];
      },
      async replaceNavItemTranslations(navItemId, translations) {
        calls.push({ navItemId, translations: translations.map((t) => ({ locale: t.locale, label: t.label })) });
      },
      async listNavItems() { return []; },
      async listNavTranslations() { return []; },
    };
    vi.doMock("../db/index.js", () => ({ getAdminRepository: async () => repo }));
    const { replaceNavItems: svc } = await import("../services/admin-nav.js");
    await svc("header", [
      { pageSlug: null, url: "/x", label: "Home", target: "_self", translations: { de: "Start" } },
    ]);
    expect(calls).toEqual([{ navItemId: 10, translations: [{ locale: "de", label: "Start" }] }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- admin-nav-translations`
Expected: FAIL.

- [ ] **Step 3: Implement in service**

In `apps/backend/src/services/admin-nav.ts`, extend the nav-item input shape to accept `translations?: Partial<Record<Locale, string>>` (align with `NavItemInput` from shared). After `repo.replaceNavItems` returns, iterate and call `repo.replaceNavItemTranslations` per item, skipping default-locale and empty labels. Source timestamp = the row's `labelUpdatedAt`.

```ts
for (let i = 0; i < rows.length; i++) {
  const persisted = rows[i]!;
  const input = inputs[i]!;
  const translations = Object.entries(input.translations ?? {})
    .filter(([locale, label]) => locale !== DEFAULT_LOCALE && typeof label === "string" && label.length > 0)
    .map(([locale, label]) => ({
      locale,
      label: label as string,
      sourceUpdatedAt: persisted.labelUpdatedAt,
    }));
  await repo.replaceNavItemTranslations(persisted.id, translations);
}
```

Also extend the service response to hydrate `translations` per item using `repo.listNavTranslations(navId)` and group by `navItemId`.

In `apps/backend/src/routes/admin-nav.ts`, extend body validation for the PUT endpoint: each item may carry `translations: { [locale]: string }`. Validate locales using `isLocale` from shared; reject unknown locales with 400.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- admin-nav-translations`
Expected: PASS.

Re-run existing nav tests to confirm no regression: `npm run -w @musiccloud/backend test -- admin-nav`.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/admin-nav.ts apps/backend/src/routes/admin-nav.ts apps/backend/src/__tests__/admin-nav-translations.test.ts
git commit -m "Feat: nav bulk PUT accepts per-item translations"
```

---

## Task 10: Public resolver — locale-aware fallback

**Files:**
- Modify: `apps/backend/src/services/public-content.ts` (or the file that currently owns `getPublicContentPage` / nav resolution — locate via grep for `PublicContentPage` return type in `services/`)
- Modify: `apps/backend/src/routes/resolve-public-get.ts` (and `public-content-nav.ts`) — read `?locale=` param, cookie, `Accept-Language`, pass to service
- Create: `apps/backend/src/__tests__/public-content-locale.test.ts`

- [ ] **Step 1: Locate existing public content service**

Run: `grep -rln "PublicContentPage" apps/backend/src/services`
Open the file returned; call it `<PUB_SVC>` in the steps below.

- [ ] **Step 2: Write failing test**

Create `apps/backend/src/__tests__/public-content-locale.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminRepository, ContentPageRow, ContentPageTranslationRow, PageSegmentRow, PageSegmentTranslationRow } from "../db/admin-repository.js";
import { resolvePublicContentPage } from "../services/public-content.js";

const pages = new Map<string, ContentPageRow>();
const pageTx: ContentPageTranslationRow[] = [];
const segments: PageSegmentRow[] = [];
const segmentTx: PageSegmentTranslationRow[] = [];

const repo: Partial<AdminRepository> = {
  async getContentPageBySlug(slug) { return pages.get(slug) ?? null; },
  async listPageTranslations(slug) { return pageTx.filter((t) => t.slug === slug); },
  async listSegmentsForOwner(owner) { return segments.filter((s) => s.ownerSlug === owner); },
  async listSegmentTranslationsForOwner(owner) {
    const ids = new Set(segments.filter((s) => s.ownerSlug === owner).map((s) => s.id));
    return segmentTx.filter((t) => ids.has(t.segmentId));
  },
};

vi.mock("../db/index.js", () => ({ getAdminRepository: async () => repo }));

function mkPage(slug: string, title: string, content: string): ContentPageRow {
  return {
    slug, title, content, status: "published", showTitle: true, titleAlignment: "left",
    pageType: "default", displayMode: "fullscreen", overlayWidth: "regular",
    createdBy: null, updatedBy: null, createdAt: new Date(), updatedAt: null,
    contentUpdatedAt: new Date(),
  };
}

describe("resolvePublicContentPage", () => {
  beforeEach(() => {
    pages.clear(); pageTx.length = 0; segments.length = 0; segmentTx.length = 0;
    pages.set("about", mkPage("about", "About", "EN body"));
  });

  it("returns en when no translation exists", async () => {
    const r = await resolvePublicContentPage("about", "de");
    expect(r?.title).toBe("About");
    expect(r?.content).toBe("EN body");
  });

  it("returns de when translation_ready=true", async () => {
    pageTx.push({
      slug: "about", locale: "de", title: "Über uns", content: "DE body",
      translationReady: true, sourceUpdatedAt: new Date(), updatedAt: new Date(), updatedBy: null,
    });
    const r = await resolvePublicContentPage("about", "de");
    expect(r?.title).toBe("Über uns");
    expect(r?.content).toBe("DE body");
  });

  it("falls back to en when translation_ready=false", async () => {
    pageTx.push({
      slug: "about", locale: "de", title: "Über uns", content: "DE body",
      translationReady: false, sourceUpdatedAt: new Date(), updatedAt: new Date(), updatedBy: null,
    });
    const r = await resolvePublicContentPage("about", "de");
    expect(r?.title).toBe("About");
    expect(r?.content).toBe("EN body");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run -w @musiccloud/backend test -- public-content-locale`
Expected: FAIL — `resolvePublicContentPage` either doesn't accept a locale arg or does not fall back correctly.

- [ ] **Step 4: Implement in public service**

In `<PUB_SVC>`:

```ts
import type { Locale } from "@musiccloud/shared";
import { DEFAULT_LOCALE, isLocale } from "@musiccloud/shared";

export async function resolvePublicContentPage(
  slug: string,
  localeInput: string | null | undefined,
): Promise<PublicContentPage | null> {
  const locale: Locale = isLocale(localeInput) ? localeInput : DEFAULT_LOCALE;
  const repo = await getAdminRepository();
  const row = await repo.getContentPageBySlug(slug);
  if (!row || row.status !== "published") return null;

  let title = row.title;
  let content = row.content;
  if (locale !== DEFAULT_LOCALE) {
    const translations = await repo.listPageTranslations(slug);
    const t = translations.find((x) => x.locale === locale && x.translationReady);
    if (t) {
      title = t.title;
      content = t.content;
    }
  }

  // Segments
  const segments: PublicPageSegment[] = [];
  if (row.pageType === "segmented") {
    const segRows = await repo.listSegmentsForOwner(slug);
    const segTx = locale !== DEFAULT_LOCALE ? await repo.listSegmentTranslationsForOwner(slug) : [];
    for (const s of segRows) {
      const st = segTx.find((x) => x.segmentId === s.id && x.locale === locale);
      const childPage = await repo.getContentPageBySlug(s.targetSlug);
      if (!childPage) continue;
      let childTitle = childPage.title;
      let childContent = childPage.content;
      if (locale !== DEFAULT_LOCALE) {
        const ct = (await repo.listPageTranslations(childPage.slug))
          .find((x) => x.locale === locale && x.translationReady);
        if (ct) { childTitle = ct.title; childContent = ct.content; }
      }
      segments.push({
        label: st?.label ?? s.label,
        targetSlug: s.targetSlug,
        title: childTitle,
        showTitle: childPage.showTitle,
        content: childContent,
        contentHtml: renderBody(childContent),
      });
    }
  }

  return {
    slug, title,
    showTitle: row.showTitle, titleAlignment: row.titleAlignment,
    pageType: row.pageType, displayMode: row.displayMode,
    overlayWidth: row.overlayWidth,
    content, contentHtml: renderBody(content), segments,
  };
}
```

- [ ] **Step 5: Resolve locale in the public routes**

In `apps/backend/src/routes/resolve-public-get.ts` (and `public-content-nav.ts`):

```ts
import { DEFAULT_LOCALE, isLocale, type Locale } from "@musiccloud/shared";

function resolveLocale(request: FastifyRequest): Locale {
  const q = (request.query as { locale?: unknown })?.locale;
  if (isLocale(q)) return q;
  const cookie = request.cookies?.["mc:locale"];
  if (isLocale(cookie)) return cookie;
  const accept = request.headers["accept-language"];
  if (typeof accept === "string") {
    const prefix = accept.split(",")[0]?.split("-")[0];
    if (isLocale(prefix)) return prefix;
  }
  return DEFAULT_LOCALE;
}
```

Pass the resolved locale into the service call (`resolvePublicContentPage(slug, locale)` and equivalent for nav).

Also extend the nav resolver so the final label is computed in SQL (or code) using `COALESCE(item-translation-label, default-label, page-translation-title, page-default-title)` exactly as documented in the spec. Implementation mirrors the pages flow — read all four sources, resolve per row.

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run -w @musiccloud/backend test -- public-content-locale`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/public-content.ts apps/backend/src/routes/resolve-public-get.ts apps/backend/src/routes/public-content-nav.ts apps/backend/src/__tests__/public-content-locale.test.ts
git commit -m "Feat: locale-aware public content resolution with default-locale fallback"
```

---

## Task 11: Frontend — shrink LOCALES and delete unused translations

**Files:**
- Modify: `apps/frontend/src/i18n/locales.ts`
- Delete: `apps/frontend/src/i18n/translations/{cs,es,fr,it,nl,pt,tr}.json`

- [ ] **Step 1: Replace `LOCALES` and `LOCALE_META`**

Edit `apps/frontend/src/i18n/locales.ts` so the top becomes:

```ts
export { LOCALES, DEFAULT_LOCALE, isLocale, type Locale } from "@musiccloud/shared";

import type { Locale } from "@musiccloud/shared";
import { LOCALES } from "@musiccloud/shared";

export const LOCALE_META: Record<Locale, { flag: string; label: string }> = {
  en: { flag: "🇬🇧", label: "English" },
  de: { flag: "🇩🇪", label: "Deutsch" },
};

export const LOCALE_STORAGE_KEY = "mc:locale";

export function detectLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved;
  const browser = navigator.language.split("-")[0] as Locale;
  if ((LOCALES as readonly string[]).includes(browser)) return browser;
  return "en";
}

export function getLocaleFromCookie(value: string | undefined): Locale {
  if (value && (LOCALES as readonly string[]).includes(value as Locale)) return value as Locale;
  return "en";
}
```

- [ ] **Step 2: Delete obsolete translation JSONs**

```bash
rm apps/frontend/src/i18n/translations/cs.json \
   apps/frontend/src/i18n/translations/es.json \
   apps/frontend/src/i18n/translations/fr.json \
   apps/frontend/src/i18n/translations/it.json \
   apps/frontend/src/i18n/translations/nl.json \
   apps/frontend/src/i18n/translations/pt.json \
   apps/frontend/src/i18n/translations/tr.json
```

- [ ] **Step 3: Typecheck the frontend**

Run: `npm run -w @musiccloud/frontend typecheck`
Expected: no errors. If `loadTranslations` in `src/i18n/server.ts` or `context.tsx` dynamically imports the deleted files, update it to switch over `en`/`de` only.

- [ ] **Step 4: Boot-check**

Run: `npm run -w @musiccloud/frontend dev` in the background, hit `http://localhost:<port>/`, confirm no 500s in the logs.
Expected: site renders; locale picker shows only EN/DE.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/i18n/locales.ts apps/frontend/src/i18n/server.ts apps/frontend/src/i18n/context.tsx
git rm apps/frontend/src/i18n/translations/{cs,es,fr,it,nl,pt,tr}.json
git commit -m "Chore: reduce frontend locales to en and de"
```

---

## Task 12: Frontend — pass locale into public API calls

**Files:**
- Modify: `apps/frontend/src/api/client.ts`
- Modify: Astro pages that call `fetchPublicContentPage` / nav fetches (discover with grep)

- [ ] **Step 1: Extend client signatures**

Edit `apps/frontend/src/api/client.ts`:

```ts
import type { Locale } from "@musiccloud/shared";

export async function fetchPublicContentPage(
  slug: string,
  locale: Locale = "en",
): Promise<PublicContentPage | null> {
  try {
    const url = backendUrl(ENDPOINTS.v1.content.detail(slug)) + `?locale=${locale}`;
    const res = await fetchWithTimeout(url, { headers: internalHeaders() }, 5000);
    if (!res.ok) return null;
    return (await res.json()) as PublicContentPage;
  } catch {
    return null;
  }
}
```

Apply the same pattern to every public fetch helper that returns resolved content — nav helper (find with `grep -n "ENDPOINTS.v1.nav" apps/frontend/src/api/client.ts`).

- [ ] **Step 2: Thread locale through Astro pages**

```bash
grep -rln "fetchPublicContentPage" apps/frontend/src
```

In each caller, resolve locale via the existing helper and pass it in:

```ts
import { getLocaleFromCookie } from "@/i18n/locales";
const locale = getLocaleFromCookie(Astro.cookies.get("mc:locale")?.value);
const page = await fetchPublicContentPage(slug, locale);
```

Same pattern for nav fetches.

- [ ] **Step 3: Verify round-trip with cookie**

Run: `npm run -w @musiccloud/frontend dev` in the background. Load the frontend in a browser, set cookie `mc:locale=de` via DevTools, reload a managed content page. Confirm the page renders the DE translation once the backend has one stored.

Expected: switching the cookie value flips the rendered text.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/client.ts apps/frontend/src/pages
git commit -m "Feat: frontend passes resolved locale to public content API"
```

---

## Task 13: Dashboard — LanguageTabs component

**Files:**
- Create: `apps/dashboard/src/features/content/pages/LanguageTabs.tsx`

- [ ] **Step 1: Implement the component**

```tsx
import type { Locale, TranslationStatus } from "@musiccloud/shared";
import { LOCALES } from "@musiccloud/shared";

export interface LanguageTabState {
  status: TranslationStatus;
  dirty: boolean;
}

interface Props {
  active: Locale;
  states: Record<Locale, LanguageTabState>;
  onSelect: (locale: Locale) => void;
}

const FLAG: Record<Locale, string> = { en: "🇬🇧", de: "🇩🇪" };

export function LanguageTabs({ active, states, onSelect }: Props) {
  return (
    <div className="flex gap-2 border-b">
      {LOCALES.map((locale) => {
        const s = states[locale];
        const badges: string[] = [];
        if (s.dirty) badges.push("•");
        if (s.status === "stale") badges.push("⚠︎");
        if (s.status === "ready") badges.push("●");
        else if (s.status === "draft" || s.status === "missing") badges.push("○");
        return (
          <button
            key={locale}
            type="button"
            onClick={() => onSelect(locale)}
            aria-pressed={active === locale}
            className={`px-3 py-2 -mb-px border-b-2 ${
              active === locale ? "border-accent font-semibold" : "border-transparent"
            }`}
          >
            <span className="mr-1">{FLAG[locale]}</span>
            <span className="uppercase">{locale}</span>
            {badges.length > 0 && <span className="ml-2">{badges.join(" ")}</span>}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Render-test smoke-check**

Run: `npm run -w @musiccloud/dashboard typecheck`
Expected: no errors.

Visual verification happens in Task 14 when the component is wired up.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/features/content/pages/LanguageTabs.tsx
git commit -m "Feat: LanguageTabs component for page translation editor"
```

---

## Task 14: Dashboard — wire tabs into ContentEditorPage

**Files:**
- Create: `apps/dashboard/src/features/content/pages/usePageTranslations.ts`
- Modify: `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`

- [ ] **Step 1: Add React Query hooks for translations**

Create `apps/dashboard/src/features/content/pages/usePageTranslations.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ENDPOINTS, type Locale, type TranslationStatus } from "@musiccloud/shared";

interface TranslationPayload {
  title: string;
  content: string;
  translationReady: boolean;
}

interface TranslationRow extends TranslationPayload {
  locale: Locale;
  sourceUpdatedAt: string | null;
  updatedAt: string;
}

interface TranslationsResponse {
  statuses: Record<Locale, TranslationStatus>;
  translations: TranslationRow[];
}

export function usePageTranslations(slug: string) {
  return useQuery({
    queryKey: ["page-translations", slug],
    queryFn: async (): Promise<TranslationsResponse> => {
      const res = await fetch(ENDPOINTS.admin.pages.translations.list(slug), { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}

export function useSaveTranslation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ locale, body }: { locale: Locale; body: TranslationPayload }) => {
      const res = await fetch(ENDPOINTS.admin.pages.translations.detail(slug, locale), {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<TranslationRow>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["page-translations", slug] }),
  });
}

export function useDeleteTranslation(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (locale: Locale) => {
      const res = await fetch(ENDPOINTS.admin.pages.translations.detail(slug, locale), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 404) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["page-translations", slug] }),
  });
}
```

- [ ] **Step 2: Modify ContentEditorPage to mount tabs**

In `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`:

1. Import `LanguageTabs`, `usePageTranslations`, `useSaveTranslation`, `useDeleteTranslation`, `DEFAULT_LOCALE`, `type Locale`.
2. Add `const [activeLocale, setActiveLocale] = useState<Locale>(DEFAULT_LOCALE);`.
3. Maintain per-locale form state in a `Record<Locale, { title: string; content: string; dirty: boolean }>`. Initialise the `en` entry from the page row; initialise non-default entries from `usePageTranslations` or leave undefined until the user clicks "Create translation".
4. Render `LanguageTabs` with `states` derived from the form map (`dirty` flag) and the `statuses` field from `usePageTranslations`.
5. Below the tabs, render the existing title/content editor but read/write the active tab's entry.
6. Save button:
   - When `activeLocale === DEFAULT_LOCALE`, keep using the existing page PUT (which also bumps `content_updated_at`).
   - Otherwise call `useSaveTranslation` with the active tab's body.
7. Add a `beforeunload` guard when any tab's `dirty` flag is true.
8. When a non-default tab has no translation yet, render a single button:

```tsx
<button onClick={() => setFormForLocale(activeLocale, { title: defaultForm.title, content: defaultForm.content, dirty: true })}>
  Create translation from {DEFAULT_LOCALE.toUpperCase()}
</button>
```

9. Add a toggle "Translation ready" for non-default tabs that maps to `translationReady` in the save payload.

- [ ] **Step 3: Manual verification**

Run: `npm run -w @musiccloud/dashboard dev` in the background, log in, open a page. Switch between the EN and DE tabs. Edit DE content, confirm:
  - EN tab badge shows `●` (ready) when nothing dirty.
  - DE tab badge shows `○` when no translation exists.
  - Editing DE shows `•` (dirty) immediately.
  - Saving DE with `Translation ready` checked flips its badge to `●`.
  - Editing EN title after saving DE reflects as `⚠︎` on DE after the page is reloaded.

- [ ] **Step 4: Typecheck**

Run: `npm run -w @musiccloud/dashboard typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/features/content/pages/usePageTranslations.ts apps/dashboard/src/features/content/pages/ContentEditorPage.tsx
git commit -m "Feat: language tabs in content editor with dirty + stale markers"
```

---

## Task 15: Dashboard — segment label translations

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/SegmentManager.tsx`

- [ ] **Step 1: Extend the segment row UI**

Each segment card gets an expandable "Translations" block. Use the existing `useState<Record<number, boolean>>` pattern (or local state per row) to show/hide.

```tsx
import { LOCALES, DEFAULT_LOCALE, type Locale } from "@musiccloud/shared";

// Inside the segment row render:
const nonDefault = LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE);
// state: translations: Partial<Record<Locale, string>>

{expanded && (
  <div className="mt-2 pl-4 border-l">
    {nonDefault.map((locale) => (
      <label key={locale} className="flex gap-2 items-center my-1">
        <span className="w-8 uppercase text-xs">{locale}</span>
        <input
          className="flex-1"
          value={segment.translations?.[locale] ?? ""}
          onChange={(e) =>
            onSegmentChange({ ...segment, translations: { ...segment.translations, [locale]: e.target.value } })
          }
          placeholder={segment.label}
        />
      </label>
    ))}
  </div>
)}
```

The existing bulk-save action for segments submits the whole list back via PUT — the payload now includes each segment's `translations` map. Ensure `onSegmentChange` updates that field.

- [ ] **Step 2: Manual verification**

Dashboard: edit a segmented page, expand a segment, type a DE label, save. Reload and confirm the label persisted. With cookie `mc:locale=de` on the frontend, the segment label switches to the DE value.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/features/content/pages/SegmentManager.tsx
git commit -m "Feat: dashboard segment translations expandable"
```

---

## Task 16: Dashboard — nav item label translations

**Files:**
- Modify: `apps/dashboard/src/features/content/navigation/NavManagerPage.tsx`

- [ ] **Step 1: Extend the nav row UI**

Same pattern as segments: per-row expandable with an input per non-default locale. Placeholder shows the resolved fallback:
- If the item has a `pageSlug`, the placeholder is the linked page's default-locale title (passed through the existing page lookup).
- Otherwise the placeholder is the custom default label.

```tsx
<input
  placeholder={item.pageSlug
    ? `Uses linked page title: ${resolvePageTitle(item.pageSlug)}`
    : (item.label ?? "")}
  value={item.translations?.[locale] ?? ""}
  onChange={(e) => updateItem({ ...item, translations: { ...item.translations, [locale]: e.target.value } })}
/>
```

- [ ] **Step 2: Manual verification**

Dashboard: edit header nav, expand an item, type DE label, save. With cookie `mc:locale=de` on frontend, confirm nav shows DE label.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/features/content/navigation/NavManagerPage.tsx
git commit -m "Feat: dashboard nav translations expandable"
```

---

## Task 17: Dashboard — translation status column on pages list

**Files:**
- Modify: `apps/dashboard/src/features/content/pages/PagesListPage.tsx`

- [ ] **Step 1: Add status cell**

The pages list query already returns `translationStatus` per page (added in Task 6). Render a compact badge per non-default locale:

```tsx
import { LOCALES, DEFAULT_LOCALE, type Locale, type TranslationStatus } from "@musiccloud/shared";

const GLYPH: Record<TranslationStatus, string> = {
  ready: "●", draft: "○", stale: "⚠︎", missing: "○",
};
const COLOR: Record<TranslationStatus, string> = {
  ready: "text-emerald-500", draft: "text-gray-400",
  stale: "text-amber-500", missing: "text-gray-300",
};

// In the table cell:
<td>
  {LOCALES.filter((l): l is Locale => l !== DEFAULT_LOCALE).map((locale) => {
    const s = (page.translationStatus?.[locale] ?? "missing") as TranslationStatus;
    return (
      <span key={locale} title={`${locale.toUpperCase()}: ${s}`} className={`mr-1 ${COLOR[s]}`}>
        {locale.toUpperCase()} {GLYPH[s]}
      </span>
    );
  })}
</td>
```

- [ ] **Step 2: Manual verification**

Pages list shows per-locale badges. Creating a DE translation and flipping Translation Ready updates the badge on the list page after a reload.

- [ ] **Step 3: Commit**

```bash
git add apps/dashboard/src/features/content/pages/PagesListPage.tsx
git commit -m "Feat: translation status column on pages list"
```

---

## Task 18: Full-stack smoke test + cache review

**Files:** none modified unless issues surface.

- [ ] **Step 1: End-to-end flow**

1. Start backend, dashboard, frontend.
2. Dashboard: create page `smoke-test`, status = published, default-locale title/content.
3. Dashboard: open the page, switch to DE tab, click "Create translation", edit, mark Translation Ready, save.
4. Dashboard: navigate to pages list, confirm DE badge shows `●`.
5. Frontend with cookie `mc:locale=en`: visit `/smoke-test`, confirm EN content.
6. Frontend with cookie `mc:locale=de`: reload, confirm DE content.
7. Dashboard: edit EN title, save. Reload the pages list — DE badge for this page should now show `⚠︎` (stale).
8. Dashboard: delete the page. Confirm DE translation cascaded away (re-query translations endpoint returns 404 / empty).

- [ ] **Step 2: Cache key review**

Search for any HTTP cache key or SSR cache key on public content routes:

```bash
grep -rn "cacheControl\|setHeader.*cache\|Cache-Control" apps/backend/src/routes
```

For any cache key that applies to public content endpoints, confirm the `locale` is included either in the URL (it is, via `?locale=`) or in a `Vary: Cookie` / `Vary: Accept-Language` header. If missing, add it — otherwise users will be served wrong-language cached responses.

- [ ] **Step 3: Commit if anything changed**

```bash
# Only if cache review revealed missing Vary headers or similar:
git add apps/backend/src/routes/<files>
git commit -m "Fix: include locale in public content cache variance"
```

If no changes needed, note the smoke test passing and move on.

---

## Rollout Notes

Sequence suggested in the spec:

1. Deploy backend first (migration + new endpoints + backwards-compatible old endpoints default to `en`).
2. Deploy dashboard (editors start translating).
3. Deploy frontend (sends `?locale=`; locale picker shrinks to EN/DE).

This keeps every intermediate step deployable.

Post-rollout follow-up (not in this plan): operator audits every content page, moves actually-German content from the seeded `en` default row into a proper `de` translation, and replaces the `en` source with a genuine English version. This is listed here as a reminder because it cannot be automated safely.

---

## Self-Review Notes

Verified against the spec:

- Locale scope (`en`, `de`) — Task 1 + Task 11.
- Parent-table default-locale storage + fallback — Tasks 3, 6, 10.
- Translation tables with PK `(parent_id, locale)` — Task 3.
- `source_updated_at` snapshot + `content_updated_at` / `label_updated_at` bump — Task 3 (schema) + Task 6 (service bumps on title/content change).
- Admin CRUD — Tasks 6 + 7 (pages), Task 8 (segments), Task 9 (nav).
- Public locale resolution with 4-step fallback — Task 10.
- `translationStatus` in admin responses — Task 6 + Task 17.
- Stale detection applied to pages + segments + nav — Task 6 (pages); segments/nav stale flags surface through `labelUpdatedAt` vs `sourceUpdatedAt`, exposed in the bulk GET responses of Tasks 8 and 9.
- Frontend shrink + `?locale=` — Tasks 11 + 12.
- Dashboard tabs + dirty/stale markers + segment/nav expandables + status column — Tasks 13–17.
- Cache review — Task 18.
- Commit messages follow repo convention (`Feat:`, `Chore:`, `Fix:`).
- No placeholders; every step carries runnable code or explicit commands.
