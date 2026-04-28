# Cache architecture: static vs dynamic

This document explains how the resolver cache splits canonical entity
data from time-sensitive preview URLs. Read this before changing
`resolver.ts`, `album-resolver.ts`, or any persistence path that
touches `tracks` / `albums` / `artists`.

## The split

| Layer | Volatility | Storage | Read freshness |
| --- | --- | --- | --- |
| Canonical entity | static — set on first observation, only updated by a higher-confidence resolve | `tracks` / `albums` / `artists` | always fresh; cache hit wins |
| Cross-service link | static — once a track is on Service X with URL Y, that mapping does not change | `service_links` / `album_service_links` / `artist_service_links` | always fresh; cache hit wins |
| External-id observation | static — a single `(entity, id_type, id_value, source_service)` tuple, immutable once observed | `track_external_ids` / `album_external_ids` / `artist_external_ids` (migration 0019) | always fresh |
| Preview URL | **dynamic** — Deezer signs with `hdnea=exp=<unix>`; other CDN URLs are permanent | `track_previews` / `album_previews` (migration 0021) | per-row `expires_at` drives lazy refresh |
| Reach numbers (popularity / followers / listeners) | dynamic | **not persisted** — rendered fresh per request | request-time only |

## Why the split exists

Pre-migration the whole `tracks` row was treated as cache-with-TTL:
`Date.now() - tracks.updated_at > 48h` ⇒ invalidate the row, re-query
every adapter, refresh everything. The TTL existed only because of
*one* genuinely time-sensitive field (the signed Deezer preview URL),
but it expired *the entire row* — title, ISRC, MBID, label, releaseDate
— even though those don't change.

Migration 0021 moved the signed URL to its own table with a real
`expires_at` per row. The canonical row no longer needs a TTL because
nothing on it expires.

## Read path (resolver.ts)

`tryCache` (`apps/backend/src/services/resolver.ts:tryCache`):

1. Look up by URL or ISRC. Miss ⇒ return null (the resolver runs the
   full pipeline).
2. Hit ⇒ return the cached row immediately. **Do not check
   `updated_at` against a TTL.** Cache hit is always served as fresh.
3. Map the persisted links into `ResolvedLink[]`.

`fillMissingServices`:

1. `isPreviewRefreshNeeded(cached)` queries `track_previews` for the
   cached track. Returns `true` only when there is no preview row at
   all OR every persisted preview's `expires_at` is in the past.
2. Only when refresh is needed: include the Deezer adapter in the
   gap-fill set so it returns a fresh signed URL.
3. After gap-fill, `upsertTrackPreview` writes one row per service
   that produced a preview, with `expires_at` parsed via
   `getPreviewExpiry(url, service)`.

`album-resolver.ts:tryAlbumCache` follows the same pattern; the
album-level preview path is rarely exercised today and is kept simple.

## Write path (routes/resolve.ts)

`persistTrackAndRespond`:

1. `persistTrackWithLinks` writes the canonical row + service links +
   short URL in one transaction. The legacy `tracks.preview_url`
   column is still written here as part of the **dual-write phase**
   (migration 0021 keeps the column; migration 0022 drops it).
2. After the canonical write, `upsertTrackPreview` is called for each
   `ResolvedLink.previewUrl` and once for the source-track's own
   preview. Each call computes `expires_at` via
   `getPreviewExpiry(url, service)`.
3. `addTrackExternalIds` writes the aggregation triples.

The two-step rollout (PR 1 dual-writes, PR 2 drops the column) keeps
the deploy safe: if PR 1 needs to be rolled back, the old column is
still authoritative; data is not lost.

## Where things live

- Schema: `apps/backend/src/db/schemas/postgres.ts:trackPreviews` /
  `albumPreviews`.
- Migration: `apps/backend/src/db/migrations/postgres/0021_track_album_previews.sql`.
- Repo helpers:
  `findTrackPreviews(trackId)` / `upsertTrackPreview(trackId, observation)`
  on `TrackRepository`. Postgres adapter implementation in
  `apps/backend/src/db/adapters/postgres.ts` under the
  *PREVIEW URLS (TrackRepository)* section.
- Expiry parser: `apps/backend/src/lib/preview-url.ts`. Extend
  `getPreviewExpiry(url, service)` when a new service starts signing
  preview URLs; today only Deezer does.
- Resolver entry points using the new path:
  `tryCache`, `fillMissingServices`, `isPreviewRefreshNeeded` in
  `services/resolver.ts`; `tryAlbumCache` in `services/album-resolver.ts`.

## What `CACHE_TTL_MS` does now

After this migration `CACHE_TTL_MS` is no longer used by the resolver
read path. It still drives `cleanupStaleCache(ttlMs)` in
`apps/backend/src/db/adapters/postgres.ts`, an admin-side housekeeping
job that prunes rows beyond the configured age. That use is unrelated
to read freshness — it is purely a storage-cost lever. Treat the
constant as "garbage collection age", not "freshness window".

## When to invalidate the canonical row

Today: never automatically. The canonical row is updated only when a
higher-confidence resolve produces different values (e.g. a Spotify
URL was first persisted with one ISRC, a later resolve via Apple Music
finds a different ISRC; `persistTrackWithLinks` overwrites the row in
that case).

Future hooks (out of scope of the static-vs-dynamic plan):

- Admin "manual override" UI to fix a wrong title.
- MBID-driven canonicalisation (when MusicBrainz reports a different
  recording MBID for the same ISRC, a merge job rewrites the
  canonical row to the MB-blessed values).

Both are tracked as out-of-scope items in the static-vs-dynamic plan.

## Testing the split

- Unit: `tryCache` returns the cached row regardless of `updated_at`
  age (test in `__tests__/resolver.test.ts`).
- Integration (requires `DATABASE_URL`): mirror
  `external-ids-repo.integration.test.ts` for `track_previews` —
  upsert by `(track_id, service)`, verify `ON CONFLICT REPLACE`,
  verify `expires_at` round-trips.
- Manual smoke: resolve a Spotify track, fake-tick `updated_at`
  backwards in DB, resolve again — cache hit, no upstream calls,
  preview refresh fires only when the `track_previews` row is
  expired.
