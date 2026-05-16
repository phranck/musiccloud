# Plan: Page Editor Localized Titles And Segment Labels

**Status:** Open  
**Owner:** Codex  
**Date:** 2026-05-16  
**Scope:** Dashboard Page Editor, content page localization model, segmented page labels, safe migration of existing page data.

## Goal

The Page Editor must use one consistent localization model for normal pages and segmented pages.

- `slug` remains global per page and is never localized.
- Page `title` becomes localized.
- Segment labels become localized.
- The language tabs at the top of the editor are the only localization context.
- The nested per-segment `TRANSLATIONS` UI is removed because it duplicates the language tabs and is misleading.
- Existing pages must be migrated without data loss.

## Current Problem

The current editor has two different concepts mixed together:

- Top-level language tabs for page-level localized content.
- A nested `TRANSLATIONS` section inside every segment row.

For segmented pages this creates a redundant localization model. A user selects a language at the top, but then also sees another translation editor per segment. That makes it unclear which language is currently being edited and where the source of truth lives.

There is also no clean, consistent way to localize the page title across normal and segmented pages.

## Target Model

### Page

```ts
type ContentPage = {
  slug: string;
  title: LocalizedText;
  pageType: "default" | "segmented";
  segments?: PageSegment[];
};

type LocalizedText = Record<string, string>;
```

Example:

```ts
{
  slug: "artists",
  title: {
    en: "Artists",
    de: "Kuenstler"
  }
}
```

### Segment

```ts
type PageSegment = {
  targetSlug: string;
  position: number;
  label: LocalizedText;
};
```

Example:

```ts
{
  targetSlug: "genre",
  position: 2,
  label: {
    en: "Genre",
    de: "Genre"
  }
}
```

### Rules

- `slug` is one shared value across all locales.
- Segment target, position, technical config and ownership are shared across all locales.
- Only human-facing text is localized.
- The active editor locale determines which localized value is visible and editable.
- Fallback text may be shown as placeholder or helper state, but must not be silently saved as a real localized value.

## Target Editor UI

For all page types:

```text
Slug
[ artists ]

[ EN ] [ DE ]

Page title
[ Artists ]
```

For segmented pages:

```text
Segments
1  [ Link ]
2  [ Free text ]
3  [ Genre ]
4  [ Search ]
```

When the user switches from `EN` to `DE`, the slug remains unchanged and the title plus segment labels switch to German values.

The nested segment `TRANSLATIONS` rows are removed.

## Migration Requirements

Migration is a primary part of this change, not a cleanup step.

### Non-Negotiable Rules

- No text value from an existing page may be lost.
- Migration must be idempotent.
- Existing unknown fields must be preserved.
- Existing segment order, owner slugs, target slugs and page types must remain unchanged.
- Existing `slug` values must remain unchanged.
- Existing data in a newer format must not be overwritten by older legacy fields.
- Conflicting values must be reported instead of blindly overwritten.
- Runtime normalization and persistent migration should use the same mapping logic.

### Safe Migration Strategy

Use a two-phase strategy.

Phase 1: Compatibility

- Add normalization that can read old, new and mixed page data.
- Update the editor UI to operate only on the normalized new model.
- Save writes the new model.
- Old persisted data remains readable.

Phase 2: Persistent Migration

- Add an explicit migration script or backend migration for stored data.
- Support dry-run mode.
- Produce a migration report.
- Only write changes after dry-run output is clean.
- Keep or snapshot legacy data until validation confirms that no values were lost.

## Data Mapping

### Page Title

Old form:

```ts
title: "Artists"
```

New form:

```ts
title: {
  en: "Artists"
}
```

Mapping rule:

- If `title` is a string, move it to `title[defaultLocale]`.
- If `title` is already an object, keep it.
- If both old and new forms exist in any intermediate structure, keep the new localized value and report conflicting old values.

### Segment Label

Old form:

```ts
{
  targetSlug: "genre",
  label: "Genre",
  translations: {
    de: "Musikrichtung"
  }
}
```

New form:

```ts
{
  targetSlug: "genre",
  label: {
    en: "Genre",
    de: "Musikrichtung"
  }
}
```

Mapping rule:

- If `label` is a string, move it to `label[defaultLocale]`.
- If legacy `translations[locale]` exists, move it to `label[locale]`.
- If `label[locale]` already exists and differs from `translations[locale]`, keep `label[locale]` and report the conflict.
- Remove nested segment translations from the editor UI immediately after compatibility is in place.
- Do not delete legacy persisted fields until migration validation has passed.

