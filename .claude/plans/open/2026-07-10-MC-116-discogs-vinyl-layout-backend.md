# Discogs-Vinyl-Layout — Backend (Beschaffung & Persistenz)

Plan-Nr.: MC-116

> **Für agentische Worker:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans, um diesen Plan Task für Task umzusetzen. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Beim Album-Resolve best-effort eine echte Discogs-Vinyl-Pressung matchen, sie in ein normalisiertes `VinylLayout` überführen, persistieren (Positiv/Negativ-Cache) und mit der Album-Payload ausspielen.

**Architecture:** Neuer Discogs-Client (`fetchWithTimeout` + `DISCOGS_TOKEN` + UA + Throttle) → reine Normalisierungs-Funktionen (Release → `VinylLayout`) → Enrichment-Orchestrator, der **nach** `persistAlbumWithLinks` best-effort läuft und das Layout in die neue Tabelle `album_vinyl_layouts` schreibt (Layout **oder** `null`-Marker); die gematchte Release-ID zusätzlich als `discogs_release` in `album_external_ids`. Die Resolve-Route liest das Layout und hängt `vinylLayout` an die Album-Antwort.

**Tech Stack:** TypeScript, Fastify, Drizzle/Postgres, Vitest (`vi.mock`), pnpm. Discogs REST API (`api.discogs.com`).

**Spec:** [docs/superpowers/specs/2026-07-10-lp-rille-discogs-vinyl-layout-design.md](../../../docs/superpowers/specs/2026-07-10-lp-rille-discogs-vinyl-layout-design.md)

---

## Vorwort

Dieser Plan ist Subsystem 1 von zwei (Frontend-Rendering folgt als eigener Plan). Er liefert eigenständig testbare, lauffähige Software: nach Abschluss trägt jede aufgelöste Album-Antwort ein `vinylLayout` (oder `null`), ohne dass das Frontend schon etwas damit tut.

**Plan-Size:** Bewusst kein vorab ausformulierter Volltext-Code für spätere Tasks. Signaturen/Typen und konkrete Test-Fälle sind angegeben; die Implementierung entsteht beim Abarbeiten des jeweiligen Tasks per TDD.

## Verifizierte Fakten (grep/Read, 2026-07-10)

- **Discogs-API (live gegen `api.discogs.com`):** `GET /database/search?type=master&artist=&release_title=&format=Vinyl`; `GET /masters/{id}/versions?format=Vinyl` → `versions[]{ id, released, format, country }` + `pagination.items`; `GET /releases/{id}` → `formats[]{ name:"Vinyl", descriptions[] }`, `identifiers[]{ type:"Barcode", value }`, `tracklist[]{ position, type_, title, duration:"M:SS" }`. Seitenbuchstabe = führendes Alpha-Präfix der `position`; nur `type_==="track"`. Rate-Limit 60/min mit Token, 25 ohne; `429` bei Überschreitung; UA nötig. Fixtures: Release 249504, 15815903, Master 33100.
- **NormalizedAlbum:** `apps/backend/src/services/types.ts:288-307` — Felder u.a. `upc`, `title`, `artists`, `tracks: AlbumTrackEntry[]`, `totalTracks`; **kein** `discogsReleaseId`.
- **Persist:** `persistAlbumWithLinks` in `apps/backend/src/db/adapters/postgres-albums.ts:210-290` (Upsert nach `(upc, source_url)`). External-IDs via `insertExternalIds` in `apps/backend/src/db/adapters/postgres-shared.ts:323-359` (`table:"album_external_ids"`, `fkColumn:"album_id"`, `ON CONFLICT DO NOTHING`).
- **Resolve:** Route `POST api/v1/resolve` Handler in `apps/backend/src/routes/resolve.ts:307`; `resolveAlbumUrl` in `apps/backend/src/services/album-resolver.ts`; Album-Antwort gebaut in `persistAlbumAndRespond` `apps/backend/src/routes/resolve.ts:467-525` (Album-Objekt `512-522`). Enrichment sitzt best-effort **nach** `persistAlbumWithLinks`.
- **HTTP:** `fetchWithTimeout` in `apps/backend/src/lib/infra/fetch.ts` (genutzt u.a. `services/plugins/spotify/adapter.ts:56`, Bandcamp keyless als Muster).
- **Env:** direktes `process.env` (Muster `apps/backend/src/lib/infra/token-manager.ts:65-76`). `DISCOGS_TOKEN` in `.env.local` (nie committet, Repo OSS-public). Keine `.env.example` im Repo.
- **Tests:** `pnpm --filter @musiccloud/backend test:run`; `vi.mock` (Vitest), kein MSW/nock. Muster `apps/backend/src/__tests__/album-resolver.test.ts`.
- **Schema:** `album_*`-pgTable-Muster `apps/backend/src/db/schemas/postgres.ts:181-254`; `jsonb` bereits importiert. Migration-Workflow: `pnpm db:generate` (drizzle-kit) → SQL in `apps/backend/src/db/migrations/` → `pnpm db:migrate` (`node scripts/migrate.mjs`).
- **Shared-Typen:** `packages/shared/src/` (z.B. `design-tokens.ts`), re-exportiert über `packages/shared/src/index.ts` — Ort für den geteilten `VinylLayout`-Typ (Frontend-Plan konsumiert ihn).

