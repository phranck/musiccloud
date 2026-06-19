# ISRC / UPC / External-ID Aggregation Schema

Plan-Nr.: MC-005

## Context

musiccloud entwickelt sich neben dem Unified-Short-URL-Service zu einer Musik-Suchmaschine und einem Daten-Aggregator. Das geplante Geschäft umfasst künftig: proaktive Crawler über Streaming-Plattformen, Vereinheitlichung in einer kanonischen DB, Monetarisierung der API.

Der heutige Datenmodell-Engpass dabei: **pro Track wird genau ein ISRC gespeichert (`tracks.isrc`)**, **pro Album genau ein UPC (`albums.upc`)** — der vom Source-Adapter gelieferte Wert. Andere ISRCs/UPCs derselben Aufnahme/Veröffentlichung (regionale Varianten, Re-Releases, Album-Editionen, Re-Master) gehen verloren, obwohl sie für späteres Cross-Matching kritisch sind.

Außerdem fehlt ein Platz für andere External-IDs, die in der weiteren Strategie wichtig werden:
- **MBID** (MusicBrainz Recording-ID) — kanonische internationale Aufnahme-Identität
- **ISWC** (International Standard Musical Work Code) — Werks-Identität (mehrere Aufnahmen desselben Werks)
- **AcoustID** — Audio-Fingerprint, ID-loses Matching wenn ISRC fehlt

Dieser Plan zieht das Aggregations-Schema vor, bevor die Spotify-Mitigation umgesetzt wird, weil die Mitigation in jedem Resolve-Schritt zusätzliche IDs einsammeln und ablegen soll. Ohne das Schema landet diese Datensammlung nirgends.

## Design

### Generische External-ID-Tabelle pro Entity

Statt `track_isrcs`, `track_iswcs`, `track_mbids` einzeln: eine einzige Tabelle pro Entity-Typ, die jede Art von externer ID aufnimmt. Spart Migrations-Aufwand bei jeder neuen ID-Sorte und erlaubt einheitliche Lookups.

```ts
// apps/backend/src/db/schemas/postgres.ts (neu)
export const trackExternalIds = pgTable(
  "track_external_ids",
  {
    id: text("id").primaryKey(),                                   // ulid
    trackId: text("track_id").notNull().references(() => tracks.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),                             // 'isrc' | 'iswc' | 'mbid' | 'acoustid'
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),               // 'spotify' | 'deezer' | 'apple-music' | 'musicbrainz' | 'crawler:<name>'
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_track_ext_ids").on(table.trackId, table.idType, table.idValue, table.sourceService),
    index("idx_track_ext_ids_lookup").on(table.idType, table.idValue),
    index("idx_track_ext_ids_track").on(table.trackId),
  ],
);

export const albumExternalIds = pgTable(
  "album_external_ids",
  {
    id: text("id").primaryKey(),
    albumId: text("album_id").notNull().references(() => albums.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),                             // 'upc' | 'ean' | 'mbid'
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_album_ext_ids").on(table.albumId, table.idType, table.idValue, table.sourceService),
    index("idx_album_ext_ids_lookup").on(table.idType, table.idValue),
    index("idx_album_ext_ids_album").on(table.albumId),
  ],
);

export const artistExternalIds = pgTable(
  "artist_external_ids",
  {
    id: text("id").primaryKey(),
    artistId: text("artist_id").notNull().references(() => artists.id, { onDelete: "cascade" }),
    idType: text("id_type").notNull(),                             // 'mbid' | 'discogs' | 'isni'
    idValue: text("id_value").notNull(),
    sourceService: text("source_service").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex("uq_artist_ext_ids").on(table.artistId, table.idType, table.idValue, table.sourceService),
    index("idx_artist_ext_ids_lookup").on(table.idType, table.idValue),
    index("idx_artist_ext_ids_artist").on(table.artistId),
  ],
);
```

### Bestehende Spalten bleiben

`tracks.isrc` und `albums.upc` bleiben unverändert. Begründung:
- Schnellster Lookup-Pfad (single-column Index, schon vorhanden: `idx_tracks_isrc`, `idx_albums_upc`)
- Ein "primärer" / "kanonischer" Wert pro Entity erhalten — der zuerst gefundene oder der vom MusicBrainz-Cluster ausgewählte. Wahl-Strategie kommt mit dem Crawler.
- Keine Daten-Migration nötig: bestehende ISRCs/UPCs werden zusätzlich in die neuen Tabellen geschrieben (per Backfill-Migration).

### Lookup-Strategie

`findTrackByIsrc(isrc)` wird zu einem zweistufigen Lookup:

```ts
// 1. Schneller Pfad: kanonische Spalte
SELECT * FROM tracks WHERE isrc = $1 LIMIT 1;

// 2. Fallback: Aggregations-Tabelle
SELECT t.* FROM tracks t
  JOIN track_external_ids x ON x.track_id = t.id
  WHERE x.id_type = 'isrc' AND x.id_value = $1
  LIMIT 1;
```

