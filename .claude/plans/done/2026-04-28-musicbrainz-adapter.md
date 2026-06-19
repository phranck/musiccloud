# MusicBrainz Adapter — first canonical-identity source

Plan-Nr.: MC-008

## Preface

musiccloud is pivoting from "unified short-URL service" to "music search engine + data aggregator". The Phase A schema (`track_external_ids`, `album_external_ids`, `artist_external_ids` from migration 0019) and Phase B resolver-chain reorder both prepared the ground. The next load-bearing piece is the first source of **canonical identity that does not depend on any streaming platform**: MusicBrainz.

Why this is the right next step:

- **MBID is the only platform-independent canonical identifier** for recordings, releases, and artists. Every streaming service can rename, remove, or restrict access to its catalog; MBID is community-curated and outlives any single provider.
- **Schema is already wired.** `collectArtistExternalIds` in `apps/backend/src/services/external-ids.ts:83-94` literally has the comment *"The MusicBrainz adapter will start populating it without further changes here."* The Phase A `*_external_ids` tables accept arbitrary `idType` (`'mbid'`, `'iswc'`, `'isni'`, ...) without further migrations.
- **Brings data points the streaming adapters cannot provide:** Songwriter / composer (work relationships), producer credits, ISWC (composition-level identifier), recording-vs-work split, re-release / cover relationships, ISNI for artists, label catalog numbers.
- **Free, keyless, generous rate limit** (1 req/s with `User-Agent`). No auth secret to rotate, no Spotify-style risk of breaking changes.
- **Sets up MBID as the future canonical primary key** for the entity-DB split (next plan: static-vs-dynamic cache trennung).

This adapter is intentionally a metadata source, not a streaming target. It produces a `webUrl` pointing at `musicbrainz.org` — useful for power users and crawlers, hidden from the casual share UI by leaving it out of `SERVICE_DISPLAY_ORDER`.

## Spec / Goal

A new `services/plugins/musicbrainz/` adapter that:

1. **Looks up by ISRC** (`/ws/2/isrc/{isrc}?inc=...`) returning a `NormalizedTrack` with MBID + ISWC enrichment.
2. **Looks up by barcode/UPC** (`/ws/2/release?query=barcode:{upc}&fmt=json`) returning `NormalizedAlbum` with MBID + label-catalog-number.
3. **Looks up by MusicBrainz URL** (`musicbrainz.org/recording/...`, `/release/...`, `/artist/...`) for direct MBID resolves.
4. **Searches by title + artist** for the disambiguation chain (track + album + artist).
5. **Carries MBID + ISWC + label info** through the existing `*_external_ids` aggregation by extending `collectTrack/Album/ArtistExternalIds`.
6. **Does not block the resolve pipeline.** All MB calls run in parallel with the streaming-side chain; failure is silent (returns null match, never throws into the resolver). Identical pattern to today's optional Apple Music / Tidal calls.

Out of scope for this plan (own follow-up plans):

- Work-level browsing UI ("show me all recordings of this composition") — needs a separate work-resolver entry point.
- AcoustID-Fingerprint workflow — needs an audio-sample upload pipeline.
- ISWC / ISNI write-through into the static-vs-dynamic split — that split is its own plan.
- Producer / engineer credits in the share UI — frontend work, separate plan once data is flowing.

## Design

### Adapter shape — fits the existing `ServiceAdapter` contract

`apps/backend/src/services/types.ts:107-135` defines `ServiceAdapter`. MusicBrainz fits as a fully-typed plugin:

