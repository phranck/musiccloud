# Plan: Split `apps/backend/src/db/adapters/postgres.ts` and document the DB layer

Plan-Nr.: MC-014

## Context

`apps/backend/src/db/adapters/postgres.ts` has grown to **5804 lines** with virtually no narrative documentation. The file holds the entire PostgreSQL implementation for both `TrackRepository` and `AdminRepository` — track/album/artist resolution + persistence, admin CRUD across every domain, content pages + translations + segments + nav, email templates, crawl state, and website analytics.

Two consequences:

1. **Navigation is slow.** Inline section markers help, but a single 5800-line file with no per-domain seams forces every reader (and every Claude-edit) to scroll through the full surface to land on the right method. The codebase already favours domain-bounded files (`services/album-resolver.ts` 696 lines, `services/artist-resolver.ts` 518 lines, `services/resolver.ts` 1136 lines).

2. **Doc coverage is near zero.** Aside from three short JSDoc lines on lifecycle methods, the file has no TSDoc, no `@param/@returns/@throws`, no file-level header. The same gap exists in `db/schemas/postgres.ts` (1153 lines, pure Drizzle table definitions) and the two repository interface files (`db/repository.ts` 863 lines, `db/admin-repository.ts` 446 lines).

This plan splits the adapter into one shell plus eleven domain modules, then adds full TSDoc to the new modules **and** to the schema/interface files. No behaviour changes.

Existing pattern to follow: the website-analytics module-level functions already live at the bottom of `postgres.ts` (lines 4641–5699) and the class delegates to them in 1-line methods (lines 876–905). That pattern is extended to every other domain.

## Scope

- `apps/backend/src/db/adapters/postgres.ts` — split into 12 files + TSDoc on every export.
- `apps/backend/src/db/schemas/postgres.ts` — TSDoc only, no split.
- `apps/backend/src/db/repository.ts` — TSDoc on interface + interface methods, no split.
- `apps/backend/src/db/admin-repository.ts` — TSDoc on interface + interface methods, no split.

Out of scope: behaviour changes, SQL refactors, performance tuning, schema migrations, fixing bugs found while reading. If a real bug surfaces during the split, add a one-line entry to a "Follow-ups" section at the bottom of this plan — do **not** fix in the same commit.

## Architecture

### Target module map (sibling files in `apps/backend/src/db/adapters/`)