Analog für UPC. MBID-Lookup geht direkt auf die neue Tabelle (keine kanonische Spalte).

### Persistence-Pfad

`persistTrackWithLinks` (heute in `apps/backend/src/db/adapters/postgres.ts:465`) bekommt einen neuen Schritt: nach dem Track-Insert/Update werden ALLE im Resolver gesammelten External IDs in `track_external_ids` upserted (ON CONFLICT DO NOTHING auf den Unique-Index — `observed_at` wird beim ersten Insert gesetzt).

Dafür muss der Resolver-Pfad die IDs der nicht-source Adapter durchreichen. Konkret:

- `resolver.ts:resolveAcrossServices` produziert heute Cross-Service-Links pro Adapter. Jeder Adapter liefert dabei einen `NormalizedTrack` zurück, dessen `isrc` aktuell verworfen wird.
- Neue Sammelstruktur in `ResolutionResult`:
  ```ts
  type ExternalIdRecord = { idType: string; idValue: string; sourceService: string };
  interface ResolutionResult {
    sourceTrack: NormalizedTrack;
    links: ServiceLink[];
    externalIds: ExternalIdRecord[];          // NEU
    inputUrl?: string;
  }
  ```
- Befüllung: in `resolveAcrossServices` jedes Adapter-Resultat scannen → wenn `track.isrc` vorhanden, einen Record `{ isrc, isrc-Wert, adapter.id }` hinzufügen. Bonus: wenn der Adapter MBID/AcoustID liefert (heute keiner, aber MusicBrainz-Adapter kommt), gleicher Mechanismus.
- `persistTrackWithLinks` schreibt diese Records nach Track-Persist.

Analog für Album (UPC sammeln) und Artist (MBID sammeln, sobald MB-Adapter da ist).

### Backfill

Nach Migration: einmaliger Backfill kopiert die existierenden Werte:
```sql
INSERT INTO track_external_ids (id, track_id, id_type, id_value, source_service, observed_at)
SELECT
  encode(gen_random_bytes(12), 'hex'),
  id,
  'isrc',
  isrc,
  COALESCE(source_service, 'unknown'),
  created_at
FROM tracks
WHERE isrc IS NOT NULL
ON CONFLICT DO NOTHING;
```

Identisch für `albums.upc → album_external_ids`. Backfill als eigene Migration nach der Schema-Migration.

### Crawler-Vorbereitung

Schema erlaubt bereits Crawler ohne Code-Änderung:
- `tracks` Insert ohne `short_urls`-Eintrag ist erlaubt (FK ist nur in `short_urls.track_id` definiert, nicht andersrum).
- `source_service = 'crawler:musicbrainz'` o.ä. macht Crawler-Daten von User-Resolves unterscheidbar (für Telemetrie / spätere Quotas).
- `track_external_ids.source_service` zeigt, welcher Crawler / Adapter eine ID beigesteuert hat → Quellen-Trust-Score später möglich.

Konkrete Crawler-Implementierung ist NICHT Teil dieses Plans, das Schema ist nur darauf vorbereitet.

## Files to add

- `apps/backend/src/db/migrations/postgres/0019_external_ids.sql` (Drizzle-generiert via `pnpm drizzle-kit generate`)
- `apps/backend/src/db/migrations/postgres/0020_external_ids_backfill.sql` (manuell, Backfill aus `tracks.isrc` + `albums.upc`)
- Test: `apps/backend/src/__tests__/external-ids.test.ts` — Insert + Unique-Constraint + Lookup
- (sqlite-Pendant falls Test-DB SQLite nutzt — Schema spiegeln)

## Files to modify

- `apps/backend/src/db/schemas/postgres.ts` — drei neue Tabellen-Definitionen (siehe oben)
- `apps/backend/src/db/repository.ts` — Interface-Erweiterung:
  - `findTrackByExternalId(idType, idValue): Promise<Track | null>`
  - `addTrackExternalIds(trackId, records: ExternalIdRecord[]): Promise<void>`
  - analog für Album / Artist
- `apps/backend/src/db/adapters/postgres.ts:465` (`persistTrackWithLinks`) — nach Track-Persist External-IDs upserten
- `apps/backend/src/db/adapters/postgres.ts` (`findTrackByIsrc`) — Fallback auf `track_external_ids` ergänzen
- `apps/backend/src/services/resolver.ts:resolveAcrossServices` (ca. Z. 200-450) — externalIds mitsammeln, an `ResolutionResult` anhängen
- `apps/backend/src/services/types.ts` — `ResolutionResult` um `externalIds` erweitern; `ExternalIdRecord`-Type
- `apps/backend/src/routes/resolve.ts:340` (`persistTrackAndRespond`) — `result.externalIds` ans Repo durchreichen
- `apps/backend/src/routes/resolve.ts:435` (`persistAlbumAndRespond`) — analog für Album-UPCs
- `apps/backend/src/routes/resolve.ts:499` (`persistArtistAndRespond`) — analog (vorbereitet, heute leer)

