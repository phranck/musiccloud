# Crawler-Layer MVP (Deezer + Last.fm + Apple Music)

Plan-Nr.: MC-020

## Vorwort

Der User-Resolver-Pfad ist reaktiv: die kanonische Entity-DB waechst nur, wenn ein User einen Link einfuegt oder eine Suche tippt. Damit die DB ein echtes Asset wird, braucht es eine aktive Schicht: Bots, die proaktiv Charts, Genre-Tag-Listen und kuratierte Katalog-Auswahlen abgrasen und jeden Kandidaten durch die existierende Resolver-Pipeline schicken, sodass die Cross-Service-ID-Dichte (`*_external_ids`, MBID via MusicBrainz, Label via Deezer/Apple, etc.) unabhaengig von User-Last weiter waechst.

Dieser Plan liefert die erste Iteration dieser Schicht mit drei Quellen voll gebaut und Dashboard-steuerbar: Deezer Charts, Last.fm Tag-Tops und Apple Music Charts. Er legt zusaetzlich die Source-pluggable Architektur, in die zukuenftige Quellen einklinken, ohne dass Heartbeat, Lock oder State-Schema angepasst werden muessen.

## Ziel

Produktionsreifes Crawler-Subsystem aufstellen, das:

1. Auf einem Zerops `run.crontab` Heartbeat (`* * * * *`) laeuft, eine Minute Granularitaet.
2. Pro-Source Schedule, Enabled-Flag und Config aus einer `crawl_state` Tabelle liest — voll Dashboard-steuerbar zur Laufzeit.
3. Registrierte Source-Adapter aufruft, wenn faellig, jeder erzeugt eine Liste von Track-Kandidaten mit den IDs, die die Quelle traegt (ISRC fuer Deezer/Apple, MBID/Title-only fuer Last.fm).
4. Jeden Kandidaten durch die existierende Resolver-Pipeline fuehrt (`resolveUrl` fuer Deezer/Apple Track-URLs, `resolveTextSearchWithDisambiguation` fuer Last.fm Name+Artist), persistiert ueber den existierenden Pfad, sodass alles Downstream-Wiring (Cross-Service ID Aggregation, MusicBrainz-Kanonisierung, Static-vs-Dynamic Preview-Split) wiederverwendet wird.
5. Pro Ausfuehrung eine `crawl_runs` Zeile fuer Observability schreibt, plus Admin-API Endpoints fuer Enable/Disable, Frequenz, Run-Now, Lock-Release, Run-History.

Nach diesem Plan stoesst Enable einer Quelle im Dashboard innerhalb einer Minute einen wiederkehrenden Ingestion-Job an. Disable stoppt den Job innerhalb einer Minute. Eine neue Quelle in einem Folge-Plan hinzufuegen kostet nur: ein Adapter-File + eine Registry-Zeile + Tests, alles andere bleibt unveraendert.

## Design

### Architektur

```
Zerops cron (* * * * *)
  -> node apps/backend/dist/scripts/crawler-heartbeat.js
     -> SELECT * FROM crawl_state WHERE enabled = true AND next_run_at <= NOW()
     -> fuer jede faellige Source:
          - acquireCrawlLock(source) (DB-Row-Lock via running_since + Max-Runtime Stale-Detect)
          - falls Lock bereits gehalten und nicht stale: skip (naechster Heartbeat re-checked)
          - registry.get(source).fetch(state.config) -> Array<Candidate>
          - fuer jeden Candidate:
              - dedupe (ISRC in tracks.isrc OR track_external_ids; URL in tracks.source_url)
              - falls neu: ingest via existierende Resolver-Pipeline + persist
          - releaseCrawlLock(source)
          - update next_run_at = NOW() + interval_minutes
          - INSERT crawl_runs Zeile mit Summary
```

Der Heartbeat selbst ist billig: ein indizierter SELECT, Early-Return wenn nichts faellig. Die eigentliche Crawler-Last laeuft nur in den Minuten, in denen eine Source faellig ist.

### Source-pluggable Registry

```ts
// apps/backend/src/services/crawler/types.ts
export type Candidate =
  | { kind: "url"; url: string; isrc?: string }
  | { kind: "search"; title: string; artist: string };

export interface CrawlerSource {
  id: string;                                         // 'deezer-charts'
  displayName: string;                                // 'Deezer Charts'
  defaultIntervalMinutes: number;
  defaultConfig: Record<string, unknown>;
  defaultEnabled: boolean;
  fetch(config: Record<string, unknown>, cursor: unknown | null): Promise<{
    candidates: Candidate[];
    nextCursor: unknown | null;
  }>;
}
```

```ts
// apps/backend/src/services/crawler/registry.ts
const sources = new Map<string, CrawlerSource>();
export function registerCrawlerSource(s: CrawlerSource) { sources.set(s.id, s); }
export function getCrawlerSource(id: string) { return sources.get(id) ?? null; }
export function listCrawlerSources() { return [...sources.values()]; }

// Imports loesen Registrierung aus (analog zu Plugin-Registry)
import { deezerChartsSource } from "./sources/deezer-charts.js";
import { lastFmTagsSource } from "./sources/lastfm-tags.js";
import { appleMusicChartsSource } from "./sources/apple-music-charts.js";
registerCrawlerSource(deezerChartsSource);
registerCrawlerSource(lastFmTagsSource);
registerCrawlerSource(appleMusicChartsSource);
```