## Datei-Struktur

**Neu:**
- `packages/shared/src/vinyl-layout.ts` — geteilte Typen `VinylLayout`, `VinylSide`, `VinylLayoutTrack` (+ Export in `packages/shared/src/index.ts`).
- `apps/backend/src/services/plugins/discogs/discogs-parse.ts` — reine Funktionen: `parseDiscogsDuration`, `sideLabelFromPosition`, `normalizeReleaseToLayout`, `selectOriginalVinylVersion`.
- `apps/backend/src/services/plugins/discogs/discogs-client.ts` — HTTP-Client: `searchVinylMaster`, `getMasterVinylVersions`, `getRelease` (via `fetchWithTimeout`, Token/UA/Throttle).
- `apps/backend/src/services/plugins/discogs/discogs-enrich.ts` — Orchestrator `enrichAlbumVinylLayout`.
- `apps/backend/src/services/plugins/discogs/*.test.ts` — Tests je Modul.

**Geändert:**
- `apps/backend/src/db/schemas/postgres.ts` — Tabelle `albumVinylLayouts`.
- `apps/backend/src/db/adapters/postgres-albums.ts` — `upsertAlbumVinylLayout`, `readAlbumVinylLayout`.
- `apps/backend/src/routes/resolve.ts` — Enrichment-Aufruf nach Persist; `vinylLayout` in die Album-Antwort (`512-522`).

## Geteilter Typ (Vertrag, in allen Tasks konsistent)

```ts
export interface VinylLayoutTrack { position: string; title: string; durationMs: number; }
export interface VinylSide { label: string; tracks: VinylLayoutTrack[]; }
export interface VinylLayout { discogsReleaseId: string; sides: VinylSide[]; }
```

---

## Task 1: Geteilte VinylLayout-Typen

**Files:** Create `packages/shared/src/vinyl-layout.ts`; Modify `packages/shared/src/index.ts`.