| File | Domain | Source line range (in current postgres.ts) | grobe Zeilen |
|---|---|---|---|
| `postgres.ts` | Shell: class, pool, ensureSchema, scheduleCleanup, close, 1-line delegations, top-level section map | new + 794–875 | ~600 |
| `postgres-shared.ts` | `safeParseArray`, `safeParseArtistCredits`, `normalizeArtistCreditInputs`, `safeParseJson`, `dateToMs`, `msToDate`, `dateToIso`, `nullableNumber`, SQL fragments (`TRACK_ARTIST_FIELDS_SELECT`, `ALBUM_ARTIST_FIELDS_SELECT`, `ARTIST_NAME_LATERAL_JOIN`, `WEBSITE_ANALYTICS_SUBJECT_JOIN`), shared constants (`WEBSITE_ANALYTICS_MUSIC_SOURCE_PLATFORMS`, `INTERACTION_EVENT_TYPES`, `RETENTION_POLICY`), row type interfaces used cross-domain | 474–789 + scattered | ~400 |
| `postgres-tracks.ts` | Track resolve (`findTrackByUrl`, `findTrackByIsrc`, `findTracksByTextSearch`, `findShortIdByTrackUrl`, `findExistingByIsrc`), track persistence (`loadByShortId`, `loadByTrackId`, `persistTrackWithLinks`, `addLinksToTrack`), track external-ids (`addTrackExternalIds`, `findTrackByExternalId`), track previews (`findTrackPreviews`, `upsertTrackPreview`), `loadSharePageResult`, plus private builders for track results (`buildCachedResult`, `buildSharePageResult`, `rowToTrack`, `rowToSharePageTrack`) | 911–1453 + 3187–3501 (subset) | ~540 |
| `postgres-albums.ts` | Album resolve (`findAlbumByUrl`, `findAlbumByUpc`, `findExistingAlbumByUpc`), album persistence (`persistAlbumWithLinks`, `addLinksToAlbum`, `loadAlbumByShortId`), album external-ids (`addAlbumExternalIds`, `findAlbumByExternalId`), album previews (`findAlbumPreviews`, `upsertAlbumPreview`), `buildCachedAlbumResult`, `rowToAlbum`, `rowToNormalizedAlbum` | 1804–2079 + scattered | ~280 |
| `postgres-artists.ts` | Artist resolve + persist (`findArtistByUrl`, `findArtistByName`, `loadArtistByShortId`, `persistArtistWithLinks`, `addLinksToArtist`), artist cache (`findArtistCache`, `findArtistInfoAliasByShortId`, `saveArtistCache`, `cleanupStaleCache`), artist identity events (`listArtistIdentityEventsByDay`), artist group memberships (`listArtistGroupMembers`, `listArtistMemberships`, `findArtistEntityIdByIdentifier`, private `listArtistGroupMemberships`), private artist-entity helpers (`ensureArtistEntityExists`, `ensureExistingArtistEntityForCredit`, `ensureArtistEntityForName`, `ensureArtistEntityName`, `replaceTrackArtistCredits`, `replaceAlbumArtistCredits`), `buildCachedArtistResult`, `rowToArtistIdentityEvent`, `rowToArtistGroupMembership` | 1458–1764 + 2085–3082 + 3230–3383 + scattered | ~1300 |
| `postgres-admin-users.ts` | `rowToAdminUser`, `findAdminById`, `findAdminByUsername`, `createAdminUser`, `updateLastLogin`, `countAdmins`, `listAdminUsers`, `updateAdminUser`, `deleteAdminUser`, `listPendingInvites`, `acceptInvite` | 2319–2514 | ~200 |
| `postgres-admin-catalog.ts` | Admin CRUD: `getTrackById`, `updateTrack`, `listTracks`, `deleteTracks`, `listAlbums`, `deleteAlbums`, `listArtists`, `listArtistEntities`, `deleteArtists`, `clearArtistCache`, plus cross-domain admin utils: `invalidateTrackCache`, `invalidateAlbumCache`, `invalidateArtistCache`, `invalidateAllCaches`, `countAllData`, `resetAllData`, `resolveShortIds`, `getRandomShortId`, `updateTrackTimestamp`, `findMissingTables` | 2515–3224 + 1765–1803 + 2825–2881 | ~700 |
| `postgres-content-pages.ts` | Content pages + page translations + segments + segment translations: `listContentPageSummaries`, `getContentPageBySlug`, `contentPageSlugExists`, `createContentPage`, `updateContentPageMeta`, `updateContentPageBody`, `deleteContentPage`, `getAdminUsernamesByIds`, `listPublishedContentPages`, `getPublishedContentPageBySlug`, `getContentPagesBySlugs`, `getPublishedContentPagesBySlugs`, `bulkUpdatePages`, private `applyMetaInTx`, `listPageTranslations`, `getPageTranslation`, `upsertPageTranslation`, `deletePageTranslation`, `setContentPageContentUpdatedAt`, `listSegmentsForOwner`, `deleteSegmentsForOwner`, `replaceSegmentsForOwner`, `listSegmentTranslationsForOwner`, `replaceSegmentTranslations`, plus row mappers (`rowToContentPageSummary`, `rowToContentPage`, `rowToContentPageTranslation`, `resolveSlugAfterRename`) | 3679–4297 + 4029–4083 + 4089–4148 + 4195–4246 + 4581–4640 + 4550–4580 | ~620 |
| `postgres-content-nav.ts` | `listAdminNavItems`, `replaceAdminNavItems`, `listNavTranslations`, `replaceNavItemTranslations`, `rowToNavItem` | 4154–4189 + 4247–4298 + 5701–5716 | ~110 |
| `postgres-content-email.ts` | `listEmailTemplates`, `getEmailTemplateById`, `getEmailTemplateByName`, `insertEmailTemplate`, `updateEmailTemplate`, `deleteEmailTemplate`, `rowToEmailTemplate` | 3571–3678 + 4531–4549 | ~110 |
| `postgres-crawl.ts` | `seedCrawlState`, `findCrawlState`, `listCrawlState`, `listDueCrawlState`, `updateCrawlState`, `acquireCrawlLock`, `completeCrawlTick`, `insertCrawlRun`, `finalizeCrawlRun`, `listCrawlRuns`, `rowToCrawlStateRecord` + the crawl-state row interfaces | 4299–4638 + 5761–5803 | ~340 |
| `postgres-analytics.ts` | `insertAppTelemetryEvent`, `insertWebsiteAnalyticsBatch`, `refreshWebsiteAnalyticsDailySummaries`, `queryWebsiteAnalyticsTotals`, `websiteAnalyticsTrend`, `buildWebsiteAnalyticsTrends`, `getWebsiteAnalyticsOverview`, `rowToWebsiteAnalyticsPathEvent`, `rowToWebsiteAnalyticsSearchDescriptor`, `rowToWebsiteAnalyticsGeoPoint`, `getWebsiteAnalyticsGeo`, `websiteAnalyticsFilterSql`, `getWebsiteAnalyticsDrilldown`, `exportWebsiteAnalytics`, `runWebsiteAnalyticsRetention` (already module-level today; only file extraction + TSDoc) | 4641–5699 | ~1060 |

