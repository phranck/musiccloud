# Handoff: LP-Rille aus echten Discogs-Vinyl-Daten (MC-116 / MC-117)

**Stand:** 2026-07-10 · **Branch:** `feat/discogs-vinyl-layout` (nur lokal, nichts gepusht)

Diese Notiz übergibt die laufende Umsetzung an ein anderes LLM, damit es nahtlos weitermachen kann. Lies zuerst die drei Quell-Artefakte, dann diesen Statusblock.

## Quell-Artefakte (Source of Truth — vollständig lesen)

- **Spec:** `docs/superpowers/specs/2026-07-10-lp-rille-discogs-vinyl-layout-design.md` — Ziel, Entscheidungen, live-verifizierte Discogs-API-Fakten, Rechtslage.
- **Plan 1 (Backend):** `.claude/plans/open/2026-07-10-MC-116-discogs-vinyl-layout-backend.md` — 11 Tasks, TDD, verifizierte Fakten mit Datei:Zeile.
- **Plan 2 (Frontend):** `.claude/plans/open/2026-07-10-MC-117-discogs-vinyl-layout-frontend.md` — 7 Tasks, hängt an MC-116.

## Was das Feature macht (Kurzfassung)

Die LP (`VinylRecord`) soll pro Seite echte Rillen zeigen: Pausenrillen zwischen den Tracks (radial proportional zur Track-Dauer) plus Einlauf- und Auslaufrille, und einen dynamischen Seitenbuchstaben (A/B/C…) statt hart „SIDE A". Datenquelle ist **ausschließlich** eine echte Discogs-Vinyl-Pressung mit vollständigen Track-Dauern; fehlt sie, bleibt die LP wie heute (homogene Rille, „A"). **Kein Discogs-Cover** (Bilder sind nicht CC0). Das normalisierte `VinylLayout` wird pro Album persistiert (ein Discogs-Call je Album).

## Getroffene Produkt-Entscheidungen (nicht neu aufrollen)

1. Nur echte Discogs-Daten erzeugen Rillen; sonst homogener Fallback.
2. Fidelity: Pausenrillen + Einlauf- + Auslaufrille (kein Loudness-abhängiger Rillenabstand).
3. Kein Discogs-Cover — Cover bleibt Streaming-Artwork.
4. Layout wird in DB persistiert; Discogs einmal je Album.
5. Zwei-Plan-Split, Backend (MC-116) zuerst.

## Fortschritt

**Ausführungsmethode:** superpowers:subagent-driven-development — pro Task ein frischer Implementer-Subagent (TDD), danach Review. Für reine Logik-Tasks (T1-T4) habe ich die Spec/Qualität selbst verifiziert; für substanzielle Tasks (ab T5) die volle Zwei-Stufen-Review (Spec-Compliance-Subagent, dann Code-Quality-Subagent `superpowers:code-reviewer`).

**MC-116 (Backend):**
- T1 ✅ `a8707ede` — geteilte Typen `VinylLayout`/`VinylSide`/`VinylLayoutTrack` in `packages/shared/src/vinyl-layout.ts` (+ index-Export).
- T2 ✅ `c03cfdee` — `parseDiscogsDuration`, `sideLabelFromPosition` in `apps/backend/src/services/plugins/discogs/discogs-parse.ts`.
- T3 ✅ `ca3911bc` — `selectOriginalVinylVersion` (+ Typ `DiscogsMasterVersion`) in derselben Datei.
- T4 ✅ `f2d8e530` — `normalizeReleaseToLayout` (+ Typen `DiscogsRelease`/`DiscogsTrack`) in derselben Datei.
- T5 ✅ `12502e69` + Review-Fix `add2450f` — `discogs-client.ts` (`isDiscogsConfigured`, `searchVinylMaster`, `getMasterVinylVersions`, `getRelease`). Beide Review-Stufen bestanden.
- T6 ✅ `e9530618` — Tabelle `albumVinylLayouts` in `apps/backend/src/db/schemas/postgres.ts` + Migration `0072_burly_scarlet_spider.sql`. **Migration ist bereits gegen die DB angewandt** (siehe DB-Hinweis unten).
- Plan-Doku-Fix: `ed849a4b`.

**Discogs-Testsuite aktuell: 38 Tests grün** (`discogs-parse.test.ts` 19 + `discogs-client.test.ts` 19). Testlauf: `pnpm --filter @musiccloud/backend test:run discogs`.

**Noch offen — MC-116:** T7 (Persist-Helfer) ist der nächste Task, dann T8 (Enrichment-Orchestrator), T9 (in Resolve verdrahten + Payload), T10 (Read-Path gecachte Alben), T11 (Gates + Env-Doku).

**Noch offen — MC-117 (Frontend):** komplett offen (7 Tasks), erst nach MC-116 sinnvoll.

## DB-Hinweis (wichtig, sonst verliert man Zeit)