## Fallback Behavior

When a localized value is missing for the active locale:

- The input value should remain empty.
- The fallback locale may be shown as placeholder or helper text.
- The fallback must not be written into the active locale unless the user explicitly edits or copies it.

Optional editor action:

```text
Copy from EN
```

This action writes the fallback value into the active locale intentionally.

## Implementation Tasks

### 1. Verify Current Data Flow

- [x] Read the current page editor implementation.
- [x] Read the segment manager implementation.
- [x] Read page editor state slices for meta, content, translations and segments.
- [x] Read bulk save diff construction.
- [x] Read backend page and segment persistence paths.
- [x] Identify every read/write path for `page.title`, `segment.label` and `segment.translations`.

Relevant known paths:

- `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx`
- `apps/dashboard/src/features/content/pages/SegmentManager.tsx`
- `apps/dashboard/src/features/content/pages/LanguageTabs.tsx`
- `apps/dashboard/src/features/content/state/slices/metaSlice.ts`
- `apps/dashboard/src/features/content/state/slices/translationsSlice.ts`
- `apps/dashboard/src/features/content/state/slices/segmentsSlice.ts`
- `apps/dashboard/src/features/content/state/diff.ts`
- `apps/backend/src/services/admin-content.ts`
- `apps/backend/src/services/admin-pages-bulk.ts`
- `apps/backend/src/db/adapters/postgres.ts`
- `packages/shared/src/content.ts`

#### Verified Findings

- `packages/shared/src/content.ts` currently models `ContentPage.title`, `ContentPageSummary.title`, `PageSegment.label` and `PageSegmentInput.label` as plain strings.
- `packages/shared/src/content.ts` already models `PageTranslation` and `PageSegment.translations`, so localized title and segment-label data already exists as parallel translation structures.
- `apps/backend/src/db/migrations/postgres/0018_i18n_content.sql` created `content_page_translations` and `page_segment_translations`, then seeded default-locale rows from existing `content_pages.title/content` and `page_segments.label`.
- `apps/backend/src/db/schemas/postgres.ts` confirms the source columns: `content_pages.title`, `content_pages.content`, `page_segments.label`, `content_page_translations.title/content`, and `page_segment_translations.label`.
- `apps/backend/src/services/admin-content.ts` maps page translations into `ContentPage.translations` and segment translations into `PageSegment.translations`.
- `apps/backend/src/services/admin-content.ts` public rendering already resolves non-default page title/content from `content_page_translations` and non-default segment labels from `page_segment_translations`.
- `apps/dashboard/src/features/content/pages/ContentEditorPage.tsx` currently localizes non-default page titles through `translationsSlice`; default title edits still update `meta.title`.
- `apps/dashboard/src/features/content/pages/SegmentManager.tsx` currently edits default segment label through `set-label` and non-default segment labels through nested per-row `set-translation`.
- `apps/dashboard/src/features/content/state/slices/segmentsSlice.ts` stores `label: string` plus optional `translations`, includes `set-translation`, and sends both through `toBulkSegmentsInput`.
- `apps/dashboard/src/features/content/state/diff.ts` sends dirty segments to `PagesBulkRequest.segments` and dirty page titles/content to `PagesBulkRequest.pageTranslations`.
- `apps/backend/src/services/admin-pages-bulk.ts` validates segment labels as strings and forwards segment `translations` into the repository payload.
- `apps/backend/src/db/adapters/postgres.ts` bulk save deletes and reinserts `page_segments`, then reinserts provided `page_segment_translations` for the newly created segment IDs.
- Existing persistence already supports the desired no-data-loss target without changing `slug`: keep `content_pages.slug` global, keep default locale in source columns, and keep non-default values in translation tables.

### 2. Define Shared Localization Helpers

- [x] Add or reuse a shared `LocalizedText` type.
- [x] Add `normalizeLocalizedText(input, defaultLocale)`.
- [x] Add `getLocalizedText(value, locale, fallbackLocale)`.
- [x] Add `setLocalizedText(value, locale, nextValue)`.
- [x] Add conflict reporting for mixed old/new values.
- [x] Cover helpers with tests for old, new, mixed and empty values.

#### Verification

- `pnpm --filter @musiccloud/shared typecheck`
- `pnpm --filter @musiccloud/shared test:run`

### 3. Normalize Page Titles

- [x] Normalize old string page titles into localized title objects.
- [x] Ensure normal pages and segmented pages use the same title handling.
- [x] Keep `slug` outside all locale-specific state.
- [x] Ensure language tab changes update the title input value.
- [x] Ensure save payload writes localized title data.
- [x] Add tests for title localization and slug stability.

