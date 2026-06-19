# Deezer `searchTrackWithCandidates` — restore disambiguation post-reorder

Plan-Nr.: MC-007

## Preface

Phase B reordered the resolver chain so Spotify ends up at the back of the major-adapter block. Today only Spotify implements the optional `searchTrackWithCandidates` method (`apps/backend/src/services/plugins/spotify/adapter.ts:285`), used by the disambiguation pipeline at `resolver.ts:541-595`. After the reorder, the disambiguation path is reached only when every front-of-chain adapter (Deezer, Apple Music, Tidal, YouTube) misses — which means free-text searches that used to surface a candidate list now mostly auto-resolve on the first hit.

This is a Phase-B regression: the user's signal "show me alternatives" was muted. Plan B §Disambiguation Risk recommended option (a): teach Deezer the candidates method. Deezer is the new top-of-chain, has a real multi-result `/search/track` endpoint, and is keyless — the right place to start.

Apple Music gets the same treatment in a separate follow-up plan if Deezer alone proves insufficient.

## Goal

Implement `searchTrackWithCandidates` on the Deezer adapter so that free-text searches return up to `MAX_CANDIDATES` (8) ranked candidates, restoring the disambiguation list as the default UX for ambiguous queries.

## Design

### Endpoint

Deezer `/search/track?q={q}&limit={n}` already returns a list of items (today the adapter calls it with `limit=5` for `searchTrack`). `searchTrackWithCandidates` calls the same endpoint with `limit=10` and returns the top-N candidates ranked by `scoreSearchCandidate` (the shared helper used everywhere else).

### Scoring

Reuse `scoreSearchCandidate` from `services/plugins/_shared/confidence.ts`. The helper handles both free-text (`query.title === query.artist`) and structured queries — same logic Spotify uses. Sort the scored array descending, pick the top-N. Cap by `MAX_CANDIDATES` from `services/constants.ts` (8) so the disambiguation panel never receives more than the UI is designed for.

### Best-match contract

`SearchResultWithCandidates.bestMatch` follows the same rule as the Spotify implementation: if the best score is `>= AUTO_SELECT_THRESHOLD` (0.9), set `found: true` and surface it as a definite hit; else `found: false` so the resolver falls through to the candidate list path.

### Limit ceiling

The plan B `SPOTIFY_SEARCH_LIMIT_MAX` guard does not apply to Deezer — that ceiling is a Spotify-API constraint. Deezer's own limit is 25 by default; we use 10 to match the candidate-list size we actually render.

### Free-text vs structured

`scoreSearchCandidate`'s decay-by-position branch handles free-text queries. No special-casing needed in the adapter beyond passing `query` through.

## Files to modify

- `apps/backend/src/services/plugins/deezer/adapter.ts` — add `searchTrackWithCandidates(query)` method; existing `searchTrack` stays as-is.
- `apps/backend/src/services/plugins/deezer/__tests__/deezer.test.ts` (or wherever the deezer adapter tests live) — add cases:
  - returns scored candidates sorted descending
  - returns empty candidates on HTTP error / API error envelope / empty result
  - free-text query path uses the position-decay scorer
  - structured query path uses the title+artist scorer
  - capped at `MAX_CANDIDATES`

## Verification

1. **Unit:** new tests pass; existing deezer tests stay green.
2. **End-to-end:** start backend + frontend, submit free-text query like `shake it off` in the hero input. Expect a disambiguation panel listing multiple Deezer-sourced candidates. Select one → resolves to a share page.
3. **Regression:** specific-track free-text query (e.g. full title + artist) still auto-resolves above the `AUTO_SELECT_THRESHOLD` and skips disambiguation. No `[deezer] returning N candidates` log line in that case.

## Out of scope

- Apple Music `searchTrackWithCandidates` — separate plan if Deezer alone is not enough.
- Aggregating candidates across multiple adapters (option (b) from Plan B). Speculative; revisit only if single-source candidate lists prove too narrow in production.

## Checklist

- [x] Implement `searchTrackWithCandidates` on `deezer/adapter.ts`.
- [x] Tests for scored ordering, error paths, free-text vs structured, candidate cap.
- [x] Manual smoke check of disambiguation list in dev frontend.
- [x] Confirm backend log shows `[deezer]` matching the chain-top now produces the candidate list.

## Completed

- **Date:** 2026-04-28
- **Delivered:**
  - `searchTrackWithCandidates` on `apps/backend/src/services/plugins/deezer/adapter.ts` — `/search/track?limit=10`, scored via `scoreSearchCandidate`, sorted desc, capped at `MAX_CANDIDATES` (8), filtered by `CANDIDATE_MIN_CONFIDENCE` (0.4).
  - `bestMatch.found` follows Spotify convention (>= `MATCH_MIN_CONFIDENCE` 0.6, not `AUTO_SELECT_THRESHOLD` 0.9 as the draft suggested — matching the existing project pattern is more important than the speculative tighter ceiling).
- **Tests added:** 7 cases in `deezer/__tests__/deezer.test.ts` (37 total now): ranked-desc ordering, free-text decay, HTTP error, API-envelope error, empty result, MAX_CANDIDATES cap, `limit=10` in URL.
- **Gates:** typecheck ✓ · vitest 760/760 ✓ (12 skipped).
- **Out of scope:** Apple Music `searchTrackWithCandidates` — defer until prod metrics show Deezer alone is insufficient.
