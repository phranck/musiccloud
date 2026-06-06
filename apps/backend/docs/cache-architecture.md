# Cache Architecture

Last reviewed: 2026-06-06

## Static Entity Rows

`tracks`, `albums`, and their cross-service link tables are the canonical cache
for resolved music entities. Track and album cache hits are treated as fresh
regardless of `updated_at`; the resolver no longer invalidates a whole entity
row just because time passed.

Static fields include title, artists, ISRC, UPC, MBID, duration, release date,
label, artwork, source service, and source URL. They change only when a later
explicit persistence path updates canonical metadata.

## Dynamic Preview Rows

Audio preview URLs are the volatile part. They live in separate per-service
tables:

- `track_previews`
- `album_previews`

Each row stores one `(entity, service)` preview URL with:

- `url`
- `expires_at`
- `observed_at`

`expires_at = null` means the URL has no known expiry and is treated as fresh.
Deezer signed preview URLs expose an `hdnea=exp=<unix>` token; the resolver
parses that through `getPreviewExpiry()` and persists the timestamp.

## Read Path

Track cache reads:

1. Load the canonical `tracks` row and service links.
2. Load preview rows from `track_previews`.
3. Prefer a fresh Deezer preview when available.
4. Refresh Deezer lazily only when no preview row exists or all preview rows
   are expired.

Album cache reads mirror the same model through `album_previews`. The cached
album row stays fresh, while the Deezer album preview can be refreshed without
invalidating album metadata or service links.

## Write Path

Track persistence writes canonical track/link data first, then stores every
observed link preview through `upsertTrackPreview()`. Album persistence stores
the selected album preview through `upsertAlbumPreview()`.

Upserts are keyed by `(entity_id, service)`, so a refreshed Deezer URL replaces
the previous Deezer URL instead of adding duplicate preview rows.

## Migrations

The split landed in two schema steps:

- `0021_track_album_previews.sql` created `track_previews` and
  `album_previews`, then backfilled from legacy `preview_url` columns.
- `0022_drop_legacy_preview_url.sql` removed `tracks.preview_url` and
  `albums.preview_url` after the application read from preview tables.

The current schema source is `apps/backend/src/db/schemas/postgres.ts`.

## TTL Scope

`CACHE_TTL_MS` is no longer part of the track or album resolver freshness
decision. It still appears in artist-related cache code, which is a separate
surface: artist profile/top-track/event data includes request-time or
externally volatile information and was intentionally not folded into the
track/album preview-table split.

## Verification

Relevant local checks:

```bash
pnpm --filter @musiccloud/backend test:run resolver.test.ts album-resolver.test.ts preview-url
pnpm --filter @musiccloud/backend test:run track-previews-repo.integration.test.ts
pnpm --filter @musiccloud/backend typecheck
```

The integration test runs only when `DATABASE_URL` points at a local or
test-named database. It creates unique test track/album rows and deletes those
same rows afterward.