#### Verification

- `pnpm --filter @musiccloud/shared build`
- `pnpm --filter @musiccloud/dashboard typecheck`
- `pnpm --filter @musiccloud/dashboard test:run -- src/features/content/__tests__/pageLocalization.test.ts src/features/content/state/__tests__/diff.test.ts src/features/content/state/__tests__/slices/metaSlice.test.ts`
- `pnpm exec biome check apps/dashboard/src/features/content/pageLocalization.ts apps/dashboard/src/features/content/__tests__/pageLocalization.test.ts apps/dashboard/src/features/content/pages/ContentEditorPage.tsx apps/dashboard/src/features/content/state/slices/metaSlice.ts apps/dashboard/src/features/content/state/__tests__/slices/metaSlice.test.ts apps/dashboard/src/features/content/state/__tests__/diff.test.ts .codex/plans/open/2026-05-16-page-editor-localized-titles-and-segments.md`

### 4. Normalize Segment Labels

- [ ] Change segment state so `segment.label` is a localized value.
- [ ] Import legacy `segment.translations` into `segment.label`.
- [ ] Remove the `set-translation` segment action if no longer needed.
- [ ] Remove dirty tracking for nested segment translations if no longer needed.
- [ ] Ensure segment reorder, move, add and remove keep localized labels intact.
- [ ] Add tests for legacy segment translation migration.

### 5. Update Segment Manager UI

- [ ] Remove per-segment `TRANSLATIONS` expand/collapse UI.
- [ ] Render one segment label input per segment.
- [ ] Bind the input to the active top-level locale.
- [ ] Show fallback as placeholder or helper state only.
- [ ] Keep segment slug/target visible as technical context if the existing UI already does that.
- [ ] Confirm language tab switching changes segment label values without changing slug or target.

### 6. Backend And Persistence

- [ ] Verify current database shape for titles, page translations and segment translations.
- [ ] Decide whether localized page title lives directly on `content_pages.title`, in existing page translation rows, or through a compatibility mapper.
- [ ] Decide whether localized segment labels live directly in `page_segments.label` as JSON or in an existing translation table.
- [ ] Prefer the existing persistence pattern if one already exists.
- [ ] Keep old reads working during the compatibility phase.
- [ ] Ensure public content APIs return title and segment labels for the requested locale.
- [ ] Ensure admin APIs return enough localized data for the editor.

### 7. Persistent Migration

- [ ] Add dry-run support.
- [ ] Add write mode.
- [ ] Produce a report with migrated pages, migrated titles, migrated segment labels, conflicts and skipped records.
- [ ] Validate before and after counts.
- [ ] Validate that all old text values are represented in the new structure or explicitly reported as conflicts.
- [ ] Keep a backup/snapshot strategy appropriate for the actual persistence layer.

### 8. Tests And Gates

- [ ] Unit tests for localization helpers.
- [ ] Unit tests for title normalization.
- [ ] Unit tests for segment label normalization.
- [ ] State tests for language switching.
- [ ] Save payload tests for global slug plus localized texts.
- [ ] Migration tests for old, new and mixed data.
- [ ] Backend tests for admin load/save if persistence changes.
- [ ] Public API tests for locale-specific title and segment labels if affected.
- [ ] Run the project's usual typecheck, lint and test gates.

## Acceptance Criteria

- Normal pages support localized titles.
- Segmented pages support localized titles.
- Segment labels are localized through the top-level language tabs.
- There is no nested per-segment translations UI.
- `slug` remains a single global field for all languages.
- Switching language tabs never changes `slug`.
- Existing pages open correctly after the change.
- Existing page titles are preserved.
- Existing segment labels and segment translation values are preserved.
- Segment order and ownership are preserved.
- Migration can run repeatedly without producing additional changes.
- Migration conflicts are reported and not silently overwritten.
- Saving and reopening a page shows the same localized values.

## Risks

- Existing persisted data may contain multiple legacy shapes.
- Page title localization may already be partly represented through existing translation rows.
- Segment translations may be stored in more than one layer.
- Frontend preview/public rendering may still expect string titles or string segment labels.
- Removing nested segment translation state may require careful dirty-state cleanup.

## Implementation Notes

- Do not start by deleting legacy fields.
- First make the editor and APIs tolerant of old and new data.
- Only after compatibility and tests are in place should persistent migration write changes.
- Keep the migration report human-readable.
- Keep code, tests and commit messages in English.