### Signature convention

Every exported function takes the shared connection as the first parameter:

```ts
export async function findTrackByUrl(pool: Pool, url: string): Promise<CachedTrackResult | null> { ... }
```

Functions running inside a transaction take `client: PoolClient` instead:

```ts
export async function persistTrackWithLinks(pool: Pool, data: PersistTrackData): Promise<...> { ... }
async function replaceTrackArtistCredits(client: PoolClient, trackId: string, ...): Promise<void> { ... }
```

Private helpers stay non-exported within their module. If a helper is genuinely cross-domain (e.g., `ensureArtistEntityForName` is consumed by track + album persistence), it lives in `postgres-artists.ts` and is exported; tracks/albums import it.

### Adapter shell

`postgres.ts` keeps:
- Imports + constants for pool sizing.
- `PostgresAdapter` class declaration implementing both interfaces.
- Constructor, `ensureSchema`, `scheduleCleanup`, `close`.
- One 1-line delegating method per `TrackRepository` / `AdminRepository` interface method (~80 delegations).
- Top-of-file section map listing all sibling modules + their responsibility.

No SQL, no JSON building, no row mapping remains in the shell.

## Documentation convention

### Per sub-module

File header (TSDoc on the file as a whole, written as `/** ... */` immediately under the imports or at the top):

```ts
/**
 * Track resolution, persistence and external-id aggregation.
 *
 * Domain: read/write path for individual tracks plus their service-link
 * fan-out, ISRC dedup, external-id catalogue and short-URL resolution.
 *
 * Excludes:
 *   - Admin CRUD (see postgres-admin-catalog.ts).
 *   - Album / artist resolution (see postgres-albums.ts, postgres-artists.ts).
 *   - Shared SQL fragments and parse helpers (see postgres-shared.ts).
 */
```

Per exported function:

```ts
/**
 * Resolves a track by any of its known service URLs.
 *
 * Joins service_links and short_urls; falls back to the canonical URL
 * stored on tracks.url when no service-link match exists.
 *
 * @param pool - Postgres connection pool.
 * @param url - Any known service URL (Spotify, Apple, Deezer, ...).
 * @returns The cached track result with all aggregated links, or null
 *   if no track matches.
 * @throws Pool errors propagate; no domain-specific exceptions.
 */
export async function findTrackByUrl(pool: Pool, url: string): Promise<CachedTrackResult | null> { ... }
```