- [x] Typen `VinylLayoutTrack`/`VinylSide`/`VinylLayout` (exakt wie „Geteilter Typ" oben) mit TSDoc anlegen und in `index.ts` re-exportieren.
- [x] `pnpm --filter @musiccloud/shared build` (bzw. Typecheck) grün.
- [x] Commit: `Feat: add shared VinylLayout types (MC-116)`.

## Task 2: Dauer-Parsing + Seitenableitung (rein, TDD)

**Files:** Create `discogs-parse.ts` + `discogs-parse.test.ts`.

- [x] Failing Test `parseDiscogsDuration`: `"3:32"→212000`, `"11:54"→714000`, `"20:10"→1210000`, `""→null`, `"abc"→null`.
- [x] Failing Test `sideLabelFromPosition`: `"A"→"A"`, `"B2"→"B"`, `"C1"→"C"`, `""→null`, `"3"→null`.
- [x] Test laufen → rot (Funktionen fehlen).
- [x] Minimal implementieren (`M:SS`/`MM:SS`; führendes `[A-Z]`-Präfix).
- [x] Test grün. Commit: `Feat: parse Discogs durations + side labels (MC-116)`.

## Task 3: Original-Pressung wählen (rein, TDD)

**Files:** Modify `discogs-parse.ts` + `discogs-parse.test.ts`.

- [ ] Failing Test `selectOriginalVinylVersion` mit Fixture aus Master 33100 (`{id, released, format}`-Liste): wählt aus `1959 "LP, Album, Stereo"`, `1959 "LP, Album, Mono"`, `1960 "LP, Album, Reissue, Mono"` eine **1959er, nicht-Reissue** Version; `[]`/nur-Reissue → `null`; nicht-Vinyl-`format` wird ignoriert.
- [ ] Rot → implementieren (Filter `format` enthält „Vinyl"/„LP", schließt „Reissue" aus; kleinste `released`-Jahreszahl).
- [ ] Grün. Commit: `Feat: pick original Discogs vinyl pressing (MC-116)`.

## Task 4: Release → VinylLayout normalisieren (rein, TDD)

**Files:** Modify `discogs-parse.ts` + `discogs-parse.test.ts`.

- [x] Failing Test `normalizeReleaseToLayout` mit **The-Sermon!-Fixture** (Release 15815903: `tracklist` `A`/`B1`/`B2`, `type_:"track"`, Dauern `20:10`/`11:54`/`8:00`): erwartet `sides=[{label:"A",tracks:[{durationMs:1210000,…}]},{label:"B",tracks:[714000,480000]}]`, `discogsReleaseId:"15815903"`.
- [x] Failing Test: fehlt bei einem Track die `duration` → Rückgabe `null` (Verwerfen).
- [x] Failing Test: `type_!=="track"`-Einträge werden ignoriert; hat eine Seite dadurch einen Track ohne Dauer → `null`.
- [x] Rot → implementieren (Gruppierung per `sideLabelFromPosition`, `parseDiscogsDuration`, Vollständigkeits-Pflicht).
- [x] Grün. Commit: `Feat: normalize Discogs release into VinylLayout (MC-116)`.

## Task 5: Discogs-HTTP-Client (TDD, fetch gemockt)

**Files:** Create `discogs-client.ts` + `discogs-client.test.ts`.

- [ ] Failing Tests (fetch via `vi.mock` auf `../../../lib/infra/fetch.js`): `searchVinylMaster({artist,title})` ruft `/database/search?type=master&format=Vinyl&…` mit Header `Authorization: Discogs token=<DISCOGS_TOKEN>` und gesetztem `User-Agent`; `getMasterVinylVersions(id)` ruft `/masters/{id}/versions?format=Vinyl`; `getRelease(id)` ruft `/releases/{id}`. Bei fehlendem `DISCOGS_TOKEN` → Client meldet „nicht verfügbar" (kein Call). `429`/Netzfehler werden als transienter Fehler propagiert (nicht als „kein Vinyl").
- [ ] Rot → implementieren (`fetchWithTimeout`, Base `https://api.discogs.com`, einfacher In-Process-Throttle, Token aus `process.env.DISCOGS_TOKEN`).
- [ ] Grün. Commit: `Feat: add Discogs HTTP client (MC-116)`.

## Task 6: DB-Tabelle album_vinyl_layouts + Migration

**Files:** Modify `apps/backend/src/db/schemas/postgres.ts`; generierte Migration in `apps/backend/src/db/migrations/`.

- [x] `albumVinylLayouts`-pgTable im `album_*`-Muster: `id` (text PK), `albumId` (FK `albums.id`, `onDelete:"cascade"`), `discogsReleaseId text` (nullable), `layoutData jsonb` (nullable = Negativ-Cache), `fetchedAt timestamp{withTimezone}`, `uniqueIndex` auf `albumId`. TSDoc: `layoutData = null` bedeutet „geprüft, keine Vinyl-Pressung".
- [x] `pnpm db:generate` → neue SQL-Migration reviewen (nur diese Tabelle). Ergebnis: `0072_burly_scarlet_spider.sql`.
- [x] **NICHT `pnpm db:migrate` ausführen.** ACHTUNG: `.env.local`/`ZEROPS_DB_URL` zeigt in diesem Projekt auf die PROD-DB (Host `postgresql` → `10.0.224.15` via Zerops-VPN); es gibt kein lokales Postgres. `db:migrate` migriert damit PROD. Die Migration erreicht Prod nur über den kontrollierten Deploy-Flow des Users. (Historie: ein Subagent hat 0072 am 2026-07-10 versehentlich auf Prod angewandt; per User-Entscheid bleibt die leere Tabelle dort stehen.)
- [x] Commit: `Feat: add album_vinyl_layouts table (MC-116)`.

## Task 7: Persist-Helfer (TDD)

**Files:** Modify `apps/backend/src/db/adapters/postgres-albums.ts` + Testfile.

- [ ] Failing Test `upsertAlbumVinylLayout(albumId, layout|null)`: schreibt eine Row (Layout → `layoutData=layout`, `null` → Negativ-Marker), zweiter Aufruf **updated** dieselbe Row (unique `albumId`). `readAlbumVinylLayout(albumId)` liefert Layout, `null`-Marker oder `undefined` (nie geprüft).
- [ ] Rot → implementieren (Drizzle upsert `onConflictDoUpdate` auf `albumId`).
- [ ] Grün. Commit: `Feat: persist + read album vinyl layout (MC-116)`.

## Task 8: Enrichment-Orchestrator (TDD)

**Files:** Create `discogs-enrich.ts` + `discogs-enrich.test.ts`.

- [ ] Failing Tests (`discogs-client` + Persist gemockt): `enrichAlbumVinylLayout({id,title,artists,upc})` — (a) Match + vollständige Dauern → `upsertAlbumVinylLayout(id, layout)` + `discogs_release`-External-ID via `insertExternalIds`; (b) definitiv keine Vinyl-Version → `upsertAlbumVinylLayout(id, null)` (Negativ-Cache); (c) transienter Fehler (Client wirft) → **kein** Persist-Aufruf (späterer Retry); (d) kein `DISCOGS_TOKEN` → No-Op.
- [ ] Rot → implementieren (Client → `selectOriginalVinylVersion` → `getRelease` → `normalizeReleaseToLayout`; try/catch trennt „definitiv keins" von „transient").
- [ ] Grün. Commit: `Feat: orchestrate Discogs vinyl enrichment (MC-116)`.

## Task 9: In Resolve verdrahten + Payload (TDD)

**Files:** Modify `apps/backend/src/routes/resolve.ts`; `album-resolver.test.ts` erweitern.

- [ ] Failing Test: nach Album-Resolve ist `enrichAlbumVinylLayout` best-effort **nach** `persistAlbumWithLinks` aufgerufen; die Album-Antwort (`512-522`) enthält `vinylLayout` (aus `readAlbumVinylLayout`, sonst `null`). Enrichment-Fehler wirft **nicht** aus dem Resolve (best-effort).
- [ ] Rot → implementieren (Aufruf nach Persist, `vinylLayout` ins Album-Response-Objekt).
- [ ] Grün. Commit: `Feat: wire vinyl enrichment into album resolve (MC-116)`.

## Task 10: Read-Path für gecachte Alben (TDD)

**Files:** Modify Resolve/Album-Serve-Pfad + Test.

- [ ] Failing Test: wird ein bereits gecachtes Album ausgeliefert (ohne erneuten Discogs-Call), trägt die Antwort das persistierte `vinylLayout` (bzw. `null`).
- [ ] Rot → implementieren (`readAlbumVinylLayout` im Serve-Pfad).
- [ ] Grün. Commit: `Feat: serve persisted vinyl layout for cached albums (MC-116)`.

## Task 11: Gates + Env-Doku

- [ ] `pnpm --filter @musiccloud/backend test:run` grün; Typecheck grün.
- [ ] `.env.local` lokal um `DISCOGS_TOKEN=<vom User>` ergänzen (nicht committen). Falls eine Env-Referenzdatei existiert, `DISCOGS_TOKEN` dort dokumentieren.
- [ ] Commit: `Chore: finalize Discogs vinyl backend (MC-116)`.

## Checkliste (Plan-Fortschritt)

- [x] Task 1 — Geteilte VinylLayout-Typen
- [x] Task 2 — Dauer-Parsing + Seitenableitung
- [x] Task 3 — Original-Pressung wählen
- [x] Task 4 — Release → VinylLayout
- [ ] Task 5 — Discogs-HTTP-Client
- [x] Task 6 — Tabelle + Migration
- [ ] Task 7 — Persist-Helfer
- [ ] Task 8 — Enrichment-Orchestrator
- [ ] Task 9 — In Resolve verdrahten + Payload
- [ ] Task 10 — Read-Path gecachte Alben
- [ ] Task 11 — Gates + Env-Doku
- [ ] Alle Code-Referenzen re-verifiziert (Funktionen, Scripts, Pfade, Env-Vars, Package-Manager-Commands) vor erstem Edit