musiccloud hat **kein separates lokales Postgres**. `.env.local`/`ZEROPS_DB_URL` ist die eine (Zerops-)DB, gegen die dieses Projekt entwickelt (Host `postgresql` → `10.0.224.15` via VPN). `pnpm db:generate` (schema-only) → `pnpm db:migrate` ist der **normale, erlaubte** Dev-Workflow; nicht als Prod-Zwischenfall behandeln. Migration `0072` (Tabelle `album_vinyl_layouts`, leer) ist dort bereits angewandt und bleibt. Nur bei **destruktiven** Eingriffen (DROP/TRUNCATE/Daten-Löschung) beim User rückfragen. Migrations-Tracker: genau einer, `drizzle.__drizzle_migrations`.

## Token

`DISCOGS_TOKEN` liefert der User. Gehört in `.env.local` (nie committen — Repo ist OSS-public). Wird erst für T11 (Live-Enrichment-Verifikation) gebraucht; T7-T10 mocken DB/Client, also kein Token nötig.

## Konventionen (nicht verhandelbar — an alle Subagents weitergeben)

- **pnpm** (nie npm). Backend-Tests: `pnpm --filter @musiccloud/backend test:run`.
- **DB-Adapter-Muster:** Die Funktionen in `apps/backend/src/db/adapters` nutzen **rohes pg-SQL** über einen `Pool`/`client` (`INSERT … ON CONFLICT`, `$1`-Platzhalter), **nicht** den Drizzle-Query-Builder (Drizzle nur Schema/Migrationen). IDs via `generateTrackId()`/`generateShortId()` aus `apps/backend/src/lib/short-id.js`. Diese Funktionen werden per **Integrationstest gegen die echte DB** getestet (`describe.skipIf(!process.env.DATABASE_URL)`, eigener Pool in `beforeAll`, Row-Cleanup in `afterAll`; Vorlage: `apps/backend/src/db/adapters/__tests__/postgres-content-email.integration.test.ts`) — NICHT gemockt. Reine Orchestrator-/Route-Logik (T8/T9) darf dagegen die Adapter mocken.
- **TDD**: erst failing Test, fallen sehen, dann minimal implementieren. Für reine Funktionen ohne Runtime-Verhalten (z.B. Typen) gilt TDD nicht.
- **TSDoc** auf jedem exportierten Symbol (Pflicht in diesem Projekt).
- **ESM `.js`-Import-Extensions** in Produktions-Imports (Codebase-Mehrheit nutzt sie, z.B. `../../../lib/infra/fetch.js`). `vi.mock`-Pfade müssen den Import-Pfad exakt spiegeln (inkl. `.js`), sonst greift der Mock nicht.
- **Biome** nach jedem Edit: `pnpm exec biome check --write <files>`.
- Commits: `Feat:`/`Fix:`/`Refactor:`/`Docs:`/`Chore:`-Präfix, imperativ, Englisch. **Nie `Co-Authored-By`, nie Claude/AI erwähnen.** Keine Em-Dashes irgendwo (Code, Kommentare, Commits, Doku).
- Pläne/Specs auf Deutsch, Code-Identifier/Commits Englisch.
- **Commit-/Push-Gating:** Der User gibt Commits/Pushes ausdrücklich frei. Die Subagent-Ausführung auf diesem Feature-Branch (mit Commits pro Task) ist bereits freigegeben; **Push nach remote ist NICHT freigegeben** — nichts pushen ohne ausdrückliche Ansage.
- React Doctor (Frontend, MC-117): `pnpm doctor:diff` muss 0 Issues zeigen; `no-initialize-state`-Regel verbietet `useState(false)`+`useEffect(setState,[])` — für Hydration `useIsClient()` nutzen.

## Nächster konkreter Schritt

MC-116 **Task 7 (Persist-Helfer)** dispatchen — Details stehen ausführlich in Plan-Task-7. Kurz: `upsertAlbumVinylLayout(pool, albumId, layout|null)` + `readAlbumVinylLayout(pool, albumId)` in `apps/backend/src/db/adapters/postgres-albums.ts`, **rohes SQL** (`INSERT … ON CONFLICT (album_id) DO UPDATE …`), `id` via `generateTrackId()`. `readAlbumVinylLayout` unterscheidet drei Zustände: `VinylLayout` (Treffer), `null` (geprüft, kein Vinyl = Negativ-Cache), `undefined` (nie geprüft). Getestet als **Integrationstest gegen die echte DB** (`skipIf(!DATABASE_URL)`, im Test zuerst eine `albums`-Row anlegen wegen FK, dann upsert/read/Cleanup) — NICHT gemockt. Danach T8-T11, dann MC-117.

## Offene Baustelle nebenbei

`git status` zeigt ein untracked `.agents/`-Verzeichnis (vom Teammate-/Subagent-Framework erzeugt) — harness-managed, nicht committen, nicht anfassen.