Rules:
- Description first sentence is one line, terminated with a period.
- `@throws` only when non-trivial (custom error class, validation error, swallowed pool error). Pool errors propagating is the default and does not need to be repeated everywhere.
- `@remarks` for fallback paths, race-condition notes, retention behaviour, transactional guarantees.
- Inline comments only for SQL quirks, index rationale, or migration cross-refs that already exist today. No WHAT comments.
- Language: English.

### Adapter shell section map

`postgres.ts` gets a top-of-file block:

```ts
/**
 * PostgresAdapter shell.
 *
 * Implementations live in sibling modules; this file is delegation only.
 *
 *   postgres-shared.ts           Safe-parse, date helpers, SQL fragments, constants.
 *   postgres-tracks.ts           Track resolve / persist / links / externals / previews.
 *   postgres-albums.ts           Album resolve / persist / links / externals / previews.
 *   postgres-artists.ts          Artist resolve / persist + cache + identity events + memberships.
 *   postgres-admin-users.ts      Admin user CRUD + invites.
 *   postgres-admin-catalog.ts    Admin CRUD for tracks/albums/artists/entities + cache invalidation.
 *   postgres-content-pages.ts    Content pages + page translations + segments.
 *   postgres-content-nav.ts      Navigation items + nav translations.
 *   postgres-content-email.ts    Email templates.
 *   postgres-crawl.ts            Crawl state + runs + ticks.
 *   postgres-analytics.ts        Website analytics + app telemetry.
 */
```

### `schemas/postgres.ts`

Each `pgTable(...)` definition gets a preceding TSDoc block:

```ts
/**
 * Canonical track records. Source-of-truth for track metadata indexed
 * by ISRC and short-id; service URLs live in `serviceLinks`.
 *
 * Lifecycle: rows are upserted by `persistTrackWithLinks`; deleted only
 * via admin CRUD (`deleteTracks`) which cascades to service_links,
 * track_artist_credits and track_external_ids.
 *
 * Indexes: created_at DESC indexed because the admin TracksPage default
 * sort would otherwise do a top-N heapsort on every page load.
 */
export const tracks = pgTable("tracks", { ... });
```

No column-by-column doc unless the column has non-obvious semantics (e.g., a denormalised field, a soft-delete flag, a JSONB shape).

### `repository.ts` and `admin-repository.ts`

Each interface gets a top-of-interface TSDoc block describing its role. Each method gets a one-block TSDoc with description + `@param` + `@returns` and `@throws`/`@remarks` when relevant. Type aliases (e.g., `PersistTrackData`) get a one-line description so IDE hover surfaces something meaningful.

## Phase plan

Each phase is one commit. Verification gates (see below) must pass before the next phase starts. Phases 1–8 must keep behaviour byte-identical — extraction + doc only. Phases 9–10 add documentation to the schema and interface files; no logic change either.

| # | Phase | Files touched | Commit subject |
|---|---|---|---|
| 1 | Extract `postgres-shared.ts` | adapter shell + new `postgres-shared.ts` | `Refactor: Extract shared helpers from postgres adapter` |
| 2 | Extract `postgres-tracks.ts` + TSDoc | adapter shell + new module | `Refactor: Extract track queries from postgres adapter` |
| 3 | Extract `postgres-albums.ts` + TSDoc | adapter shell + new module | `Refactor: Extract album queries from postgres adapter` |
| 4 | Extract `postgres-artists.ts` + TSDoc | adapter shell + new module | `Refactor: Extract artist queries from postgres adapter` |
| 5 | Extract `postgres-admin-users.ts` + `postgres-admin-catalog.ts` + TSDoc | adapter shell + two new modules | `Refactor: Extract admin user + catalog queries from postgres adapter` |
| 6 | Extract `postgres-content-pages.ts` + `postgres-content-nav.ts` + `postgres-content-email.ts` + TSDoc | adapter shell + three new modules | `Refactor: Extract content/nav/email queries from postgres adapter` |
| 7 | Extract `postgres-crawl.ts` + TSDoc | adapter shell + new module | `Refactor: Extract crawl state queries from postgres adapter` |
| 8 | Extract `postgres-analytics.ts` + TSDoc | adapter shell + new module | `Refactor: Extract website analytics queries from postgres adapter` |
| 9 | TSDoc on `schemas/postgres.ts` | schema file | `Docs: Document postgres schema tables` |
| 10 | TSDoc on `repository.ts` + `admin-repository.ts` | both interface files | `Docs: Document repository interfaces` |