### Schema

Migration 0023 (Drizzle-generated):

```sql
CREATE TABLE "crawl_state" (
  "source"             text PRIMARY KEY NOT NULL,
  "display_name"       text NOT NULL,
  "enabled"            boolean NOT NULL DEFAULT false,
  "interval_minutes"   integer NOT NULL DEFAULT 360,
  "next_run_at"        timestamptz NOT NULL DEFAULT NOW(),
  "last_run_at"        timestamptz,
  "cursor"             jsonb,
  "config"             jsonb NOT NULL DEFAULT '{}'::jsonb,
  "running_since"      timestamptz,
  "error_count"        integer NOT NULL DEFAULT 0,
  "last_error"         text,
  "consecutive_errors" integer NOT NULL DEFAULT 0
);

CREATE INDEX "idx_crawl_state_due" ON "crawl_state"("next_run_at") WHERE "enabled" = true;

CREATE TABLE "crawl_runs" (
  "id"           text PRIMARY KEY NOT NULL,
  "source"       text NOT NULL,
  "started_at"   timestamptz NOT NULL,
  "finished_at"  timestamptz,
  "status"       text NOT NULL,                       -- 'running' | 'success' | 'error' | 'aborted' | 'skipped'
  "discovered"   integer NOT NULL DEFAULT 0,
  "ingested"     integer NOT NULL DEFAULT 0,
  "skipped"      integer NOT NULL DEFAULT 0,
  "errors"       integer NOT NULL DEFAULT 0,
  "notes"        text
);

CREATE INDEX "idx_crawl_runs_source_started" ON "crawl_runs"("source", "started_at" DESC);
```

### Idempotentes Registry-Seeding

Migration 0023 erstellt nur die Tabellen. Die erste Aktion jedes Heartbeat-Runs ist ein idempotenter Upsert jeder Registry-bekannten Source, einfuegen einer Default-Config-Zeile falls noch keine existiert:

```sql
INSERT INTO crawl_state (source, display_name, enabled, interval_minutes, config)
VALUES ($1, $2, $3, $4, $5::jsonb)
ON CONFLICT (source) DO NOTHING;
```

Eine zukuenftige Source der Registry hinzufuegen braucht damit null Migrations-Arbeit — ihre Zeile erscheint die erste Minute, in der der neue Code deployed ist und der Heartbeat tickt. Eine Source aus der Registry zu entfernen laesst die Zeile in `crawl_state` stehen; der Heartbeat ignoriert Zeilen, deren Source-ID nicht mehr in der Registry aufloesst, aber die Zeile bleibt fuer Audit-Traceability.

### Locking

```ts
// apps/backend/src/services/crawler/lock.ts
export async function acquireCrawlLock(source: string, maxRunMs = 30 * 60 * 1000): Promise<boolean> {
  const result = await pool.query(
    `UPDATE crawl_state
       SET running_since = NOW()
       WHERE source = $1
         AND (running_since IS NULL OR running_since < NOW() - $2 * INTERVAL '1 millisecond')
       RETURNING source`,
    [source, maxRunMs],
  );
  return result.rowCount === 1;
}

export async function releaseCrawlLock(source: string): Promise<void> {
  await pool.query(
    `UPDATE crawl_state SET running_since = NULL, last_run_at = NOW() WHERE source = $1`,
    [source],
  );
}
```

Stale-Detection (`running_since < NOW() - maxRunMs`) deckt den Fall ab, dass ein vorheriger Heartbeat gecrasht ist oder der Container mid-Run gekillt wurde, sodass ein steckengebliebener `running_since` nicht ewig blockiert.

### Dedupe

```ts
// apps/backend/src/services/crawler/dedupe.ts
export async function isAlreadyIngested(c: Candidate): Promise<boolean> {
  if (c.kind === "url") {
    const byUrl = await pool.query(`SELECT 1 FROM tracks WHERE source_url = $1 LIMIT 1`, [c.url]);
    if (byUrl.rowCount) return true;
    if (c.isrc) {
      const byIsrc = await pool.query(
        `SELECT 1 FROM tracks WHERE isrc = $1
         UNION ALL SELECT 1 FROM track_external_ids WHERE id_type = 'isrc' AND id_value = $1
         LIMIT 1`,
        [c.isrc],
      );
      if (byIsrc.rowCount) return true;
    }
    return false;
  }
  // Fuer "search" Candidates koennen wir nicht per ID vor-deduplizieren (Last.fm hat keine ISRC).
  // Verlassen uns auf den existierenden Resolver-Cache-Hit auf Title+Artist; Kosten sind ein
  // weiterer In-Memory-Lookup, kein Duplicate-Persist.
  return false;
}
```

### Ingest

Faktorisiert aus existierendem `routes/resolve.ts:persistTrackAndRespond`. Crawler braucht keine HTTP-Response-Shape, nur die Persist-Side-Effects.

