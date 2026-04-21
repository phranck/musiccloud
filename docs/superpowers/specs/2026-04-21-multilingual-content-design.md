# Multilingual Content — Design Spec

**Date:** 2026-04-21
**Status:** Approved (pending user review)

## Goal

Allow editors to write content for managed pages, page segments, and
navigation items in multiple languages. The frontend resolves the visitor's
locale (via cookie / `Accept-Language`) and renders the matching translation,
falling back to the default locale when a translation is missing or not yet
marked ready.

## Locale Scope

- Supported locales: `en` (default), `de`.
- The frontend's `i18n` UI-string translations are reduced to these two
  locales as part of this change. JSON files for `cs`, `es`, `fr`, `it`, `nl`,
  `pt`, `tr` are deleted.
- `LOCALES`, `DEFAULT_LOCALE`, and `Locale` become the single source of truth
  and are moved into `@musiccloud/shared` so backend, dashboard, and frontend
  agree.

## Fallback Strategy

- The default-locale row (`en`) is mandatory on every content entity. It is
  stored on the existing parent tables (`content_pages.title/content`,
  `page_segments.label`, `nav_items.label`) and acts as both source of truth
  and fallback.
- Non-default locales are optional. A translation is considered "visible" on
  the public site only when `translation_ready = true`.
- Resolution order per request: `?locale=<x>` query param → `mc:locale`
  cookie → `Accept-Language` header → `en`.

## Schema Changes

### Parent tables — new columns

```sql
ALTER TABLE content_pages  ADD COLUMN content_updated_at   timestamptz NOT NULL DEFAULT now();
ALTER TABLE page_segments  ADD COLUMN label_updated_at     timestamptz NOT NULL DEFAULT now();
ALTER TABLE nav_items      ADD COLUMN label_updated_at     timestamptz NOT NULL DEFAULT now();
```

These timestamps are touched **only** when the source text actually changes
(title, content, label). They are distinct from the existing `updated_at`
columns, which track any row mutation (status flips, display-mode tweaks,
etc.) and must not falsely mark translations stale.

### New translation tables

```sql
CREATE TABLE content_page_translations (
  slug              text        NOT NULL REFERENCES content_pages(slug)
                                ON DELETE CASCADE ON UPDATE CASCADE,
  locale            text        NOT NULL,
  title             text        NOT NULL,
  content           text        NOT NULL DEFAULT '',
  translation_ready boolean     NOT NULL DEFAULT false,
  source_updated_at timestamptz,              -- snapshot of parent.content_updated_at at save time
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text        REFERENCES admin_users(id) ON DELETE SET NULL,
  PRIMARY KEY (slug, locale)
);

CREATE TABLE page_segment_translations (
  segment_id        integer     NOT NULL REFERENCES page_segments(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, locale)
);

CREATE TABLE nav_item_translations (
  nav_item_id       integer     NOT NULL REFERENCES nav_items(id) ON DELETE CASCADE,
  locale            text        NOT NULL,
  label             text        NOT NULL,
  source_updated_at timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (nav_item_id, locale)
);
```

### Stale detection

A translation is **stale** when

```
parent.<field>_updated_at > translation.source_updated_at
```

i.e. the source has been edited since the translation was last saved. It is
computed at read-time by the admin API and returned in the response
alongside the translation row; it is not persisted. Stale applies to all
three translation tables (pages, segments, nav items).

### Migration seeding

Existing rows are tagged as `en` and marked ready, so the site keeps behaving
as before:

```sql
INSERT INTO content_page_translations (slug, locale, title, content, translation_ready, source_updated_at, updated_at)
SELECT slug, 'en', title, content, true, content_updated_at, now()
FROM content_pages;

INSERT INTO page_segment_translations (segment_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now() FROM page_segments;

INSERT INTO nav_item_translations (nav_item_id, locale, label, source_updated_at, updated_at)
SELECT id, 'en', label, label_updated_at, now()
FROM nav_items WHERE label IS NOT NULL;
```

The existing content is very likely in German, not English. After rollout,
operators must review each page and either move the content to the correct
`de` translation or overwrite the `en` source. This is captured as a
post-rollout follow-up, not automated, because we cannot safely auto-detect
language.

## Shared Package Additions

