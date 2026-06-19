# Follow-up: Static-vs-Dynamic Cache Completion Check

Plan-Nr.: MC-016

## Context

`.claude/plans/done/2026-04-28-static-vs-dynamic-cache.md` is mostly implemented: `track_previews` and `album_previews` exist, legacy preview columns were dropped, and track cache refresh uses preview expiry instead of expiring the canonical track row.

The remaining ambiguity is album-preview refresh behaviour and stale documentation/comments around `CACHE_TTL_MS`.

## Goal

Confirm and close the remaining cache-separation gaps without changing database migrations manually.

## Tasks

- [x] Trace album preview loading and persistence from `apps/backend/src/services/album-resolver.ts` through the Postgres adapter.
- [x] Decide whether album previews need expiry-driven refresh equivalent to track previews.
- [x] If missing: implement album-preview expiry refresh with isolated tests.
- [x] Clarify `CACHE_TTL_MS` comments and usage. It should not imply track/album canonical rows expire if only artist cache still uses it.
- [x] Add or update focused tests for track and album cache behaviour.
- [x] Remove or update stale plan/docs references if they still describe the old unified cache TTL model.

## Verification

- [x] Track cache hits stay fresh while expired `track_previews` refresh lazily.
- [x] Album cache hits either refresh expired `album_previews` lazily or the plan documents why album previews do not require that path.
- [x] `rg "CACHE_TTL_MS" apps/backend/src .claude docs` shows no misleading comments.
- [x] Backend typecheck and relevant resolver tests are green.

## Completed

2026-06-06: Closed after a current-code audit against the repository.

- Confirmed `track_previews` / `album_previews` schema, migrations, Postgres repo helpers, and preview-table SELECT projections exist.
- Added album cache-hit preview refresh equivalent to the track path: cached album rows stay fresh, while missing or expired `album_previews` rows trigger a targeted Deezer refresh.
- Added focused unit tests for fresh and expired preview rows in both track and album cache-hit flows.
- Added `track-previews-repo.integration.test.ts` with a local/test-database guard and isolated random test data.
- Added `apps/backend/docs/cache-architecture.md`.
- Updated stale `CACHE_TTL_MS` comments so only artist cache remains described as TTL-based; track/album resolver freshness now points at preview tables.
- Updated `.claude/plans/done/2026-04-28-static-vs-dynamic-cache.md` to 100% with a `Current-code audit 2026-06-06` note.

Verification:

- `pnpm --filter @musiccloud/backend test:run resolver.test.ts album-resolver.test.ts preview-url track-previews-repo.integration.test.ts` passed; integration test skipped without a safe test `DATABASE_URL`.
- `pnpm --filter @musiccloud/backend typecheck` passed.
- `pnpm lint` passed.