```ts
// apps/backend/src/services/crawler/ingest.ts
export async function ingestCandidate(c: Candidate): Promise<{ status: "ingested" | "skipped" | "error" }> {
  try {
    const result =
      c.kind === "url"
        ? await resolveUrl(c.url)
        : await resolveTextSearchWithDisambiguation(buildSearchQuery(c.title, c.artist)).then(
            // Bei Search-Resultaten: Top-Kandidat nehmen; ambigue Suchen werden geskippt
            // (Disambiguation ist nicht Crawler-Aufgabe)
            (r) => (r.kind === "resolved" ? r.result : null),
          );
    if (!result) return { status: "skipped" };
    await persistResolution(result);                  // Shared Core extrahiert aus routes/resolve.ts
    return { status: "ingested" };
  } catch (err) {
    log.error("Crawler", `Ingest failed: ${err instanceof Error ? err.message : err}`);
    return { status: "error" };
  }
}
```

Der Shared `persistResolution(result)` Core ist das neue Zuhause fuer den Persist + External-IDs + Preview-Upserts Block, der aktuell in `routes/resolve.ts:persistTrackAndRespond` inlined ist. Extraktion laesst Route UND Crawler einen Persistenz-Pfad teilen; beide Call-Sites werden duenn.

### Heartbeat

```ts
// apps/backend/src/services/crawler/heartbeat.ts
export async function runHeartbeat(): Promise<void> {
  const dueSources = await pool.query(
    `SELECT source, config, cursor, interval_minutes FROM crawl_state
     WHERE enabled = true AND next_run_at <= NOW() AND running_since IS NULL
     ORDER BY next_run_at ASC`,
  );
  for (const row of dueSources.rows) {
    await runSourceTick(row.source, row.config, row.cursor);
  }
}
```

Tick pro Source:

1. `acquireCrawlLock(source)` — abbrechen wenn gehalten.
2. Insert `crawl_runs` Zeile mit Status `running`.
3. `getCrawlerSource(source).fetch(config, cursor)` liefert `{ candidates, nextCursor }`.
4. Fuer jeden Candidate: `isAlreadyIngested` → falls nicht, `ingestCandidate` → Counter zaehlen.
5. Update `crawl_state`: `next_run_at = NOW() + interval_minutes`, `cursor = nextCursor`, `consecutive_errors = 0` bei Erfolg oder `+= 1` bei Fehler. Falls `consecutive_errors >= 5`, automatisch `enabled = false` setzen und `last_error` schreiben.
6. Update `crawl_runs` Zeile mit `status = 'success' | 'error'`, Counter, `finished_at = NOW()`.
7. `releaseCrawlLock(source)`.

### Source: Deezer Charts

```ts
// apps/backend/src/services/crawler/sources/deezer-charts.ts
export const deezerChartsSource: CrawlerSource = {
  id: "deezer-charts",
  displayName: "Deezer Charts",
  defaultIntervalMinutes: 360,
  defaultEnabled: true,
  defaultConfig: {
    genres: [0, 132, 116, 152, 113, 165, 153, 144, 75, 173], // global + Pop, Rap/HipHop, Rock, Dance, Jazz, Classical, R&B, Reggae, Country, Metal
    limit: 100,
  },
  async fetch(config) {
    const { genres, limit } = config as { genres: number[]; limit: number };
    const candidates: Candidate[] = [];
    for (const genreId of genres) {
      const url = `https://api.deezer.com/chart/${genreId}/tracks?limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json() as { data?: Array<{ link: string; isrc?: string }> };
      for (const t of json.data ?? []) {
        if (t.link) candidates.push({ kind: "url", url: t.link, isrc: t.isrc });
      }
      await sleep(250); // hoeflich unter informellem ~50/5s Ceiling
    }
    return { candidates, nextCursor: null };
  },
};
```

Verifiziert via [Deezer-Community ISRC Beispiel](https://en.deezercommunity.com/features-feedback-44/api-search-for-all-tracks-by-isrc-74109): Chart-Endpoint Response enthaelt `isrc` pro Track. Genre-IDs aus `https://api.deezer.com/genre`.

### Source: Last.fm Tag Tops