| Field | Implementation |
| --- | --- |
| `id` | `SERVICE.MUSICBRAINZ` (new entry in `packages/shared/src/services.ts`) |
| `displayName` | `"MusicBrainz"` |
| `capabilities` | `{ supportsIsrc: true, supportsPreview: false, supportsArtwork: true }` (artwork via Cover Art Archive, see below) |
| `isAvailable` | `() => true` (no auth) |
| `detectUrl` | matches `musicbrainz.org/recording/<mbid>`, `musicbrainz.org/track/<mbid>` |
| `getTrack(mbid)` | `GET /ws/2/recording/{mbid}?inc=artists+releases+isrcs+work-rels&fmt=json` |
| `findByIsrc(isrc)` | `GET /ws/2/isrc/{isrc}?inc=artists+releases+work-rels&fmt=json`, picks the first recording |
| `searchTrack(q)` | `GET /ws/2/recording?query=recording:"{title}" AND artist:"{artist}"&fmt=json`, scored via `_shared/confidence.ts` |
| `searchTrackWithCandidates` | same endpoint, `limit=10`, returns the top-scored list |
| `albumCapabilities.supportsUpc` | `true` |
| `detectAlbumUrl` | matches `musicbrainz.org/release/<mbid>` and `musicbrainz.org/release-group/<mbid>` |
| `getAlbum(mbid)` | `GET /ws/2/release/{mbid}?inc=artists+labels+recordings&fmt=json` |
| `findAlbumByUpc(upc)` | `GET /ws/2/release?query=barcode:{upc}&fmt=json` |
| `searchAlbum(q)` | `GET /ws/2/release?query=release:"{title}" AND artist:"{artist}"&fmt=json` |
| `artistCapabilities.supportsArtistSearch` | `true` |
| `detectArtistUrl` | matches `musicbrainz.org/artist/<mbid>` |
| `getArtist(mbid)` | `GET /ws/2/artist/{mbid}?fmt=json` |
| `searchArtist(q)` | `GET /ws/2/artist?query=artist:"{name}"&fmt=json` |

### MBID + ISWC carry channel

Today `NormalizedTrack` carries `isrc?: string` only. Extending it with two optional fields keeps the change minimal and lets every adapter (not only MusicBrainz) report them when available:

```ts
export interface NormalizedTrack {
  isrc?: string;
  mbid?: string;     // MusicBrainz Recording MBID
  iswc?: string;     // ISWC of the underlying composition (work)
  // ...rest unchanged
}

export interface NormalizedAlbum {
  upc?: string;
  mbid?: string;     // MusicBrainz Release MBID
  // ...rest unchanged
}

export interface NormalizedArtist {
  mbid?: string;     // MusicBrainz Artist MBID
  isni?: string;     // ISNI when MB exposes it
  // ...rest unchanged
}
```

These fields are populated by:

- **MusicBrainz adapter** — primary source, fills MBID/ISWC/ISNI on every direct call.
- **Last.fm path** — already exposes `mbid` on artist/track/album results (`apps/backend/src/services/genre-search/lastfm.ts:69-78`); plug into the new fields in the `mapTrack` step. Free win.
- **Spotify / Apple Music / Deezer / Tidal** — none of them expose MBID today; the field stays `undefined` from those adapters. No regression risk.

### External-ids aggregation extension

`apps/backend/src/services/external-ids.ts` is the pure-function module that builds `ExternalIdRecord[]` for the persistence layer. Extension points:

```ts
// collectTrackExternalIds
push("isrc", sourceTrack.isrc, sourceTrack.sourceService);
push("mbid", sourceTrack.mbid, sourceTrack.sourceService);   // NEW
push("iswc", sourceTrack.iswc, sourceTrack.sourceService);   // NEW
for (const obs of linkObservations) {
  push("isrc", obs.isrc, obs.service);
  push("mbid", obs.mbid, obs.service);                        // NEW
  push("iswc", obs.iswc, obs.service);                        // NEW
}
```

Same shape change in `collectAlbumExternalIds` (add `mbid`) and `collectArtistExternalIds` (replace the empty-array stub with a real implementation that pushes `mbid` and `isni`).

The `linkObservations` typing in callers (`resolver.ts`, `album-resolver.ts`, `artist-resolver.ts`) needs the new optional fields. Since the existing type is a structural `{ service: string; isrc?: string }`, adding optional `mbid?: string; iswc?: string` is non-breaking.

### Cross-service link emission

`MusicBrainzAdapter.getTrack`/`getAlbum`/`getArtist` returns a `NormalizedTrack`/`NormalizedAlbum`/`NormalizedArtist` whose `webUrl` points at `https://musicbrainz.org/recording/{mbid}` etc. This means:

- A MusicBrainz hit emits a "musicbrainz" cross-service link in the same way as any other adapter.
- The link **must not** appear in the public share UI (it is a metadata link, not a streaming target). Mechanism: leave `SERVICE.MUSICBRAINZ` out of `SERVICE_DISPLAY_ORDER` (`packages/shared/src/platform.ts:57-78`) and out of `PLATFORM_CONFIG` (or set it but flag it `hidden: true` — preferred so the admin can still toggle it on for power users; needs a one-line `hidden?: boolean` field on `PlatformConfig`).
- Admin-side: `defaultEnabled: false` initially. The plugin is opt-in until we measure prod behaviour.

### Rate-limit + User-Agent

MusicBrainz enforces:

- **1 req/s** for unauthenticated callers — exceeding it returns `503` with `Retry-After`.
- **Mandatory `User-Agent`** identifying the application and contact, e.g. `User-Agent: musiccloud/1.0 (https://musiccloud.io)` — calls without it get rate-limited harder.

Build a tiny in-process serializer in `services/plugins/musicbrainz/rate-limit.ts`: a single-slot async queue that releases one request per ~1100ms. All MB fetches go through it. Identical pattern to the Spotify-token-refresh single-flight in `lib/infra/token-manager.ts`.

UA + base URL constants in the adapter; UA contact email lives in `MUSICBRAINZ_CONTACT` env var with a sensible default.

### Cover art

Cover Art Archive (`https://coverartarchive.org/release/{releaseMbid}/front-500.jpg`) returns release artwork in three sizes (`front`, `front-250`, `front-500`, `front-1200`). Use `front-500` as the artwork URL when a release MBID is in hand. No extra request — direct URL by convention. If 404, fall back to no artwork (cross-service backfill from Spotify / Apple Music kicks in via the existing logic in `album-resolver.ts:213-222`).

### Search confidence

MusicBrainz returns its own `score` (0–100). Map to the project's 0..1 confidence scale by dividing by 100 and clamping. Combine with the project's existing `scoreSearchCandidate` in `_shared/confidence.ts` (Levenshtein on title + artist) using the larger of the two — MB's score is metadata-driven, project score is string-similarity-driven, taking the max gives sensible behaviour without overweighting MB.

`MATCH_MIN_CONFIDENCE = 0.6` from `services/constants.ts:23` continues to apply — adapter returns `found: false` below that.

### Resolver-chain placement

`apps/backend/src/services/plugins/registry.ts:86-107` defines `PLUGINS` (post-Phase-B order: Deezer, Apple Music, Tidal, YouTube, Spotify, ...). MusicBrainz goes **after the streaming adapters** for the cross-service-resolve loop:

```
deezerPlugin, appleMusicPlugin, tidalPlugin, youtubePlugin, spotifyPlugin,
musicbrainzPlugin,                                                          // NEW
audiusPlugin, napsterPlugin, ...
```

Reasoning: when resolving a streaming URL, the streaming adapters are still the right starters (faster, return playable links). MusicBrainz runs after them in `resolveTrackAcrossServices` so the streaming hits arrive first and MB enriches the result with MBID/ISWC. URL detection (`identifyService`) is order-independent.

## Implementation

### New files

- `apps/backend/src/services/plugins/musicbrainz/index.ts` — `ServicePlugin` barrel.
- `apps/backend/src/services/plugins/musicbrainz/adapter.ts` — `ServiceAdapter` implementation (track + album + artist methods).
- `apps/backend/src/services/plugins/musicbrainz/rate-limit.ts` — single-slot 1 req/s gate.
- `apps/backend/src/services/plugins/musicbrainz/__tests__/musicbrainz.test.ts` — adapter tests using the stub-fetch + `mockResponse` pattern from `qobuz.test.ts`. Cover: ISRC lookup, MBID-by-URL, UPC-by-album, search-track, search-track-with-candidates, malformed JSON, 503-rate-limit retry.

### Files to modify

