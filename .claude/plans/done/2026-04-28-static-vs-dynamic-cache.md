# Static-vs-Dynamic Cache Separation

Plan-Nr.: MC-009

## Preface

Phase A built the `*_external_ids` aggregation. Phase B + MusicBrainz adapter populated it with cross-service identifiers and MBIDs. The DB is now ready to become musiccloud's actual asset — a canonical, growing entity store, not a 48-hour-TTL cache that resets itself.

The blocker today is `CACHE_TTL_MS = 48h` (`apps/backend/src/lib/config.ts:2`). Every cached entity expires together: `tracks`, `albums`, `artists`. On expiry, the whole row is re-resolved end-to-end — even though only one field on the row was actually time-sensitive (the signed Deezer preview URL). Title, ISRC, MBID, durationMs, releaseDate, label do not change between resolves; refreshing them costs API quota with zero data improvement.

This plan separates the row into two halves:

- **Static** = canonical truth. Persisted forever. Set on first observation, only updated by an explicit re-canonicalisation (e.g. user-reported correction, MBID merge). Reads always hit cache; cache hit = fresh.
- **Dynamic** = decay-prone. Persisted only as long as a freshness window allows; refreshed lazily on read when expired; never used to invalidate the static row.

This unlocks:

- The crawler plan (proactive ingestion across services). Crawlers write the same canonical row repeatedly; without a TTL, they no longer fight a 48 h reset loop.
- API monetisation. Paid responses must be deterministic — same answer for the same canonical entity until the entity itself changes. Today every 48 h the answer churns even for IDs that never moved.
- Cleaner data lineage. The `*_external_ids` table records *who told us what*, with `observed_at` per observation. Pairing it with a static-only row means the canonical entity has a clear story: "first seen 2026-03-04, ISRC observed by spotify+deezer+apple, MBID observed by musicbrainz".

## Goal

Drop the blanket 48 h TTL on entity reads. Move the only genuinely time-sensitive field (signed preview URLs) to a dedicated table with per-row freshness. After this plan, a cache hit on `tracks` / `albums` is always treated as fresh; preview URLs are refreshed lazily on demand.

## Design

### What is actually dynamic in this codebase

Audit of every column on `tracks` / `albums` / `artists`:

| Column | Volatility | Action |
| --- | --- | --- |
| `id`, `created_at` | static (forever) | keep as-is |
| `title`, `artists`, `album_name`, `isrc`, `upc`, `release_date`, `duration_ms`, `is_explicit`, `total_tracks`, `label`, `genres`, `image_url`, `name` | static (canonical) | keep, never invalidate |
| `artwork_url` | mostly static; some adapters serve signed URLs but Deezer / Apple Music / Spotify CDNs do not, and we already prefer the unsigned variants | keep as-is, no separate refresh path |
| `preview_url` (`tracks`, `albums`) | **dynamic** — Deezer signs with `hdnea=exp=` query param, expires after 24-72 h depending on token; other services serve permanent URLs | **move out** |
| `source_service`, `source_url` | static (the URL that first introduced the entity) | keep as-is |
| `updated_at` | currently used as TTL anchor; will lose that role | keep field, repurpose as "last static-field touch" only (never read by the resolver for freshness decisions) |

Outside the entity tables, dynamic-but-not-currently-persisted data:

- `popularity` / `followers` (Spotify post-Feb-2026: `null`; replacements via Last.fm `listeners` / Deezer `nb_fan`) — handled in `services/artist-info.ts`, NOT persisted today. **Stays not persisted.** `ArtistProfile` is built fresh on every share-page render; the share page already accepts `null` for both fields.
- Last.fm `scrobbles` / `bioSummary` / `similarArtists` — same, not persisted.
- Bandsintown / Ticketmaster events — short-lived by definition, not persisted.

Conclusion: the only field this plan touches is `preview_url`.

### New tables: `track_previews` + `album_previews`

```sql
CREATE TABLE "track_previews" (
  "id"             text PRIMARY KEY NOT NULL,
  "track_id"       text NOT NULL REFERENCES "tracks"("id") ON DELETE CASCADE,
  "service"        text NOT NULL,                                    -- emitter (deezer / spotify / apple-music / ...)
  "url"            text NOT NULL,
  "expires_at"     timestamptz,                                      -- null = never expires (e.g. Spotify CDN URL)
  "observed_at"    timestamptz NOT NULL,
  CONSTRAINT "uq_track_previews_track_service" UNIQUE ("track_id", "service")
);

CREATE INDEX "idx_track_previews_track" ON "track_previews"("track_id");
CREATE INDEX "idx_track_previews_expires_at" ON "track_previews"("expires_at") WHERE "expires_at" IS NOT NULL;
```