```ts
// apps/backend/src/services/crawler/sources/lastfm-tags.ts
export const lastFmTagsSource: CrawlerSource = {
  id: "lastfm-tags",
  displayName: "Last.fm Tag Tops",
  defaultIntervalMinutes: 1440,
  defaultEnabled: true,
  defaultConfig: {
    tags: ["rock", "electronic", "jazz", "classical", "hip-hop", "pop", "country", "indie", "metal", "world"],
    limit: 50,
  },
  async fetch(config) {
    const apiKey = process.env.LASTFM_API_KEY;
    if (!apiKey) throw new Error("LASTFM_API_KEY missing");
    const { tags, limit } = config as { tags: string[]; limit: number };
    const candidates: Candidate[] = [];
    for (const tag of tags) {
      const url = `https://ws.audioscrobbler.com/2.0/?method=tag.gettoptracks&tag=${encodeURIComponent(tag)}&limit=${limit}&api_key=${apiKey}&format=json`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json() as { tracks?: { track?: Array<{ name: string; artist: { name: string } }> } };
      for (const t of json.tracks?.track ?? []) {
        candidates.push({ kind: "search", title: t.name, artist: t.artist.name });
      }
      await sleep(250); // 5 req/s Ceiling, gemittelt ueber 5min Fenster
    }
    return { candidates, nextCursor: null };
  },
};
```

Last.fm `tag.getTopTracks` enthaelt keine ISRC und keine Per-Track MBID (verifiziert via [api/show/tag.getTopTracks](https://www.last.fm/api/show/tag.getTopTracks)). Der Crawler verlaesst sich darauf, dass der Resolver Title+Artist in eine vollstaendige Cross-Service-Identitaet anreichert. Rate-Limit per [Last.fm TOS §4.4](https://www.last.fm/api/tos): 5 req/s gemittelt ueber 5 Minuten.

### Source: Apple Music Charts

```ts
// apps/backend/src/services/crawler/sources/apple-music-charts.ts
export const appleMusicChartsSource: CrawlerSource = {
  id: "apple-music-charts",
  displayName: "Apple Music Charts",
  defaultIntervalMinutes: 720,
  defaultEnabled: false, // Apple Music API Outage berichtet April 2026 (Forum-Reports 401/500 auf Catalog-Endpoints); Operator aktiviert wenn stabil
  defaultConfig: {
    storefronts: ["us", "gb", "de"],
    chart: "most-played",
    types: ["songs"],
    limit: 50,
  },
  async fetch(config) {
    const { storefronts, chart, types, limit } = config as {
      storefronts: string[];
      chart: string;
      types: string[];
      limit: number;
    };
    const candidates: Candidate[] = [];
    for (const sf of storefronts) {
      const qs = new URLSearchParams({ types: types.join(","), chart, limit: String(limit) });
      // appleMusicFetch wraps JWT auth + token cache + Promise-coalescing
      // (apple-music/adapter.ts:289 — already exported, no re-export needed).
      const res = await appleMusicFetch(`/catalog/${sf}/charts?${qs}`);
      if (!res.ok) continue;
      const json = (await res.json()) as { results?: { songs?: Array<{ data: Array<{ attributes: { url: string; isrc?: string } }> }> } };
      for (const block of json.results?.songs ?? []) {
        for (const song of block.data) {
          if (song.attributes.url) candidates.push({ kind: "url", url: song.attributes.url, isrc: song.attributes.isrc });
        }
      }
    }
    return { candidates, nextCursor: null };
  },
};
```

Endpoint per [WWDC21 Catalog Charts Session](https://developer.apple.com/videos/play/wwdc2021/10291/) und [Apple Music API Docs](https://developer.apple.com/documentation/applemusicapi/charts). Catalog-Song-Resourcen (`type: songs`) enthalten `isrc` in Attributes — verifiziert via [Songs.Attributes Data Dictionary](https://developer.apple.com/documentation/applemusicapi/songs/attributes-data.dictionary).

### Admin API

`apps/backend/src/routes/admin/crawler.ts`, gemounted unter existierendem Admin-JWT preHandler:

| Method | Path | Body / Query | Effekt |
| --- | --- | --- | --- |
| GET | `/api/admin/crawler/sources` | — | Liste aller `crawl_state` Zeilen joined mit Registry-bekannten Sources |
| PATCH | `/api/admin/crawler/sources/:id` | `{ enabled?, intervalMinutes?, config?, cursor? }` | Updated mutable Felder. Validiert Registry-bekannt. |
| POST | `/api/admin/crawler/sources/:id/run-now` | — | `UPDATE crawl_state SET next_run_at = NOW()` — Heartbeat picked up naechste Minute |
| POST | `/api/admin/crawler/sources/:id/release-lock` | — | `UPDATE crawl_state SET running_since = NULL` — clearet Stale-Lock |
| GET | `/api/admin/crawler/runs` | `?source=<id>&page=<n>&limit=<m>` | Paginated `crawl_runs` Query |

Dashboard-UI ist eigener Plan, nicht Teil dieses MVP. Endpoints sind via curl testbar (Admin-JWT oder lokales Admin-Login) bevor UI landet.

### Failure-Handling

- Per-Candidate Ingest-Failure: `errors` Counter auf Run-Zeile inkrementieren, mit Source-Prefix loggen, weiter.
- Per-Source `fetch` Failure (HTTP 5xx, Netzwerk): `crawl_state.consecutive_errors` inkrementieren. Bei Threshold (5) automatisch deaktivieren (`enabled = false`) und `last_error` speichern. Manuelles Re-Enable im Dashboard.
- Stale Lock: `running_since < NOW() - 30min` wird als gecrasht behandelt; naechster Heartbeat nimmt Lock.
- Heartbeat-Script-Crashes: Zerops cron re-invoked naechste Minute. Lock-Stale-Window deckt steckengebliebene Runs.

### Observability

- `crawl_runs` Zeilen sind primaeres Audit-Log. Counter pro Run: discovered / ingested / skipped / errors.
- Alle Log-Zeilen nutzen `[Crawler:<source>]` Prefix fuer Grep-freundliches Tracing.
- Heartbeat selbst loggt nichts wenn keine Sources faellig (vermeidet Log-Noise vom Per-Minute-Tick).

### Reuse von existierendem Code

- `apps/backend/src/services/plugins/apple-music/adapter.ts` — existierenden **bereits exportierten** `appleMusicFetch(endpoint)` Helper (`adapter.ts:289`) direkt nutzen. Wrappt JWT-Auth + Token-Cache + Promise-Coalescing über `getDevToken()` ein. Kein neuer Auth-Code, kein zusätzlicher Re-Export nötig (interner `generateToken()` bleibt privat).
- `apps/backend/src/services/resolver.ts` — `resolveUrl`, `resolveTextSearchWithDisambiguation` direkt aufgerufen.
- `apps/backend/src/routes/resolve.ts` — `persistResolution(result)` Shared Core extrahieren; Route-Handler und Crawler beide rufen ihn.
- `apps/backend/src/db/repository.ts` — existierende Methoden `persistTrackWithLinks`, `addTrackExternalIds`, `upsertTrackPreview` unveraendert genutzt.

## Files

### Hinzufuegen

- `apps/backend/src/db/migrations/postgres/0023_crawl_state.sql` (Drizzle-generated)
- `apps/backend/src/db/schemas/postgres.ts` — `crawlState`, `crawlRuns` Tables
- `apps/backend/src/services/crawler/types.ts`
- `apps/backend/src/services/crawler/registry.ts`
- `apps/backend/src/services/crawler/dedupe.ts`
- `apps/backend/src/services/crawler/ingest.ts`
- `apps/backend/src/services/crawler/heartbeat.ts`
- `apps/backend/src/services/crawler/sources/deezer-charts.ts`
- `apps/backend/src/services/crawler/sources/lastfm-tags.ts`
- `apps/backend/src/services/crawler/sources/apple-music-charts.ts`
- `apps/backend/src/scripts/crawler-heartbeat.ts`
- `apps/backend/src/routes/admin-crawler.ts`
- `apps/backend/src/__tests__/crawler-deezer.test.ts`
- `apps/backend/src/__tests__/crawler-lastfm.test.ts`
- `apps/backend/src/__tests__/crawler-apple-music.test.ts`
- `apps/backend/src/__tests__/crawler-heartbeat.test.ts`
- `apps/backend/src/__tests__/crawler-lock.test.ts`
- `apps/backend/docs/crawler-architecture.md`

### Modifizieren

- `apps/backend/src/routes/resolve.ts` — `persistResolution(result)` Shared Core extrahieren; sowohl `persistTrackAndRespond` als auch Crawler rufen ihn
- `apps/backend/src/db/repository.ts` — Methoden `findCrawlState`, `updateCrawlState`, `insertCrawlRun`, `finalizeCrawlRun`, `listCrawlRuns` ergaenzen
- `apps/backend/src/db/adapters/postgres.ts` — Postgres-Implementierungen obiger Methoden
- `apps/backend/src/server.ts` — `adminCrawlerRoutes` registrieren
- `apps/backend/package.json` — `crawler:tick` Script ergaenzen (`node dist/scripts/crawler-heartbeat.js`)
- `apps/backend/tsup.config.ts` — `entry`-Array um `"src/scripts/crawler-heartbeat.ts"` erweitern. Aktuell baut tsup nur `src/server.ts`; ohne diesen Eintrag landet kein `dist/scripts/crawler-heartbeat.js` im Build und das Cron-Command schlaegt mit `cannot find module` fehl.
- `zerops.yml` (Repo-Root, nicht `apps/backend/`) — Backend-Service `run.crontab` Entry. Schema-verified 2026-04-30 against `https://docs.zerops.io/zerops-yaml/cron`: required fields are `command`, `timing`, `allContainers`, `workingDir`.
  ```yaml
  run:
    crontab:
      - command: "node apps/backend/dist/scripts/crawler-heartbeat.js"
        timing: "* * * * *"
        allContainers: false
        workingDir: /var/www
  ```