- `packages/shared/src/services.ts` — add `MUSICBRAINZ: "musicbrainz"` to `SERVICE`. `ServiceId` type extends automatically.
- `packages/shared/src/platform.ts` — add `musicbrainz: { label: "MusicBrainz", color: "#BA478F", hidden: true }` to `PLATFORM_CONFIG`. Introduce optional `hidden?: boolean` on `PlatformConfig` interface; UI consumers (`apps/frontend/src/components/share/PlatformGrid.tsx` and equivalents) skip entries where `hidden === true`. Leave `SERVICE_DISPLAY_ORDER` unchanged.
- `apps/backend/src/services/types.ts` — add optional `mbid` / `iswc` to `NormalizedTrack`; `mbid` to `NormalizedAlbum`; `mbid` / `isni` to `NormalizedArtist`.
- `apps/backend/src/services/external-ids.ts` — extend `collectTrack/Album/ArtistExternalIds` per §External-ids aggregation extension above. Update `linkObservations` shapes.
- `apps/backend/src/services/resolver.ts` — pass MBID/ISWC through `linkObservations` when calling `collectTrackExternalIds`. Search ~the call sites near the existing `isrc:` field.
- `apps/backend/src/services/album-resolver.ts` — same pattern for album MBID.
- `apps/backend/src/services/artist-resolver.ts` — same pattern for artist MBID + ISNI; replace the stub call with a real one.
- `apps/backend/src/services/plugins/registry.ts` — register `musicbrainzPlugin` in the `PLUGINS` array right after the streaming block.
- `apps/backend/src/services/genre-search/lastfm.ts:67-80` — when mapping Last.fm responses to `NormalizedTrack`/`Artist`, propagate the existing `mbid` field into the new `NormalizedX.mbid` slot. Free aggregation win.
- `apps/backend/src/services/admin-plugins.ts` (or wherever `defaultEnabled` is overridden via the admin DB) — confirm new plugin defaults to disabled until ready.

### Environment

- `MUSICBRAINZ_CONTACT` env var (string). Default `"musiccloud@layered.work"` if unset. Used to build the `User-Agent`.
- No DB-side env. No new migration: Phase A schema covers it.

### URL-detection regexes

```ts
const TRACK_URL = /(?:https?:\/\/)?(?:www\.)?musicbrainz\.org\/recording\/([0-9a-f-]{36})\b/i;
const ALBUM_URL = /(?:https?:\/\/)?(?:www\.)?musicbrainz\.org\/(?:release|release-group)\/([0-9a-f-]{36})\b/i;
const ARTIST_URL = /(?:https?:\/\/)?(?:www\.)?musicbrainz\.org\/artist\/([0-9a-f-]{36})\b/i;
```

UUID-style MBID (8-4-4-4-12 hex). Same shape across the three entity types.

## Verification

### Unit (vitest)

1. **ISRC lookup** — `findByIsrc("GBUM71505078")` against a fixture-mocked MB response returns `{mbid, title, artists, ...}` with the recording's MBID.
2. **MBID URL detect** — `detectUrl("https://musicbrainz.org/recording/4d2dc6f4-...-...")` returns the MBID.
3. **UPC lookup** — `findAlbumByUpc("886443543997")` returns first matching release with `mbid` and `webUrl` pointing at the release MBID.
4. **Search-track** — `searchTrack({title: "...", artist: "..."})` returns scored match; below `MATCH_MIN_CONFIDENCE` produces `found: false`.
5. **Search-track-with-candidates** — `limit=10`, returned candidates carry MBID + score normalised to 0..1.
6. **Rate-limit gate** — fire 5 calls in parallel, assert they execute serially with ≥1000ms between each (vitest `vi.useFakeTimers`).
7. **Malformed JSON** — adapter swallows `JSON.parse` failure and returns `found: false` / null per pattern.
8. **503 rate-limit retry** — single retry after `Retry-After` header; second 503 surfaces as a typed error to the resolver and is caught silently there.

### Integration (manual, against the live MB API)

1. `curl 'https://musicbrainz.org/ws/2/isrc/GBUM71505078?fmt=json' -H 'User-Agent: musiccloud/1.0'` returns at least one recording. Adapter returns the same MBID.
2. Resolve a Spotify track URL through the full pipeline: backend log shows `[musicbrainz] matched: confidence=...`, `track_external_ids` row appears with `idType='mbid'`, `sourceService='musicbrainz'`.
3. Submit a `musicbrainz.org/recording/<mbid>` URL to `/api/v1/resolve`: adapter detects it, full cross-service resolve runs as if it were a Spotify URL.
4. Submit a free-text search: candidates from MusicBrainz appear in the disambiguation list when their score is competitive.
5. `track_external_ids` aggregation: query for a popular ISRC, expect rows from spotify, deezer, apple-music, tidal, AND musicbrainz once the adapter is enabled.