Commit prefix policy follows `~/.claude/rules/git.md`: `Refactor:` for the splits (no behaviour change), `Docs:` for pure documentation passes, `Chore:` for the plan move. No `Co-Authored-By` trailer.

### Per-phase workflow

1. Re-grep all refs in the **Verified facts** block to catch drift since plan-write.
2. Cut the methods/helpers belonging to this phase into the new file.
3. Replace the cut methods on `PostgresAdapter` with 1-line delegations (matching the analytics pattern at postgres.ts:876–905).
4. Add TSDoc to every exported function in the new file + the file header.
5. Run verification gates (see below).
6. Commit.

## Verification

### Per-phase gates

From repo root:

```bash
pnpm --filter @musiccloud/backend typecheck
pnpm --filter @musiccloud/backend test:run
pnpm --filter @musiccloud/backend build
pnpm lint
```

All four green before commit. If a test fails, investigate root cause — do not bypass.

Smoke after each domain-extract phase (1, 2, 3, 4, 5, 6, 7, 8):

```bash
./app restart backend
curl -s http://localhost:<backend-port>/api/health
```

Plus two domain-relevant endpoints per phase (e.g., after phase 2: `GET /api/track/<known-short-id>`, after phase 4: `GET /api/artist/<known-short-id>`). Exact ports come from `app.config` at execute time.

### Final clean-state gate (after phase 10)

Per the monorepo-package-config rule (`~/.claude/rules/monorepo-package-config.md`), simulate a fresh clone:

```bash
rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/dist packages/*/dist
pnpm install
pnpm --filter @musiccloud/backend typecheck
pnpm --filter @musiccloud/backend test:run
pnpm --filter @musiccloud/backend build
pnpm lint
```

All green.

### Behaviour equivalence check

After each extraction phase, before commit:

```bash
git diff --stat HEAD~1 -- apps/backend/src/db/adapters/postgres.ts
```

Should show only deletions (methods moved out) and a small block of additions (new delegations). No SQL string should appear in the diff for `postgres.ts` other than its removal.

## Critical files

To modify:
- `apps/backend/src/db/adapters/postgres.ts`
- New: `apps/backend/src/db/adapters/postgres-shared.ts`
- New: `apps/backend/src/db/adapters/postgres-tracks.ts`
- New: `apps/backend/src/db/adapters/postgres-albums.ts`
- New: `apps/backend/src/db/adapters/postgres-artists.ts`
- New: `apps/backend/src/db/adapters/postgres-admin-users.ts`
- New: `apps/backend/src/db/adapters/postgres-admin-catalog.ts`
- New: `apps/backend/src/db/adapters/postgres-content-pages.ts`
- New: `apps/backend/src/db/adapters/postgres-content-nav.ts`
- New: `apps/backend/src/db/adapters/postgres-content-email.ts`
- New: `apps/backend/src/db/adapters/postgres-crawl.ts`
- New: `apps/backend/src/db/adapters/postgres-analytics.ts`
- `apps/backend/src/db/schemas/postgres.ts`
- `apps/backend/src/db/repository.ts`
- `apps/backend/src/db/admin-repository.ts`

