# Crawler Architecture

## What this is

A backend subsystem that proactively grows the canonical entity database by
ticking a per-minute cron job, fetching candidate tracks from registered
sources (Deezer Charts, later Last.fm Tag Tops + Apple Music Charts), and
running each candidate through the existing resolver pipeline. Goal:
cross-service ID density (`*_external_ids`, MusicBrainz canonicalisation,
preview URLs) keeps growing independently of user load.

The user-facing resolve path is reactive — it only writes to the DB when
someone pastes a link or types a search. The crawler is the active
counterpart, dashboard-controllable at runtime.

## The pieces

```
services/crawler/
├── types.ts                       # Candidate union + CrawlerSource contract
├── registry.ts                    # static SOURCES array (build-time literal)
├── dedupe.ts                      # repo.findTrackByUrl / findTrackByIsrc wrapper
├── ingest.ts                      # wraps services/persist-resolution.ts
├── heartbeat.ts                   # tick orchestration
└── sources/
    └── deezer-charts.ts           # one source per file

scripts/crawler-heartbeat.ts       # cron entry point (bundled via tsup)
routes/admin-crawler.ts            # 5 admin endpoints
db/repository.ts                   # 10 crawler methods on TrackRepository
db/adapters/postgres.ts            # SQL implementations
db/schemas/postgres.ts             # crawl_state + crawl_runs tables (migration 0023)
packages/shared/src/crawler.ts     # CrawlerSourceInfo / CrawlerRunInfo wire types
zerops.yml                         # backend run.crontab: per-minute heartbeat
```

## Tick flow

```
Zerops cron (* * * * *)
  -> node apps/backend/dist/scripts/crawler-heartbeat.js
     -> runMigrations()
     -> repo.seedCrawlState(s)        for every s in SOURCES (idempotent)
     -> repo.listDueCrawlState()      WHERE enabled = true
                                        AND next_run_at <= NOW()
                                        AND running_since IS NULL
     -> for each due row:
          - repo.acquireCrawlLock(source, 30min)
              skip if held and not stale
          - repo.insertCrawlRun({status: 'running'})
          - source.fetch(config, cursor) -> { candidates, nextCursor }
          - for each candidate:
              - dedupe.isAlreadyIngested(c) -> skip if true
              - ingest.ingestCandidate(c)   -> persistResolution
          - repo.finalizeCrawlRun({status: 'success'|'error', counters})
          - repo.completeCrawlTick({cursor, nextRunAt, success, errorMessage})
              clears running_since, advances next_run_at,
              auto-disables on consecutive_errors >= 5
```

The heartbeat itself is cheap when nothing is due: one indexed SELECT,
early return. Real crawler work only happens during the minute a source
falls due.

## Source contract

Every source exports one `CrawlerSource` object:

```ts
export const fooSource: CrawlerSource = {
  id: "foo",                           // primary key in crawl_state
  displayName: "Foo Source",
  defaultIntervalMinutes: 360,
  defaultEnabled: true,
  defaultConfig: { ... },               // initial JSON blob; admin can edit at runtime
  async fetch(config, cursor) {
    // ... call upstream API
    return {
      candidates: [
        { kind: "url", url: "...", isrc: "..." },     // OR
        { kind: "search", title: "...", artist: "..." },
      ],
      nextCursor: null,                  // opaque; passed back next tick
    };
  },
};
```

Two candidate shapes:

- `kind: "url"` — Deezer / Apple Music. Goes through `resolveUrl` and
  pre-deduplicates by URL + (optional) ISRC.
- `kind: "search"` — Last.fm. Goes through
  `resolveTextSearchWithDisambiguation`. Pre-dedupe is impossible (no
  stable ID); the resolver-cache absorbs duplicates one layer down.

## Registry pattern

`SOURCES` in `crawler/registry.ts` is a build-time array literal,
mirroring `services/plugins/registry.ts`. Adding a new source is two
lines (import + push); removing one means deleting the import line, and
the compiler flags any stale references.

A row in `crawl_state` whose source id is no longer in the registry is
ignored by the heartbeat (left in place for audit).

## Schema

Migration `0023_crawl_state.sql` adds two tables:

```sql
CREATE TABLE crawl_state (
  source              text PRIMARY KEY,
  display_name        text NOT NULL,
  enabled             boolean NOT NULL DEFAULT false,
  interval_minutes    integer NOT NULL DEFAULT 360,
  next_run_at         timestamptz NOT NULL DEFAULT NOW(),
  last_run_at         timestamptz,
  cursor              jsonb,
  config              jsonb NOT NULL DEFAULT '{}',
  running_since       timestamptz,
  error_count         integer NOT NULL DEFAULT 0,
  last_error          text,
  consecutive_errors  integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_crawl_state_due
  ON crawl_state(next_run_at) WHERE enabled = true;

CREATE TABLE crawl_runs (
  id          text PRIMARY KEY,
  source      text NOT NULL,
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  status      text NOT NULL,            -- running | success | error | aborted | skipped
  discovered  integer NOT NULL DEFAULT 0,
  ingested    integer NOT NULL DEFAULT 0,
  skipped     integer NOT NULL DEFAULT 0,
  errors      integer NOT NULL DEFAULT 0,
  notes       text
);

CREATE INDEX idx_crawl_runs_source_started
  ON crawl_runs(source, started_at DESC);
```

The partial index on `crawl_state(next_run_at) WHERE enabled = true`
keeps the per-minute "is anything due?" probe O(log n_active), not O(n_total).

## Repository methods

`TrackRepository` exposes 10 crawler methods (`db/repository.ts`):

| Method                                       | Purpose                                                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `seedCrawlState(seed)`                       | `INSERT ... ON CONFLICT DO NOTHING`. Called by heartbeat for every registry source on each tick.                           |
| `findCrawlState(source)`                     | One row by id.                                                                                                             |
| `listCrawlState()`                           | All rows, ordered by display name.                                                                                         |
| `listDueCrawlState()`                        | Heartbeat probe: `enabled AND next_run_at <= NOW() AND running_since IS NULL`.                                             |
| `updateCrawlState(source, patch)`            | Admin-API mutation: `enabled`, `intervalMinutes`, `config`, `cursor`, `nextRunAt`, `runningSince` (force-release-only).    |
| `acquireCrawlLock(source, maxRunMs)`         | Atomic row-lock with stale detection. Returns `true` on acquire.                                                           |
| `completeCrawlTick(source, outcome)`         | Releases lock, advances `next_run_at` and `cursor`, resets / increments `consecutive_errors`, auto-disables at threshold.  |
| `insertCrawlRun(run)`                        | New `crawl_runs` row with `status: 'running'`.                                                                             |
| `finalizeCrawlRun(id, finalize)`             | Update counters + status + `finished_at`.                                                                                  |
| `listCrawlRuns({source?, page, limit})`      | Paginated history. Total COUNT on every page (table is bounded).                                                           |

## Admin API

All endpoints live under the admin scope in `server.ts` (Bearer JWT
with `role: "admin"` enforced by the parent `authenticateAdmin`
preHandler).

| Method | Path                                                  | Effect                                                                                |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| GET    | `/api/admin/crawler/sources`                          | List `CrawlerSourceInfo[]`. Re-seeds registry-known sources on entry (idempotent).    |
| PATCH  | `/api/admin/crawler/sources/:id`                      | Mutate `enabled`, `intervalMinutes`, `config`, `cursor`. Validates source registered. |
| POST   | `/api/admin/crawler/sources/:id/run-now`              | Sets `next_run_at = NOW()`. Heartbeat picks it up next minute.                        |
| POST   | `/api/admin/crawler/sources/:id/release-lock`         | Clears a stuck `running_since`. Used when a previous tick crashed.                    |
| GET    | `/api/admin/crawler/runs?source=&page=&limit=`        | Paginated `CrawlerRunsPage`.                                                          |

Wire-format types live in `packages/shared/src/crawler.ts`
(`CrawlerSourceInfo`, `CrawlerRunInfo`, `CrawlerRunsPage`). All
timestamps are ISO 8601 strings.

### OpenAPI visibility

All `/api/admin/*` routes — including the five crawler endpoints
above — are excluded from the public OpenAPI document at
`/docs/json` (and the Redoc UI at `/docs`). The exclusion is enforced
in `server.ts` via the `@fastify/swagger` `transform` callback, which
sets `hide: true` on any route whose URL starts with `/api/admin`.
This is deliberate: the admin surface is reachable but not advertised
to external API consumers. No per-route Fastify `schema` block is
needed for crawler admin routes because the transform hides them
regardless.

## Operations playbook

### Disable a misbehaving source

```bash
curl -X PATCH \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}' \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts
```

The heartbeat skips disabled rows on its next probe. The source
auto-disables itself after 5 consecutive `consecutive_errors`; this is
the manual override.

### Re-enable after auto-disable