`packages/shared/src/locales.ts` (new):

```ts
export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
```

Extensions in `packages/shared/src/content.ts`:

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

export interface PageSegment {
  id: number;
  position: number;
  label: string;                                     // default-locale
  targetSlug: string;
  translations: Partial<Record<Locale, string>>;     // non-default locales
}

// NavItem — add:
//   translations: Partial<Record<Locale, string>>;
// Keeps all existing fields (id, navId, pageSlug, pageTitle, url, target,
// label, position, pageType, pageDisplayMode, pageOverlayWidth).

// ContentPageSummary — add:
//   translationStatus: Record<Locale, TranslationStatus>;
// Keeps all existing fields.

export interface ContentPage extends ContentPageSummary {
  content: string;                  // default-locale (= en) content
  translations: PageTranslation[];  // non-default locales only
  segments: PageSegment[];
}
```

## Backend API

### Admin — Pages

```
GET    /api/admin/pages/:slug/translations
GET    /api/admin/pages/:slug/translations/:locale
PUT    /api/admin/pages/:slug/translations/:locale   body: { title, content, translationReady }
DELETE /api/admin/pages/:slug/translations/:locale
```

The existing `GET /api/admin/pages/:slug` response is extended with
`translations: PageTranslation[]` and `translationStatus`. The existing
`PUT /api/admin/pages/:slug` (meta/body) continues to edit the default-locale
row on `content_pages`; it additionally bumps `content_updated_at` iff
`title` or `content` changed.

Saving a translation (`PUT …/translations/:locale`) sets
`source_updated_at = parent.content_updated_at` at the moment of save.

### Admin — Segments

Segments are replaced in bulk via the existing endpoint. The payload is
extended:

```json
PUT /api/admin/pages/:slug/segments
{
  "segments": [
    {
      "targetSlug": "about",
      "label": "Overview",
      "translations": { "de": "Übersicht" }
    }
  ]
}
```

The service deletes and re-creates `page_segment_translations` rows to match
the submitted map, using the current segment IDs after bulk-replace. Missing
locales are removed.

### Admin — Navigation

```
GET /api/admin/nav/:navId                           # existing, extended with per-item translations
PUT /api/admin/nav/:navId                           # existing, accepts per-item translations map
```

Per-item payload adds an optional `translations: Partial<Record<Locale, string>>`.
Bulk replacement semantics match segments.

### Public endpoints

```
GET /api/v1/public/pages/:slug?locale=de
GET /api/v1/nav/:navId?locale=de
```

`locale` is optional; if absent the backend falls back via cookie →
`Accept-Language` → `en`. Response shape (`PublicContentPage`,
`PublicNavItem[]`) is unchanged — the resolved strings are returned in the
existing fields.

### Resolution SQL (pages)

```sql
SELECT
  p.slug,
  COALESCE(t.title,   p.title)   AS title,
  COALESCE(t.content, p.content) AS content,
  …
FROM content_pages p
LEFT JOIN content_page_translations t
  ON t.slug = p.slug
 AND t.locale = $locale
 AND t.translation_ready = true
WHERE p.slug = $slug AND p.status = 'published';
```

Segment labels resolve against `page_segment_translations` with a
`COALESCE(t.label, p.label)` join (there is no `translation_ready` flag at
the segment level — a segment translation row is always considered visible
if it exists). Segment-target-page titles resolve through
`content_page_translations` using the ready/fallback rule from the pages
query above.

### Resolution SQL (nav)

```sql
SELECT
  n.id,
  COALESCE(
    ni_t.label,                        -- 1. per-item translation
    n.label,                           -- 2. default-locale item label
    cp_t.title,                        -- 3. linked page translation title
    p.title                            -- 4. linked page default-locale title
  ) AS label
FROM nav_items n
LEFT JOIN nav_item_translations ni_t
       ON ni_t.nav_item_id = n.id AND ni_t.locale = $locale
LEFT JOIN content_pages p
       ON p.slug = n.page_slug
LEFT JOIN content_page_translations cp_t
       ON cp_t.slug = p.slug
      AND cp_t.locale = $locale
      AND cp_t.translation_ready = true