To read (do not modify):
- `apps/backend/src/db/index.ts` — confirms the singleton boundary; nothing here changes.
- `apps/backend/src/services/album-resolver.ts`, `apps/backend/src/services/artist-resolver.ts`, `apps/backend/src/services/resolver.ts` — reference for file-header doc style and domain-boundary conventions.

## Existing patterns to reuse

- **Module-level + 1-line delegation pattern**: `postgres.ts:876–905` (analytics delegation). Mirror exactly.
- **Module-level row mappers and helpers**: `postgres.ts:4531–4640` (content/email mappers already module-level). Move with their consumers.
- **`getRepository()` / `getAdminRepository()` factory in `db/index.ts:11–20`**: the singleton boundary. Untouched.
- **Domain-bounded resolver files in `apps/backend/src/services/`**: file size + doc style precedent (album-resolver.ts 696 lines, artist-resolver.ts 518 lines).

## Verified facts (grep evidence at plan-write time, 2026-05-25)

- `apps/backend/src/db/adapters/postgres.ts` line count: **5804** (`wc -l`).
- `apps/backend/src/db/schemas/postgres.ts` line count: **1153** (`wc -l`).
- `apps/backend/src/db/repository.ts` line count: **863** (`wc -l`).
- `apps/backend/src/db/admin-repository.ts` line count: **446** (`wc -l`).
- Only direct importer of the adapter file: `apps/backend/src/db/index.ts:2` (`import { PostgresAdapter } from "./adapters/postgres.js";`). Confirmed by repo-wide grep — no other file imports it.
- Public factory functions: `getRepository`, `getAdminRepository`, `closeRepository` exported from `db/index.ts:11,17,37`. Type re-exports: `AdminRepository`, `AdminUser`, `CachedTrackResult`, `PersistTrackData`, `SharePageDbResult`, `TrackRepository` from `db/index.ts:45–46`.
- Existing analytics delegation pattern confirmed at `postgres.ts:876–905`.
- Backend package scripts (`apps/backend/package.json:9–11`): `typecheck` → `tsc --noEmit`; `test:run` → `vitest run`; `build` → `tsup`.
- Repo root scripts (`package.json`): `lint` → `biome check .`.
- Package manager: `pnpm@10.33.1` (`package.json:packageManager`). Memory-confirmed (project_pnpm_required.md).
- Plan directory + naming convention: `.claude/plans/open/` exists; sample files use `YYYY-MM-DD-kebab-case.md` (`2026-04-18-dashboard-ui-test-plan.md`, `2026-05-03-data-router-migration-and-spa-unsaved-guard.md`).
- Today's date: 2026-05-25 → final plan filename `2026-05-25-postgres-adapter-split-and-docs.md`.

Verification checklist:

- [x] All code references verified (functions, scripts, paths, env vars, package-manager commands)

## Open questions

None at plan-write time. If a domain-extraction phase surfaces an ambiguity (e.g., a helper consumed by two domains where ownership is unclear), surface it at execute-time, do not guess.

## Drift log (filled during execute)

- **Phase 2 (2026-05-25):** Original plan put `ensureArtistEntity*` / `replace*ArtistCredits` / `insertExternalIds` in `postgres-artists.ts` and asked tracks/albums to import them. Switched these seven persistence sub-helpers to `postgres-shared.ts` instead. Reason: they are not artist-query logic but generic credit / external-id persistence helpers all called with a `PoolClient` inside a transaction, and routing them through artists forces phase 4 to land before phase 2 (or duplicate helpers temporarily). Result: phase 2 grows by one helper-extract pass; phases 3 and 4 shrink accordingly. No behaviour change.

- **Phase 2 (2026-05-25):** Phase 2 ended up split across two commits (2a + 2b) because the persistence-helper move was a precondition for the track-method move and they made cleaner atomic units separately. Phase numbering in the table below still reflects the original 1-commit-per-phase intent for phases 3-10.