- `packages/shared/src/crawler.ts` (NEW) — `CrawlerSourceInfo`, `CrawlerRunInfo`, `CrawlerRunsPage` response types (mirrors `packages/shared/src/plugins.ts`).
- `packages/shared/src/index.ts` — re-export crawler types.
- `packages/shared/src/endpoints.ts` — `admin.crawler` block in `ENDPOINTS` + `ROUTE_TEMPLATES`.

## Verifikation

### Unit

- `dedupe`: bekannter ISRC in `tracks.isrc` returned true; selber ISRC nur in `track_external_ids` returned auch true; fehlender ISRC returned false; URL-Match wenn ISRC absent.
- `acquireCrawlLock`: erfolgreich wenn `running_since IS NULL`; fehlschlaegt wenn gehalten und nicht stale; erfolgreich wenn gehalten aber stale (`running_since < NOW() - maxRunMs`).
- `runHeartbeat`: skipped disabled Zeilen; skipped Zeilen mit `next_run_at > NOW()`; ruft registrierte Sources auf; updated `next_run_at` nach Erfolg; auto-deaktiviert Source nach 5 consecutive Errors.
- Jeder Source-Adapter: HTTP-Endpoint mocken, parsen der Response-Shape pruefen, erwartetes `Candidate[]` asserten.

### Integration (`DATABASE_URL` gesetzt)

- `crawl_state` Zeile einfuegen mit `enabled = true, interval_minutes = 1, next_run_at = NOW()`. Heartbeat laufen lassen. Asserten: Lock genommen, Source-Fetch invoked, `crawl_runs` Zeile mit Non-Zero-Counters erstellt, `next_run_at` ~1min vorgerueckt, Lock released.
- Heartbeat zweimal in schneller Folge mit Long-Running-Source-Mock laufen lassen: zweiter Run-Lock-Acquisition fehlschlaegt; `crawl_runs` zeigt Status `skipped` fuer diese Minute.

### Manueller Smoke