## Verification

1. **Migration läuft sauber:** `pnpm drizzle-kit generate` erzeugt `0019_external_ids.sql`. Inhalt prüfen: drei `CREATE TABLE`, sechs Indizes (drei UNIQUE, drei lookup-Indizes), keine Datenmutation. Migration via `pnpm drizzle-kit migrate` gegen lokale Postgres laufen lassen, in `psql` mit `\d track_external_ids` strukturell verifizieren.
2. **Backfill korrekt:** Nach `0020_external_ids_backfill.sql`:
   ```sql
   SELECT COUNT(*) FROM tracks WHERE isrc IS NOT NULL;
   SELECT COUNT(*) FROM track_external_ids WHERE id_type = 'isrc';
   ```
   Beide Zahlen identisch. Analog für UPC.
3. **End-to-End-Resolve:** Backend lokal starten, Spotify-Track-URL resolven (z.B. `https://open.spotify.com/track/2WfaOiMkCvy7F5fcp2zZ8L`). Erwartung:
   - `tracks.isrc` gesetzt (kanonisch)
   - `track_external_ids` enthält Records für JEDEN beteiligten Adapter (Spotify, Deezer, Apple Music, …) der einen ISRC geliefert hat — typisch 3–6 Einträge pro Track
4. **Cross-Region-Test:** Track mit bekannten regionalen Varianten resolven (z.B. ein Pop-Track mit US- und UK-ISRC). Beide ISRCs müssen in `track_external_ids` landen, der `id_type = 'isrc'`-Index findet beide:
   ```sql
   SELECT id_value, source_service FROM track_external_ids WHERE track_id = '<id>' AND id_type = 'isrc';
   ```
5. **Lookup-Fallback:** Track manuell mit Test-ISRC in `track_external_ids` ablegen (ohne in `tracks.isrc` zu schreiben). `findTrackByIsrc(testIsrc)` muss den Track liefern. Sicherstellen, dass der schnelle Pfad (kanonische Spalte) zuerst greift, wenn der Wert dort vorhanden ist (Query-Plan / EXPLAIN ANALYZE).
6. **Constraint-Schutz:** Doppel-Insert mit identischem `(track_id, id_type, id_value, source_service)` muss vom Unique-Index abgewiesen werden (oder im Repo via `ON CONFLICT DO NOTHING` geschluckt werden).
7. **Drizzle-Migrations-Pfad eingehalten:** Memory-Direktive — Migrations laufen IMMER via Drizzle-Migrator. Kein paralleler raw-SQL-Pfad, keine `psql`-Ad-Hoc-Inserts in Prod. Bei Migrations-Fehlschlag: Retry, nicht umgehen.
8. **Tests:** `cd App/apps/backend && pnpm test` grün — speziell der neue `external-ids.test.ts` und alle bestehenden Resolver-Tests (Lookup-Verhalten darf sich für existierende Daten nicht verändern).

## Out of scope (Folgepläne)

- **Crawler-Layer.** Eigener Plan, der Charts/Genre-Listen pro Service in die DB pumpt.
- **MusicBrainz-Adapter** mit MBID-Lookup. Wird die erste neue Quelle nach diesem Schema und liefert MBID-Records direkt in `track_external_ids` / `artist_external_ids`.
- **AcoustID-Fingerprint-Workflow.** Setzt Audio-Sample-Pipeline voraus, eigener Plan.
- **Static-vs-Dynamic-Cache-Trennung.** Aktuell schreibt der Cache alles in dieselbe Row mit gemeinsamem `updated_at`. Strategische Folgearbeit, separater Plan.
- **API-Monetarisierung.** Quotas, Pricing, Billing — eigener Plan.
- **Spotify Feb-2026 Mitigation** (`2026-04-27-spotify-feb2026-mitigation.md`). Setzt dieses Schema voraus, kommt direkt danach.

## Completed

- **Date:** 2026-04-28
- **Commit:** `af4c110d` — Feat: Aggregate ISRCs and UPCs across cross-service resolves
- **Delivered:** Three `*_external_ids` tables, resolver hook in track/album/artist pipelines, repo methods with fallback lookup, backfill migration, 9 pure-unit + 3 integration tests. Drizzle drift fixed (snapshots 0013–0018 cloned from 0019, prevId chain repaired — caveat in `apps/backend/src/db/migrations/postgres/SNAPSHOTS-NOTE.md`).
- **Gates:** typecheck ✓ · vitest 722/722 ✓ · drizzle-kit clean.
