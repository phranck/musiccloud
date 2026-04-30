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
mirroring `services/plugins/registry.ts`. A row in `crawl_state` whose
source id is no longer in the registry is ignored by the heartbeat
(left in place for audit).

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
to external API consumers.

## Failure handling

- **Per-candidate errors** (network, parse, persist): logged with a
  `[Crawler:<source>]` prefix, counted into `crawl_runs.errors`,
  the tick continues with the next candidate.
- **Per-source fetch failure** (HTTP 5xx, network exception): logged,
  `crawl_runs.status = 'error'`, `crawl_state.consecutive_errors` ++.
  Auto-disable kicks in at 5; a successful tick resets the counter
  back to zero.
- **Stale lock** (`running_since` older than 30 minutes): treated as
  a prior crash. The next heartbeat re-acquires the lock and ticks
  normally.
- **Cron container crash**: Zerops re-invokes the cron next minute.
  Lock-stale-detection covers any half-finished tick.

## Observability

- `crawl_runs` is the primary audit log. One row per tick that took
  the lock; idle-but-not-due minutes write nothing.
- Log lines use the `[Crawler:<source>]` prefix for grep-friendly
  tracing.
- The heartbeat itself logs nothing on idle ticks (avoids per-minute
  log noise).
