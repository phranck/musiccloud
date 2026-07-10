# Handoff: LP-Rille aus echten Discogs-Vinyl-Daten (MC-116 / MC-117)

**Stand:** 2026-07-11 · **Branch:** `feat/discogs-vinyl-layout` (nur lokal, nichts gepusht)

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

**Ausführungsmethode:** superpowers:subagent-driven-development, pro Task ein frischer Implementer-Subagent (TDD), danach Review. Für reine Logik-Tasks (T1-T4) wurde die Spec/Qualität selbst verifiziert; für substanzielle Tasks (ab T5) erfolgte die Review-Schleife aus Spec-Compliance und Code-Quality.

**MC-116 (Backend):**
- T1 ✅ `a8707ede` — geteilte Typen `VinylLayout`/`VinylSide`/`VinylLayoutTrack` in `packages/shared/src/vinyl-layout.ts` (+ index-Export).
- T2 ✅ `c03cfdee` — `parseDiscogsDuration`, `sideLabelFromPosition` in `apps/backend/src/services/plugins/discogs/discogs-parse.ts`.
- T3 ✅ `ca3911bc` — `selectOriginalVinylVersion` (+ Typ `DiscogsMasterVersion`) in derselben Datei.
- T4 ✅ `f2d8e530` — `normalizeReleaseToLayout` (+ Typen `DiscogsRelease`/`DiscogsTrack`) in derselben Datei.
- T5 ✅ `12502e69` + Review-Fix `add2450f` — `discogs-client.ts` (`isDiscogsConfigured`, `searchVinylMaster`, `getMasterVinylVersions`, `getRelease`). Beide Review-Stufen bestanden.
- T6 ✅ `e9530618` — Tabelle `albumVinylLayouts` in `apps/backend/src/db/schemas/postgres.ts` + Migration `0072_burly_scarlet_spider.sql`. Die Migration ist lokal per Drizzle-Historie und Hash verifiziert angewandt.
- T7 ✅ `39e81df5` — raw-pg-Helfer `upsertAlbumVinylLayout`/`readAlbumVinylLayout` und isolierter lokaler Postgres-Integrationstest, 1/1 grün.
- T8 ✅ `e593c8c1` + Review-Fix `d4592e4f` — Orchestrator `enrichAlbumVinylLayout`. Review bestanden: unvollständige Discogs-Dauern bleiben retrybar und werden nicht negativ gecacht; die External-ID-Provenienz wird vor dem positiven Layout geschrieben.
- T9 ✅ `4030c650` + Review-Fix `c6892819` — Resolve-Payload, Repository-Delegationen, OpenAPI-Serializer und verpflichtender Resolve-Typ. Best-effort-Enrichment, Reihenfolge und persistierte Album-ID sind getestet.
- T10 ✅ `4e921d78` + Test-Fix `d14c5174` — gecachte Resolves überspringen Discogs; die Share-Payload liefert persistierte Layouts inklusive Negativ-Cache. Lokaler Adapter-Integrationstest 3/3 grün.
- T11 ✅ `57a4dc8c` — finale Gates, lokale Drizzle-Verifikation und read-only Live-Discogs-Client-Nachweis: Master `33100`, Release `10013707`, zwei Seiten, drei Tracks.

**Verifizierte Gates:** Backend-Suite 1.443 grün, 58 gezielt ohne DB-URL übersprungen; Vinyl-Integration 4/4 grün gegen localhost; Backend-Typecheck, Shared-Build und Full-Repo-Biome grün. Vier ältere, datenunsichere DB-Tests bleiben aus Sicherheitsgründen außerhalb des Laufs.

**Noch offen — MC-117 (Frontend):** komplett offen (7 Tasks), erst nach MC-116 sinnvoll.

## DB-Hinweis (wichtig, sonst verliert man Zeit)

Die lokale Entwicklungsdatenbank ist über `apps/backend/.env.local` konfiguriert. Migration `0072_burly_scarlet_spider.sql` ist dort bereits angewandt: Tabelle, Unique-Index und letzter Drizzle-Migrationshash wurden read-only verifiziert. Keine Migration erneut anwenden. Die Vinyl-Integrationstests legen ausschließlich eigene Album-, Short-ID- und Layout-Zeilen an und entfernen sie wieder.

## Token

`DISCOGS_TOKEN` liegt lokal in `apps/backend/.env.local` und wird nie committed. Die Live-Verifikation in T11 ist abgeschlossen.

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

MC-117 Task 1 beginnen: Geometrie-Helfer aus `VinylRecord.tsx` nach `lib/media/vinyl-geometry.ts` auslagern und charakterisierend testen. MC-116 ist vollständig abgeschlossen.

## Offene Baustelle nebenbei

`git status` zeigt das untracked `.agents/`-Verzeichnis (vom Teammate-/Subagent-Framework erzeugt). Es ist harness-managed und darf weder verändert noch committed werden.