### Telemetry to watch after enabling in prod

- MB call count vs streaming-call count (rate-limit gate must not bottleneck the resolver — log durations).
- MBID hit rate per source-service (how often does a Spotify-resolved track end up with an MBID?).
- 503 / Retry-After incidence — if frequent, raise the gate window.

## Out of scope

- Static-vs-dynamic cache split (next plan; depends on this one).
- Crawler that proactively walks MB by genre / by ISRC ranges (later, after the cache split).
- Work-level browsing UI ("all recordings of this composition") — UI work, separate plan.
- AcoustID-Fingerprint workflow — needs audio pipeline, separate plan.
- Producer / engineer / songwriter credits surfaced in the share UI — frontend, separate plan once data is flowing.

## Checklist

### SERVICE / shared
- [x] Add `MUSICBRAINZ` to `SERVICE` in `packages/shared/src/services.ts`.
- [x] Add `musicbrainz` entry to `PLATFORM_CONFIG` with `hidden: true`; introduce optional `hidden` field on `PlatformConfig`.
- [x] Update UI consumers of `PLATFORM_CONFIG` to skip `hidden` entries.

### Adapter
- [x] `services/plugins/musicbrainz/adapter.ts` — full `ServiceAdapter` implementation.
- [x] `services/plugins/musicbrainz/rate-limit.ts` — 1 req/s single-slot gate.
- [x] `services/plugins/musicbrainz/index.ts` — `ServicePlugin` barrel with `defaultEnabled: false`.
- [x] Cover Art Archive URL plumbed into `getAlbum` / `findAlbumByUpc` artwork field.

### Type extensions
- [x] `NormalizedTrack` gains `mbid?`, `iswc?`.
- [x] `NormalizedAlbum` gains `mbid?`.
- [x] `NormalizedArtist` gains `mbid?`, `isni?`.

### External-ids aggregation
- [x] `collectTrackExternalIds` pushes `mbid` + `iswc` for source + observations.
- [x] `collectAlbumExternalIds` pushes `mbid` for source + observations.
- [x] `collectArtistExternalIds` replaces stub with real `mbid` + `isni` push.
- [x] Resolver call sites pass through MBID/ISWC observations.

### Last.fm propagation (free aggregation win)
- [x] `genre-search/lastfm.ts` mapper propagates incoming `mbid` to `NormalizedX.mbid` for tracks + artists.

### Registry
- [x] `services/plugins/registry.ts` adds `musicbrainzPlugin` after the streaming-adapter block.

### Tests
- [x] Unit tests covering ISRC lookup, UPC lookup, MBID-by-URL, searchTrack, candidates, rate-limit gate, malformed JSON, 503 retry.
- [x] Aggregation test: `external-ids.test.ts` extended with MBID + ISWC + ISNI scenarios.

### Verification
- [x] Live MB lookup confirmed end-to-end (curl + resolver).
- [x] `track_external_ids` row from `sourceService='musicbrainz'` appears for a real resolve.
- [x] `musicbrainz.org/recording/<mbid>` URL flows through `/api/v1/resolve` correctly.

### Docs
- [x] `apps/backend/docs/musicbrainz-runbook.md` (new) — short note on UA / rate-limit / how to flip `defaultEnabled` in admin.

## Completed

- **Date:** 2026-04-28
- **Commit:** `565cc523` — Feat: Add MusicBrainz adapter as first canonical-identity source
- **Delivered:** All checklist items green. 19 files changed (+1044/-11). Plugin defaultEnabled false (admin opt-in).
- **Gates:** typecheck ✓ alle Apps · vitest 753/753 ✓ (+20 neue MB-Tests).
- **Open follow-ups:**
  - Live MB lookup gegen Staging (curl + resolver) — braucht `MUSICBRAINZ_CONTACT` in Prod-Env.
  - Activate plugin in admin once env is set.
  - Telemetry watch: MB call count, MBID hit rate per source-service, 503 incidence.