WHERE n.nav_id = $navId
ORDER BY n.position;
```

## Dashboard UX

### Page editor (`ContentEditorPage.tsx`)

- Language tabs above the title/content fields: `🇬🇧 EN`, `🇩🇪 DE`. Tab order
  = `LOCALES` order from shared. The default-locale tab is first and cannot
  be removed.
- Tab badges:
  - `•` form-dirty (unsaved client-side changes in this tab), white dot.
  - `⚠︎` translation-stale (backend-flagged, non-default tabs only), yellow
    warning.
  - `●` `translation_ready = true`, green dot.
  - `○` `translation_ready = false` or missing.
- Non-default tabs lazy-init: when no translation exists, a button
  "Create translation" pre-fills the form with the default-locale values as a
  starting point (the row is only persisted on first save).
- Save is per-tab (distinct `PUT` endpoints). A `beforeunload` guard fires
  while any tab has unsaved changes.

### Segment manager (`SegmentManager.tsx`)

Each segment row exposes an expandable "Translations" block listing one input
per non-default locale.

### Nav manager (`NavManagerPage.tsx`)

Each item row exposes an expandable "Translations" block per non-default
locale. For items linked to a page, the input placeholder shows the resolved
fallback ("Will use linked page title: …") so editors understand they can
leave it blank.

### Pages list (`PagesListPage.tsx`)

A "Status" cell summarises `translationStatus`. A page is flagged if any
non-default locale is `stale`, `missing`, or `draft`. Hovering reveals the
per-locale breakdown.

## Frontend Public Integration

- The API client (`apps/frontend/src/api/client.ts`) appends `?locale=<x>`
  to `fetchPublicContentPage` and nav/segment fetches, using the existing
  `getLocaleFromCookie(Astro.cookies.get("mc:locale")?.value)` helper. The
  Astro pages that already call these helpers pass the resolved locale
  through.
- No rendering component needs to change; they continue to read the same
  resolved string fields.
- `apps/frontend/src/i18n/locales.ts` reduces `LOCALES` to `["en", "de"]`
  and trims `LOCALE_META`. The obsolete `translations/{cs,es,fr,it,nl,pt,tr}.json`
  files are deleted. Any code path that resolves an unknown persisted
  locale gracefully falls back to `en`.

## Testing

### Backend

- `__tests__/admin-content-translations.test.ts` — CRUD, upsert semantics,
  cascade on page delete, `source_updated_at` snapshot on save.
- `__tests__/admin-segments.test.ts` — extend for translations payload in
  bulk-replace (missing locales deleted, new added, existing updated).
- `__tests__/admin-nav-translations.test.ts` — per-item, per-locale persist
  via the existing bulk PUT.
- `__tests__/public-content-locale.test.ts` — resolution fallbacks:
  `?locale=de` with ready DE → DE; with `translation_ready=false` → EN; with
  no DE row → EN; cookie resolution; `Accept-Language` resolution.
- Stale detection unit test: save translation, bump parent `content`, verify
  admin API reports `stale` for that locale.

### Dashboard

If the dashboard has no existing component-test harness, this spec does not
introduce one. Manual QA covers tab switching, dirty-flag + beforeunload,
stale badge render, and create-translation flow.

## Migration & Rollout

1. Backend deployable first: schema migration plus new admin + public
   endpoints, with the existing endpoints still serving the default-locale
   text. Frontend without `?locale=` param continues to work (backend falls
   back to `en`).
2. Dashboard deployed next: tabs and stale markers become visible. Editors
   can start authoring `de` translations.
3. Frontend deployed last: starts passing `?locale=`. Locale-UI shrink
   (`LOCALES = ["en","de"]`) ships with this step so no intermediate state
   exists where the locale picker shows languages the backend cannot serve.

## Follow-Up Tasks (not in this plan)

- Operator review of migrated pages: move misattributed German content from
  the `en` default row into a proper `de` translation, and replace the `en`
  source with a real English version. Flagged in the spec as a known
  post-rollout task because language detection cannot be automated safely.
- Cache invalidation review: if any HTTP-cache or SSR-cache key is used on
  public pages, it must include `locale`.

## Out of Scope

- Machine translation (DeepL, OpenAI, etc.)
- Localised URL slugs or per-locale redirects
- Translation-history / versioning
- Role-based "translator only" permissions
- Frontend UI-string translations beyond shrinking `LOCALES`