Same shape for `album_previews(album_id ...)`.

`UNIQUE(track_id, service)` keeps one preview URL per (track, service) pair. The resolver chain already produces at most one preview per service; replacing on conflict (`ON CONFLICT DO UPDATE`) keeps the table small.

The `expires_at IS NOT NULL` partial index makes the "find expired previews" sweep cheap, in case a future background job wants to refresh proactively (out of scope here, but the index is free).

### Why a partial index, not a full one

Most services serve permanent URLs (Spotify CDN, Apple Music, Tidal) — those rows have `expires_at = null` and account for the majority. The partial index excludes them and only scans the Deezer (and any future signed-URL services) rows.

### What the resolver does on read

`resolver.ts:tryCache` and `album-resolver.ts:tryAlbumCache` change as follows:

1. Drop the `Date.now() - cached.updatedAt > CACHE_TTL_MS` check entirely. Cache hit = fresh.
2. After loading the entity, fetch `track_previews` rows for that track. Pick the row whose `service` matches the source-service preferred order (Deezer first, then any other).
3. If the picked row's `expires_at` is in the past (or the URL parses as expired via `isExpiredDeezerPreviewUrl`), trigger the existing Deezer-preview refresh path (`resolver.ts:301-313`) and replace the row.
4. Set `cached.sourceTrack.previewUrl` to the picked URL (or `null` if no preview row exists).
5. Continue with the existing `fillMissingServices` flow.

The current `fillMissingServices` already handles the "preview missing → fetch Deezer" path. After this plan it triggers under a stricter condition (only when the preview row is genuinely expired or absent) instead of every 48 h.

### `CACHE_TTL_MS` removal

`apps/backend/src/lib/config.ts:2` exports `CACHE_TTL_MS`. After this plan:

- `tryCache` and `tryAlbumCache` no longer reference it.
- `fetchArtistProfile` / `fetchArtistTopTracks` (artist-info) never persisted, so they are unchanged.
- The constant stays in `config.ts` with a comment narrowing its purpose to "preview-URL freshness fallback for unsigned previews" — used as a default `expires_at` when the URL has no parseable expiry but the service is suspected to rotate them. Default to 7 days; only Deezer signs preview URLs today, so the constant rarely matters and can later be removed entirely. Kept for now to avoid an unrelated config rewrite.

### Backfill

Existing `tracks.preview_url` and `albums.preview_url` columns are populated. The migration:

1. `INSERT INTO track_previews SELECT ... FROM tracks WHERE preview_url IS NOT NULL` — `service = source_service` (best guess; the column doesn't carry per-service emitter info today). `expires_at` parsed via `getDeezerPreviewExpiry` for Deezer URLs, `null` otherwise.
2. Same for `album_previews`.
3. Drop the `preview_url` column from `tracks` and `albums` (separate migration, after the application has rolled out and stopped writing to it — two-step migration to avoid a deploy gap).

Two-step deploy:
- **Migration 0020:** Create `track_previews` / `album_previews`, backfill from existing `preview_url` columns, but **leave** the columns in place. The application reads from the new tables and dual-writes (writes to both during persist) for one release.
- **Migration 0021:** Drop the `preview_url` columns once the dual-write release is stable in prod.

Splitting the migration prevents a "old code in flight, new schema mid-deploy" race during the rollout.

### Repository layer changes

`apps/backend/src/db/adapters/postgres.ts`:

- New helpers: `findPreviewForTrack(trackId, service)`, `upsertTrackPreview(trackId, service, url, expiresAt)`, `findPreviewForAlbum`, `upsertAlbumPreview`.
- `persistTrackWithLinks` extends to take `previewObservations: Array<{service, url, expiresAt?}>` and writes them via the upsert helper. Backwards-compatible: if the array is empty, no preview rows written.
- `loadCachedTrack` / equivalents return `{ track, links, trackId, previews: PreviewRow[] }`. Resolver picks the preview to set on `track.previewUrl`.

The Drizzle in-memory adapter (`apps/backend/src/db/adapters/memory.ts` if present) gets the same surface so the integration tests still pass without `DATABASE_URL`.

### Tests

- `external-ids-repo.integration.test.ts` already exercises Postgres paths under `DATABASE_URL`. Add `track-previews-repo.integration.test.ts` mirroring it.
- Unit: `preview-url.test.ts` already covers `getDeezerPreviewExpiry` / `isExpiredDeezerPreviewUrl` — extend with an `expiresAt`-from-URL helper if not already extracted.
- Resolver-level: unit-test the new "cache hit + expired preview triggers refresh" path, plus the "cache hit + fresh preview returns immediately" path.
- Update existing `resolver.test.ts` cache-expiry tests: those tests asserted the 48 h TTL behaviour. Replace with assertions that confirm the static row is always returned and the preview-refresh path fires when expected.

### Telemetry

After this lands, watch:

- `track_previews` row count growth — confirms backfill + dual-write.
- Deezer call count post-rollout. Should drop sharply once the 48 h blanket refresh is gone — only expired previews now trigger a fetch.
- `tracks.updated_at` distribution — should stabilise (rows touched only on canonical-field updates, not on every 48 h re-resolve).

## Implementation

### New files

- `apps/backend/src/db/migrations/postgres/0020_track_album_previews.sql` (Drizzle-generated).
- `apps/backend/src/db/migrations/postgres/0021_drop_preview_url_columns.sql` (Drizzle-generated, separate migration applied after dual-write release is stable).
- `apps/backend/src/__tests__/track-previews-repo.integration.test.ts` (mirrors `external-ids-repo.integration.test.ts` shape).

### Files to modify

- `apps/backend/src/db/schemas/postgres.ts` — add `trackPreviews` + `albumPreviews` Drizzle tables; keep `previewUrl` on `tracks`/`albums` for migration 0020, drop in 0021.
- `apps/backend/src/db/adapters/postgres.ts` — preview upsert + lookup helpers; extend `loadCachedTrack` / `findTrackByUrl` / `findTrackByIsrc` and `findAlbumByUrl` / `findAlbumByUpc` return shapes; persist helpers dual-write to `tracks.preview_url` and `track_previews` until 0021.
- `apps/backend/src/db/adapters/memory.ts` — same surface for the in-memory test adapter (if present).
- `apps/backend/src/services/resolver.ts:217-242` (`tryCache`) — drop TTL gate, integrate preview lookup.
- `apps/backend/src/services/resolver.ts:244-330` (`fillMissingServices`) — preview refresh runs only on `expires_at` past, not on every cache hit.
- `apps/backend/src/services/album-resolver.ts:152-176` (`tryAlbumCache`) — same edits.
- `apps/backend/src/services/album-resolver.ts:178-230` (`fillMissingAlbumServices`) — same.
- `apps/backend/src/lib/config.ts` — narrow the comment on `CACHE_TTL_MS` to the preview-fallback-default role described in §`CACHE_TTL_MS` removal.
- `apps/backend/src/lib/preview-url.ts` — add `getPreviewExpiry(url, service)` that returns `Date | null` for any service (currently only Deezer parses an expiry).
- Test files: replace TTL-focused tests with static-cache assertions; add new preview-row tests.

### Two-step rollout sequence

1. **PR 1:** schema migration 0020, application reads/writes new tables, dual-writes to old columns. `CACHE_TTL_MS` gate removed; resolver always serves cache hits.
2. **PR 2** (after PR 1 is stable in prod for at least one release cycle): migration 0021 drops `tracks.preview_url` / `albums.preview_url`. Application code stops dual-writing.

If anything goes wrong between PR 1 and PR 2 (rollback PR 1), the old columns are still there; data is not lost.

## Verification

### Unit

- `tryCache` returns the cached track when present, regardless of `updated_at` age — a track with `updated_at = 2024-01-01` still hits.
- `tryCache` triggers a Deezer preview refresh when the `track_previews` row's `expires_at` is in the past, replacing the URL on the response.
- `tryCache` does not trigger any refresh when the preview is fresh (`expires_at` in the future) or has `expires_at = null`.
- Backfill: row in `tracks` with `preview_url` set, `track_previews` empty → migration emits one `track_previews` row with the right `expires_at`.
- `persistTrackWithLinks` writes one `track_previews` row per emitting service; conflicting (track_id, service) replaces the URL.

### Integration (with `DATABASE_URL`)

- Resolve a Spotify track URL twice in succession; second call goes through `tryCache`, returns the same `tracks` row id, and DOES NOT trigger any external HTTP (instrument with a fetch spy) because the preview is fresh.
- Manually expire a `track_previews` row via SQL, resolve again — exactly one Deezer fetch, preview row updated, response carries the new URL.
- Confirm `tracks.updated_at` is unchanged across the two resolves of the same track.

### Manual smoke

- Resolve a Spotify track. Wait > 48 h (or fake-tick `updated_at` backwards in DB). Resolve again. Pre-plan: full cross-service refresh fires. Post-plan: cache hit, no upstream calls, only the preview refresh if its `expires_at` happens to be past.

## Out of scope

- Background preview-refresh worker. Today refreshes happen lazily on read; a periodic sweep that pre-warms expired rows can come later if the read-path latency becomes noticeable.
- Static-row "manual override" UI in the admin (e.g. fix a wrong title). Possible but out of scope; for now the static row is updated only when a higher-confidence resolve reports a different value.
- Surface `popularity` / `followers` / `listeners` in any persisted form. They stay request-time only.
- `services_links.url` row freshness. Cross-service links never expire today; this plan does not change that.
- AcoustID-Fingerprint workflow.

## Checklist

### Schema + repo
- [x] Add `trackPreviews` + `albumPreviews` to `db/schemas/postgres.ts`.
- [x] Generate preview-table migration with `pnpm db:generate`; apply locally with `pnpm db:migrate` (landed as `0021_track_album_previews.sql` after numbering drift).
- [x] Repo upsert + lookup helpers for both tables.
- [x] `loadCachedTrack` / equivalents include preview rows in their return shape.
- [x] `persistTrackWithLinks` / album equivalent dual-writes during PR 1.

### Resolver
- [x] Drop `CACHE_TTL_MS` gate in `tryCache` + `tryAlbumCache`.
- [x] Integrate per-service preview lookup with expiry-driven refresh.
- [x] `fillMissingServices` no longer triggers Deezer-preview-refresh on every hit; only on actual expiry.
- [x] Generalised `getPreviewExpiry(url, service)` helper in `lib/preview-url.ts`.

### Tests
- [x] Replace existing TTL-based assertions in `resolver.test.ts` / `album-resolver.test.ts`.
- [x] New unit tests for the cache-hit + expiry-driven refresh paths.
- [x] New integration test `track-previews-repo.integration.test.ts`.

### Rollout
- [x] **PR 1 — schema 0021 + dual-write + resolver changes.** Committed `08504fea` (2026-04-28).
- [x] **PR 2 — schema 0022 dropping `preview_url` columns + remove dual-write.** Committed `baa9e4c5` (2026-04-28). Adapter reads previews via scalar subquery from `track_previews` / `album_previews` (Deezer preferred). `updatePreviewUrl` removed; callers use `upsertTrackPreview`. Album resolve now persists into `album_previews`.
- [x] Verify in prod: Deezer call rate drops, `tracks.updated_at` distribution stabilises. (Closed as historically waived during rollout per user direction; not re-run in the 2026-06-06 local code audit.)

### Docs
- [x] `apps/backend/docs/cache-architecture.md` (new) — document the static / dynamic split, the two-step migration, the TTL semantics for future plan authors.

## Current-code audit 2026-06-06

This plan was in `done/` but still showed 13% because most implementation
checkboxes were left open even though the main two-PR rollout had already
landed. A current-code audit on 2026-06-06 rechecked every checklist item
against the repository and completed the missing local follow-up work.

Confirmed against current code:

- `trackPreviews` and `albumPreviews` exist in `apps/backend/src/db/schemas/postgres.ts`.
- The generated migrations landed as `0021_track_album_previews.sql` and
  `0022_drop_legacy_preview_url.sql`. The original plan's `0020/0021`
  numbering drifted because `0020_external_ids_backfill.sql` already occupied
  the next slot.
- Repository interfaces and Postgres implementations expose
  `findTrackPreviews`, `upsertTrackPreview`, `findAlbumPreviews`, and
  `upsertAlbumPreview`.
- Track and album SELECTs project preview URLs from `track_previews` /
  `album_previews` instead of legacy entity columns.
- `tryCache` and `tryAlbumCache` no longer use `CACHE_TTL_MS`; cache hits on
  canonical track/album rows are always fresh.
- Track and album cache-hit flows now refresh Deezer previews only when no
  preview row exists or all preview rows are expired.
- `getPreviewExpiry(url, service)` is the service-aware helper; today it
  delegates to Deezer `hdnea=exp=` parsing and returns `null` for non-expiring
  URLs.
- `CACHE_TTL_MS` still appears in artist-related cache code. That is outside
  this plan's final track/album preview-table split because artists do not
  carry preview URLs and still have separate profile/top-track freshness
  semantics.

Follow-up completed during this audit:

- Added album cache-hit preview refresh for fresh vs. expired
  `album_previews` rows.
- Added unit tests for fresh/expired preview rows in both track and album
  cache-hit flows.
- Added `track-previews-repo.integration.test.ts`. It runs only against local
  or test-named databases, creates isolated random track/album rows, and
  deletes those rows after the test.
- Added `apps/backend/docs/cache-architecture.md`.

Verification on 2026-06-06:

- `pnpm --filter @musiccloud/backend test:run resolver.test.ts album-resolver.test.ts preview-url track-previews-repo.integration.test.ts` — passed; integration test skipped without a safe test `DATABASE_URL`.
- `pnpm --filter @musiccloud/backend typecheck` — passed.
- `pnpm lint` — passed.
