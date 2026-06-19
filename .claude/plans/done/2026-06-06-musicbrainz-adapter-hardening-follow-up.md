# Follow-up: MusicBrainz Adapter Hardening

Plan-Nr.: MC-015

## Context

`.claude/plans/done/2026-04-28-musicbrainz-adapter.md` is largely implemented: MusicBrainz is registered as a hidden/default-disabled service, the adapter covers MBID/ISWC/ISNI, URL detection, ISRC/UPC/search, and the rate gate exists.

Open points found during review:

- `apps/backend/docs/musicbrainz-runbook.md` did not exist.
- 503 retry handling was not clearly implemented.
- malformed JSON handling was not clearly defensive because adapter code called `response.json()` directly.
- Release-group album URLs were detected but not resolvable through `getAlbum()`.

## Goal

Harden the MusicBrainz adapter enough that the plan can stay in `done` without unresolved operational gaps.

## Tasks

- [x] Add `apps/backend/docs/musicbrainz-runbook.md` covering user agent, rate limits, default-disabled behaviour, enablement, and troubleshooting.
- [x] Audit all MusicBrainz `response.json()` call sites.
- [x] Add a small JSON parsing helper if the adapter needs consistent malformed-response handling.
- [x] Implement bounded retry/fallback behaviour for transient 503 responses if missing.
- [x] Add release-group fallback for detected album URLs.
- [x] Add tests for 503 responses, malformed JSON, rate-gate behaviour, and normal successful lookups.
- [x] Confirm the adapter still remains hidden/default-disabled unless explicitly enabled.

## Verification

- [x] `rg "musicbrainz-runbook" apps/backend/docs .claude/plans` finds the runbook.
- [x] MusicBrainz adapter tests cover transient failures and malformed payloads.
- [x] Backend typecheck and relevant plugin tests are green.

## Completed

- **Date:** 2026-06-06
- **Delivered:** Runbook, bounded MusicBrainz 503 retry, defensive JSON parsing, release-group album fallback, and hidden/default-disabled regression tests.
- **Gates:** `pnpm --filter @musiccloud/backend test:run musicbrainz`, `pnpm --filter @musiccloud/backend test:run external-ids`, `pnpm --filter @musiccloud/backend typecheck`.