- Lokal: `npm --workspace=@musiccloud/backend run crawler:tick` mit `DATABASE_URL` und `LASTFM_API_KEY` gesetzt. Erwartung: Deezer + Last.fm Zeilen erscheinen in `tracks` / `track_external_ids` nach Script-Exit.
- Apple-Music-Smoke deferred bis API-Outage geklaert (April 2026 Forum-Reports laufen weiter); im Seed `enabled = false`.

### Admin-API Smoke

```bash
# Nach Deploy, mit Admin-JWT:
curl -H "Authorization: Bearer $ADMIN_JWT" https://admin.musiccloud.io/api/admin/crawler/sources
curl -X PATCH -H "Authorization: Bearer $ADMIN_JWT" -d '{"enabled":false}' \
  https://admin.musiccloud.io/api/admin/crawler/sources/lastfm-tags
curl -X POST -H "Authorization: Bearer $ADMIN_JWT" \
  https://admin.musiccloud.io/api/admin/crawler/sources/deezer-charts/run-now
```

## Out of Scope

- Dashboard-UI (separater Folge-Plan: List, Toggle, Edit-Config-Form, Run-History-Page)
- MusicBrainz Replication-basierte Bulk-Ingestion (andere Architektur: Postgres-Replica + Replication-Packets-Daemon — eigener Plan)
- Token-Pool / Multi-Account Rotation fuer rate-limited Sources (nur relevant falls eine zukuenftige Spotify- oder MB-Replication-Source hinzukommt)
- Crawler-getriebene Artist-Discovery-Flows (heutiger Resolver ist Track-zentrisch; Artist-Crawls brauchen eigene Persist-Pfade)
- Per-Storefront / Per-Region Cursor-Advancement jenseits des einfachen "Last-N-from-Chart" Modells (Future: Last.fm `tag.getTopTracks` ueber Pages paginieren, oder Apple Music `daily-global-top` per City)
- Backpressure / Queueing falls Ingestion nicht hinterherkommt (MVP laeuft inline; falls Source-Candidate-Volumen Heartbeat-Kapazitaet uebersteigt, kann Folge-Plan eine Postgres-backed `crawl_queue` Tabelle hinzufuegen)

## Checklist

### Schema + Repo
- [ ] `crawlState` + `crawlRuns` zu `db/schemas/postgres.ts` hinzufuegen
- [ ] Migration 0023 mit `npm run db:generate` (Repo-Root) generieren
- [ ] Repo-Methoden + Adapter-Implementierungen fuer alle `crawl_state` / `crawl_runs` Operationen
- [ ] Heartbeat upsertet idempotent eine Default-Zeile pro Registry-bekannter Source bei jedem Tick (ON CONFLICT DO NOTHING)

### Core
- [ ] `services/crawler/types.ts` — `Candidate`, `CrawlerSource`
- [ ] `services/crawler/registry.ts` — static `SOURCES` array (mirror `services/plugins/registry.ts:102`)
- [ ] `services/crawler/dedupe.ts` — `repo.findTrackByUrl` / `repo.findTrackByIsrc` (Aggregation-Table-Fallback eingebaut)
- [ ] `services/crawler/ingest.ts` — `ingestCandidate` wrapping Shared `persistResolution`
- [ ] `services/crawler/heartbeat.ts` — `runHeartbeat` + Per-Source Tick-Orchestrierung
- [ ] `persistResolution(result)` aus `routes/resolve.ts:persistTrackAndRespond` extrahieren; Route + Crawler rufen beide

### Sources
- [ ] `sources/deezer-charts.ts` — keyless, ISRC-reich, default-enabled, 360min
- [ ] `sources/lastfm-tags.ts` — nutzt `LASTFM_API_KEY`, Search-Candidates, default-enabled, 1440min
- [ ] `sources/apple-music-charts.ts` — re-used `getDeveloperToken()`, default-disabled (API-Outage), 720min

### Admin API
- [ ] `routes/admin/crawler.ts` — GET sources, PATCH source, POST run-now, POST release-lock, GET runs
- [ ] Mounted unter existierendem Admin-JWT preHandler in `server.ts`

### Cron
- [ ] `scripts/crawler-heartbeat.ts` — Entrypoint-Script (ruft `runHeartbeat`, exit)
- [ ] `tsup.config.ts` — `entry`-Array um `src/scripts/crawler-heartbeat.ts` erweitern (sonst landet kein `dist/scripts/crawler-heartbeat.js` im Build)
- [ ] `package.json` — `crawler:tick` Script
- [ ] `zerops.yml` — Backend-Service `run.crontab` mit `* * * * *` Heartbeat

### Tests
- [ ] Unit: Dedupe, Lock, Heartbeat-Orchestrierung, jeder Source-Adapter-Parser
- [ ] Integration (`DATABASE_URL`): Heartbeat-Tick End-to-End, Lock-Contention, Auto-Disable bei Errors
- [ ] Manuelle Smoke-Anweisungen in `docs/crawler-architecture.md`

### Docs
- [ ] `apps/backend/docs/crawler-architecture.md` — Architektur-Uebersicht, Source-Adapter-Contract, Ops-Playbook (Enable/Disable, Lock-Release, Run-History-Queries)
- [ ] `apps/backend/docs/crawler-runbook.md` (optional, kann in Architecture-Doc gefaltet werden) — Pre-Deploy-Checklist fuer neue Sources