```bash
curl -X PATCH \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -d '{"enabled":true}' \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts
```

`completeCrawlTick` resets `consecutive_errors` to 0 on the next
successful tick, so a single recovery tick lifts the auto-disable
threshold automatically next time.

### Force a tick now (instead of waiting up to `intervalMinutes`)

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_JWT" \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts/run-now
```

Sets `next_run_at = NOW()`. The next minute's heartbeat sees the row
as due and ticks it.

### Release a stuck lock

```bash
curl -X POST \
  -H "Authorization: Bearer $ADMIN_JWT" \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts/release-lock
```

Stale-detection (`running_since < NOW() - 30min`) covers this
automatically inside `acquireCrawlLock`. The manual endpoint is for the
case where the operator does not want to wait the full 30-minute
window.

### Edit per-source config (e.g. extend Deezer genre list)

```bash
curl -X PATCH \
  -H "Authorization: Bearer $ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"config":{"genres":[0,132,116,152,113,165,153,144,75,84,464,129],"limit":100}}' \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts
```

The next tick reads the new config from `crawl_state.config`.

### Inspect run history

```bash
curl -H "Authorization: Bearer $ADMIN_JWT" \
  "https://admin.musiccloud.io/api/admin/crawler/runs?source=deezer-charts&page=1&limit=50"
```

Returns `CrawlerRunsPage` with paginated `CrawlerRunInfo[]`. `notes`
carries the upstream error message for `status: 'error'` runs.

## Manual smoke testing

```bash
# Local: run one tick against a dev DB.
DATABASE_URL=postgres://... npm --workspace=@musiccloud/backend run crawler:tick
```

Expected: `crawl_state` and `crawl_runs` get rows for every registered
source. Tracks land in `tracks` / `track_external_ids` /
`track_previews` / `service_links` etc. as the resolver pipeline
processes each candidate.

```bash
# Inspect: check what one tick produced.
psql $DATABASE_URL -c "SELECT source, status, discovered, ingested, skipped, errors, started_at, finished_at FROM crawl_runs ORDER BY started_at DESC LIMIT 10;"
```

## Adding a new source

1. Create `services/crawler/sources/<id>.ts` exporting one
   `CrawlerSource` object.
2. Append the import + push it onto `SOURCES` in `services/crawler/registry.ts`.
3. Write a unit test under `services/crawler/sources/__tests__/<id>.test.ts`
   that mocks `fetch` and asserts the candidate-parser output.
4. (Optional) Document upstream rate-limit assumptions in the source
   file's `@file` JSDoc.

No migration is needed. The first heartbeat tick after deploy seeds a
default `crawl_state` row via `seedCrawlState` (`ON CONFLICT DO NOTHING`).
The admin UI can then toggle the source on / edit its `config` /
trigger a `run-now`.

## Failure handling

- **Per-candidate errors** (network, parse, persist): logged with a
  `[Crawler:<source>]` prefix, counted into `crawl_runs.errors`,
  the tick continues with the next candidate.
- **Per-source fetch failure** (HTTP 5xx, network exception): logged,
  `crawl_runs.status = 'error'`, `crawl_state.consecutive_errors` ++.
  Auto-disable kicks in at 5; manual `enabled=true` re-arms the source.
- **Stale lock** (`running_since` older than 30 minutes): treated as a
  prior crash. Next heartbeat re-acquires the lock and ticks normally.
- **Cron container crash**: Zerops re-invokes the cron next minute.
  Lock-stale-detection handles any half-finished tick.

## Observability

- `crawl_runs` is the primary audit log. One row per tick that took the
  lock; idle-but-not-due minutes write nothing.
- Log lines use the `[Crawler:<source>]` prefix for grep-friendly tracing.
- The heartbeat itself logs nothing on idle ticks (avoids per-minute
  log noise).

## Tests

Unit tests live next to the code:

- `services/crawler/__tests__/dedupe.test.ts` — repo-mocked URL/ISRC paths.
- `services/crawler/__tests__/heartbeat.test.ts` — orchestration with
  registry / repo / dedupe / ingest fully mocked.
- `services/crawler/sources/__tests__/<id>.test.ts` — per-source
  fetch-mock + candidate-parser assertions.

Integration tests (skipped without `DATABASE_URL`):

- `__tests__/crawl-state-repo.integration.test.ts` — `acquireCrawlLock`
  null/held/stale paths, `completeCrawlTick` state transitions,
  auto-disable threshold, `listDueCrawlState` filter.