## Resume state (2026-05-25)

Phases 0, 1, 2a, 2b, 3, 4, 5, 6, 7, 8, 9 and 10 are complete and committed on `main`:

| Commit | Phase | Subject |
|---|---|---|
| `baf891c` | 1 | Refactor: Extract shared helpers from postgres adapter |
| `15fba6f` | 2a | Refactor: Extract persistence helpers from postgres adapter |
| `4cd0f20` | 2b | Refactor: Extract track queries from postgres adapter |
| `6688e00` | 3 | Refactor: Extract album queries from postgres adapter |
| `9aa6b82` | 4 | Refactor: Extract artist queries from postgres adapter |
| `dd94787` | 5 | Refactor: Extract admin user + catalog queries from postgres adapter |
| `2a1bc77` | 6 | Refactor: Extract content/nav/email queries from postgres adapter |
| `3b79af9` | 7 | Refactor: Extract crawl state queries from postgres adapter |
| `fa528cc` | 8 | Refactor: Extract website analytics queries from postgres adapter |
| `35080ab` | 9 | Docs: Document postgres schema tables |
| `ea6e951` | 10 | Docs: Document repository interfaces |

Current state:
- `apps/backend/src/db/adapters/postgres.ts` — 930 lines (from 5804, -84%)
- `apps/backend/src/db/adapters/postgres-shared.ts` — 611 lines
- `apps/backend/src/db/adapters/postgres-tracks.ts` — 826 lines
- `apps/backend/src/db/adapters/postgres-albums.ts` — 634 lines
- `apps/backend/src/db/adapters/postgres-artists.ts` — 1035 lines
- `apps/backend/src/db/adapters/postgres-admin-users.ts` — 346 lines
- `apps/backend/src/db/adapters/postgres-admin-catalog.ts` — 1000 lines
- `apps/backend/src/db/adapters/postgres-content-pages.ts` — 848 lines
- `apps/backend/src/db/adapters/postgres-content-nav.ts` — 205 lines
- `apps/backend/src/db/adapters/postgres-content-email.ts` — 222 lines
- `apps/backend/src/db/adapters/postgres-crawl.ts` — 399 lines
- `apps/backend/src/db/adapters/postgres-analytics.ts` — 1554 lines
- `apps/backend/src/db/schemas/postgres.ts` — all 49 `pgTable(...)` definitions have immediate TSDoc.
- `apps/backend/src/db/repository.ts` and `apps/backend/src/db/admin-repository.ts` — all exported declarations and repository methods have TSDoc.

Verification after Phase 10: `pnpm --filter @musiccloud/backend typecheck`, `pnpm --filter @musiccloud/backend test:run` (952 passed, 25 skipped), `pnpm --filter @musiccloud/backend build`, `pnpm lint` all green. Phase-8 smoke: `./app restart backend`, `GET /health` → 200, `GET /health/ready` → 200, `GET /api/admin/analytics/website/retention` → 401 unauthenticated route present, `POST /api/v1/analytics/website-events {}` → 400 schema validation.

Pending: final clean-state gate from the plan requires deleting `node_modules` and `dist` folders before reinstalling. This is intentionally not run without explicit destructive-action approval.

## Follow-ups (filled during execute)

_(append here when reading the file reveals real bugs/smells. Each item: one line, file:line ref, what is wrong, what the proposed fix would be. Do NOT fix in the same commit — separate plan after this one is done.)_

- `apps/backend/src/db/adapters/postgres-shared.ts:msToDate` interprets `ms` as **seconds** (multiplies by 1000) while the symmetric `dateToMs` returns true epoch-ms (`.getTime()`). Either rename `msToDate` → `secondsToDate` or fix the implementation. Caller `saveArtistCache` writes `Date.now()`-style ms but the only reader (`findArtistCache` → `dateToMs`) returns ms again, so the bug currently masks itself; would break any code that round-trips through this pair in seconds form.