### Rollout
- [ ] PR 1 — Schema + Core + Registry + Deezer-Source + Admin-API + Tests + Docs. Push, CI, Deploy.
- [ ] PR 2 — Last.fm-Source + Tests. Push, CI, Deploy.
- [ ] PR 3 — Apple-Music-Source + Tests (default-disabled). Push, CI, Deploy.
- [ ] Nach jedem PR in Prod verifizieren: Heartbeat erscheint in Service-Logs jede Minute; Admin-API antwortet; `crawl_runs` Zeilen akkumulieren wie erwartet.

## Verified facts

Re-verifiziert 2026-04-30 gegen Repo-State auf `main @ aa9c1935`. Alle konkreten Code-Refs greppt + Files vollstaendig gelesen.

- `routes/resolve.ts:340` `persistTrackAndRespond` (Persist + Response-Build, Task D extrahiert `persistResolution` davon) — Read komplett
- `services/resolver.ts:464` `export async function resolveUrl` — Read komplett
- `services/resolver.ts:637` `export async function resolveTextSearchWithDisambiguation` — Read komplett
- `services/plugins/apple-music/adapter.ts:203` interner `generateToken()` (privat — Plan nutzt stattdessen den exportierten Helper)
- `services/plugins/apple-music/adapter.ts:289` `export async function appleMusicFetch(endpoint)` — wrappt JWT-Auth + Token-Cache
- `services/plugins/apple-music/adapter.ts:259` `getDevToken()` (private; via appleMusicFetch genutzt) + `:273` `warmAppleMusicToken` (export, gerufen in server.ts:498)
- `db/schemas/postgres.ts:607-624` `crawlState` Tabelle — Spalten match Plan-§Schema verbatim
- `db/schemas/postgres.ts:634-648` `crawlRuns` Tabelle — Spalten match Plan-§Schema verbatim
- `db/migrations/postgres/0023_crawl_state.sql` — generated, Inhalt match Plan-§Schema
- `db/repository.ts` 338 Zeilen — `TrackRepository` interface, klare Erweiterungs-Stelle vor `close()` Methode (Read komplett)
- `db/adapters/postgres.ts` 3141 Zeilen — `PostgresAdapter implements TrackRepository, AdminRepository`, Erweiterung am Klassen-Ende (Read komplett)
- `db/index.ts:11,22,37` Bootstrap-Pattern `getRepository()` / `ensureInstance()` / `closeRepository()` — Crawler-Heartbeat-Entrypoint nutzt das gleiche
- `lib/short-id.ts:9` `generateShortId()` (5-Char nanoid) — fuer `crawl_runs.id` geeignet
- `server.ts:464` `adminApp.addHook("preHandler", adminApp.authenticateAdmin)` — Plan-§Admin-API mountet `adminCrawlerRoutes` exakt nach diesem Muster
- `server.ts:498` `warmAppleMusicToken()` Pre-Warm beim Start
- `package.json:23` `db:generate` jetzt `drizzle-kit generate --config=drizzle.config.postgres.ts` (gefixt in `aa9c1935`)
- `apps/backend/package.json:2` Workspace-Name `@musiccloud/backend` (Plan-§Manueller-Smoke-Aufruf korrekt)
- `apps/backend/tsup.config.ts:4` `entry: ["src/server.ts"]` — **Plan-§Files-Modifizieren patched (Drift 1 fix)**: `src/scripts/crawler-heartbeat.ts` muss als zweiter Entrypoint hinzu, sonst landet kein `dist/scripts/*.js` im Build
- `apps/backend/scripts/copy-jimp-fonts.mjs` (build-time helper, nicht gebuendelt) vs. `apps/backend/src/scripts/*.ts` (gebuendelt durch tsup) — Crawler-Heartbeat-Script gehoert in `src/scripts/`
- `zerops.yml:35` `LASTFM_API_KEY` als Zerops-Secret dokumentiert — Plan-§Source-Last.fm setzt es voraus
- Migration-Slot 0023 belegt durch `0023_crawl_state.sql` (Task A consumed)
- `tracks.isrc`, `tracks.source_url`, `track_external_ids` Spalten — schema-File verifiziert
- `idx_crawl_state_due` partial index `WHERE enabled = true` — in 0023_crawl_state.sql + schemas/postgres.ts:623

## Open questions (unverified)

Refs die offline nicht endgueltig pruefbar sind. Vor Task-Execute klaeren:

- **Apple Music Charts API Endpoint** (`/v1/catalog/{sf}/charts?types=&chart=&limit=`): Forum-Reports April 2026 melden 401/500 auf Catalog-Endpoints. Source ist `defaultEnabled: false`; vor Aktivierung manuell smoken. (Task F)

## Drift updates (2026-04-30 after Task B, commit 871c5d84)

Task B migrated all crawl-state and crawl-runs DB access to `TrackRepository` methods (`db/repository.ts` + `db/adapters/postgres.ts`). The plan code-snippets in §Source-pluggable-Registry, §Locking, §Dedupe, §Heartbeat, §Tick written before that migration are now obsolete in their plumbing — the SQL is unchanged but the call-site is the repo, not raw `pool.query`. Concrete updates:

- **Lock-Modul entfällt**: no `services/crawler/lock.ts` file. The heartbeat calls `repo.acquireCrawlLock(source, maxRunMs)` and `repo.completeCrawlTick(source, outcome)` directly. Stale-detection (`running_since < NOW() - $maxRunMs`) and auto-disable on `consecutive_errors >= 5` already live in those methods. The §Locking code snippet stands as design rationale only.
- **Heartbeat-Probe**: `repo.listDueCrawlState()` replaces the raw SELECT in §Heartbeat. Same WHERE-clause (`enabled = true AND next_run_at <= NOW() AND running_since IS NULL`).
- **Tick-State-Updates**: §Tick steps 5–6 use `repo.completeCrawlTick`, `repo.insertCrawlRun`, `repo.finalizeCrawlRun`. Counter aggregation and `next_run_at` advance are atomic per `completeCrawlTick`.
- **Dedupe**: `repo.findTrackByUrl(url)` and `repo.findTrackByIsrc(isrc)` replace raw SQL in §Dedupe. `findTrackByIsrc` already falls back to `track_external_ids` (`postgres.ts:333-361`), so the aggregation-table union the plan describes is included for free.
- **Registry-Pattern**: static `SOURCES` array in `crawler/registry.ts`, mirroring `services/plugins/registry.ts:102` (`PLUGINS = [deezerPlugin, ...]`). No `Map + registerCrawlerSource(...)` side-effect imports — the project's existing convention is build-time array literal, not runtime registration.
- **Idempotent seeding**: `repo.seedCrawlState(seed)` (one call per static-array entry on each heartbeat tick). `ON CONFLICT DO NOTHING` lives inside the repo method.

### Drift updates (2026-04-30 before Task D, audit against `main @ ba42be97`)

Repo-conventions verified by `ls` / `grep` in this session before Task D started. The §Architektur, §Admin-API, §Files, and §Cron snippets written before that probe contain assumptions that don't match the actual repo:

- **Admin route convention**: `apps/backend/src/routes/admin/` does not exist as a sub-directory. The repo flat-namespaces every admin route file: `routes/admin-analytics.ts`, `routes/admin-content.ts`, `routes/admin-plugins.ts`, etc. Crawler admin routes file must be `routes/admin-crawler.ts` (flat), not `routes/admin/crawler.ts` (nested).
- **`src/scripts/` directory**: also does not exist yet. Build-time helpers live in `apps/backend/scripts/` (`copy-jimp-fonts.mjs`); runtime-bundled scripts go in `apps/backend/src/scripts/`. The crawler heartbeat is the first runtime-bundled script and creates that directory.
- **`crawler:tick` npm script location**: backend-package, not root. The root `package.json` carries cross-workspace orchestration scripts (`db:generate`, `db:migrate`); per-app runtime scripts live in `apps/backend/package.json`. Invocation: `npm --workspace=@musiccloud/backend run crawler:tick`.
- **Zerops `run.crontab` schema** (verified 2026-04-30 against `https://docs.zerops.io/zerops-yaml/cron`): four fields required per entry — `command`, `timing`, `allContainers`, `workingDir`. The original §Files-Modifizieren snippet was missing `allContainers`; corrected inline above.
- **Admin-API endpoint convention**: existing admin routes consume `ENDPOINTS.admin.<area>` and `ROUTE_TEMPLATES.admin.<area>` from `packages/shared/src/endpoints.ts`, plus typed response shapes from co-located shared modules (e.g. `PluginInfo` lives in `packages/shared/src/plugins.ts`, re-exported via `index.ts`). The crawler admin API follows the same shape: new `packages/shared/src/crawler.ts` for response types, new `admin.crawler` blocks in `ENDPOINTS` and `ROUTE_TEMPLATES`.

## Completed

PR 1 implementiert und in `main` gemerged 2026-04-30. Tasks A-E plus Begleit-Arbeit:

- `bad4c10c` — Task A: Schema + Migration 0023 (`crawl_state` + `crawl_runs` Tabellen + `idx_crawl_state_due` partial index)
- `cf021172` — Chore: dead `backfill:preview-urls` script entfernt
- `871c5d84` — Task B: 8 Crawler-Types + 10 Methoden auf `TrackRepository`, Postgres-Adapter-Implementierungen
- `28f01ddd` — Refactor: `persistResolution` aus `routes/resolve.ts:persistTrackAndRespond` extrahiert (geteilter Core für Route + Crawler)
- `ba42be97` — Task C: Crawler-Core (`types.ts`, `registry.ts` static SOURCES array, `dedupe.ts`, `ingest.ts`, `heartbeat.ts`) + Deezer-Charts-Source
- `1251f7d8` — Task D: Admin-API (`adminCrawlerRoutes`, 5 Endpoints) + Cron-Heartbeat-Entrypoint + tsup-Entry erweitert + zerops.yml `run.crontab` Block + shared `CrawlerSourceInfo`/`CrawlerRunInfo`/`CrawlerRunsPage` Types
- `276869ec` — Task E: Unit-Tests (dedupe, heartbeat, deezer-charts) + Integration-Test (crawl-state-repo, skipped ohne `DATABASE_URL`); 828/828 passing
- `0077712f` — Docs: erste Version von `apps/backend/docs/crawler-architecture.md` (später nach `docs/` migriert)

Operativ:
- PR 2 (Last.fm-Source) und PR 3 (Apple-Music-Source) sind als zukünftige Iterationen geplant; nicht Teil dieses Plans.
- Manueller Smoke nach Zerops-Auto-Deploy ausstehend (offen in operationaler Liste).
