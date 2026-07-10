# Discogs-Vinyl-Layout — Frontend (dynamische Rille & Seitenbuchstabe)

Plan-Nr.: MC-117

> **Für agentische Worker:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans, um diesen Plan Task für Task umzusetzen. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Die LP (`VinylRecord`) rendert pro Seite eine dynamische Rille (Pausenrillen zwischen Tracks + Einlauf-/Auslaufrille) und einen dynamischen Seitenbuchstaben, abgeleitet aus dem `vinylLayout` des Albums und dem gerade spielenden Track. Ohne Layout unverändert homogen + „A".

**Architecture:** Die Spiral-/Geometrie-Logik wird aus `VinylRecord.tsx` nach `lib/media/vinyl-geometry.ts` ausgelagert (Projekt-Konvention: Logik in `lib/`) und um einen per-Seite-Builder erweitert. `VinylRecord` bekommt eine optionale `sideLayout`-Prop und bleibt rein präsentational. Das Album-`vinylLayout` fließt über das View-Model → `RecordLabel` in die Turntable-Schicht; dort wird per aktuellem `trackTitle` die aktuelle Seite gematcht und als `sideLayout` an `VinylRecord` gereicht.

**Tech Stack:** TypeScript, React, Astro, Vitest, @testing-library/react. Geteilter Typ `VinylLayout` aus `@musiccloud/shared` (aus MC-116).

**Spec:** [docs/superpowers/specs/2026-07-10-lp-rille-discogs-vinyl-layout-design.md](../../../docs/superpowers/specs/2026-07-10-lp-rille-discogs-vinyl-layout-design.md)

**Abhängigkeit:** Baut auf [MC-116](2026-07-10-MC-116-discogs-vinyl-layout-backend.md) auf (liefert `@musiccloud/shared`-Typ `VinylLayout` + `album.vinylLayout` in der Resolve-Payload).

---

## Vorwort

Subsystem 2 von zwei. Ohne echte Layout-Daten (MC-116 kein Match) bleibt die LP exakt wie heute — dieser Plan darf den homogenen Default nie brechen. **Plan-Size:** kein vorab ausformulierter Volltext-Code; Signaturen + konkrete Test-Fälle sind angegeben, Implementierung per TDD beim Abarbeiten.

## Verifizierte Fakten (grep/Read, 2026-07-10)

- **`VinylRecord`:** `apps/frontend/src/components/vinyl/VinylRecord.tsx` — homogene Spirale via `vinylGrooveSpiralPath` (Z. 295-316), `labelArcPath` (Z. 250-257), Konstanten `VINYL_GROOVE_*` (Z. 66-90), hartes „SIDE A" als SVG-`tspan` (Z. 602-607) + `sr-only` (Z. 666). `VinylRecordProps` Z. 6-16.
- **View-Model:** `content`-Typ `MediaCardContentConfiguration` in `apps/frontend/src/lib/types/media-card.ts:35-81` (Felder u.a. `labelAlbumTitle`, `labelReleaseYear`, `labelCatalogText`; **keine** Tracklist). Prop-Mapping in `apps/frontend/src/components/cards/MediaCardHead.tsx:38-43`.
- **Resolve→View-Model:** `parseAlbumResolveResponse` `apps/frontend/src/lib/resolve/parsers.ts:120-135`; `buildShareViewFromSharePageResponse` `apps/frontend/src/lib/share/share-view.ts:160-196` (hier `vinylLayout` durchreichen).
- **Aktueller Track:** `TurntablePlayerContextValue.trackTitle` in `apps/frontend/src/components/turntable/TurntablePlayerContext.ts:73` (+ `isPlaying` Z. 57). Kein Track-Index-Feld.
- **RecordLabel-Fluss:** `RecordLabel = Omit<VinylRecordProps, "spinState"|"className">` `apps/frontend/src/components/turntable/RecordSwapStage.tsx:9`; `record`-Prop Z. 31-33; weitergereicht über `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx`.
- **lib-Konvention:** Logik in `apps/frontend/src/lib/` (Präzedenz `apps/frontend/src/lib/media/lp-label.ts`). Ziel: `apps/frontend/src/lib/media/vinyl-geometry.ts`, `apps/frontend/src/lib/media/vinyl-side.ts`.
- **Tests:** `pnpm --filter @musiccloud/frontend test:run`; `@testing-library/react` + vitest; Muster `apps/frontend/src/components/vinyl/VinylRecord.test.tsx` (WAAPI-Mock Z. 6-16).

## Typen (Vertrag)

- Konsumiert aus `@musiccloud/shared` (MC-116): `VinylLayout`, `VinylSide`, `VinylLayoutTrack`.
- Neu: `VinylRecordProps.sideLayout?: VinylSide` (aufgelöste aktuelle Seite).
- `RecordLabel` wird umdefiniert zu `Omit<VinylRecordProps, "spinState"|"className"|"sideLayout"> & { vinylLayout?: VinylLayout }` — das ganze Album-Layout fließt rein, `sideLayout` wird in der Turntable-Schicht abgeleitet.

## Datei-Struktur

**Neu:**
- `apps/frontend/src/lib/media/vinyl-geometry.ts` (+ `.test.ts`) — `vinylGrooveSpiralPath`, `labelArcPath` (ausgelagert) + neuer per-Seite-Builder `vinylSideGroovePath`.
- `apps/frontend/src/lib/media/vinyl-side.ts` (+ `.test.ts`) — reiner Matcher `sideForTrackTitle`.

**Geändert:**
- `apps/frontend/src/components/vinyl/VinylRecord.tsx` — Imports aus `vinyl-geometry`, neue `sideLayout`-Prop, dynamische Rille + dynamischer Buchstabe.
- `apps/frontend/src/components/vinyl/VinylRecord.test.tsx` — „SIDE A" → dynamischer Buchstabe.
- `apps/frontend/src/lib/types/media-card.ts` — `vinylLayout?: VinylLayout`.
- `apps/frontend/src/lib/resolve/parsers.ts`, `apps/frontend/src/lib/share/share-view.ts` — `vinylLayout` durchreichen.
- `apps/frontend/src/components/turntable/RecordSwapStage.tsx`, `TurntablePlayerParts.tsx`, `apps/frontend/src/components/cards/MediaCardHead.tsx` — `vinylLayout` in `RecordLabel`; `sideLayout`-Ableitung per `trackTitle`.

---

## Task 1: Geometrie-Logik auslagern (Refactor, charakterisierend)

**Files:** Create `apps/frontend/src/lib/media/vinyl-geometry.ts` + `.test.ts`; Modify `VinylRecord.tsx`.

- [ ] Charakterisierungs-Test: `vinylGrooveSpiralPath(45, 19, 49.5)` und `labelArcPath(44, 73)` liefern einen nicht-leeren `d`-String, der mit `M ` beginnt (Verhalten unverändert).
- [ ] `vinylGrooveSpiralPath` + `labelArcPath` (+ Hilfsfn `formatArcCoordinate`) 1:1 nach `vinyl-geometry.ts` verschieben, mit TSDoc; in `VinylRecord.tsx` importieren statt lokal definieren.
- [ ] `pnpm --filter @musiccloud/frontend test:run` grün (bestehende VinylRecord-Tests + neuer Test).
- [ ] Commit: `Refactor: extract vinyl geometry helpers to lib/media (MC-117)`.

## Task 2: Per-Seite-Rillen-Builder (TDD)

**Files:** Modify `vinyl-geometry.ts` + `.test.ts`.

- [ ] Failing Test `vinylSideGroovePath(side, opts)` mit The-Sermon!-Seite B (`tracks` mit `durationMs` 714000, 480000): der Builder setzt **eine** Pausenrille (Tracks−1) an der kumulierten Grenze (~714000/1194000 des Radius), plus je einen Einlauf- (außen) und Auslauf-Abschnitt (innen); Rückgabe ist ein deterministischer `d`-String. Test: Anzahl Pausen-Segmente == `tracks.length - 1`; Einlauf/Auslauf vorhanden; gleiche Eingabe → gleicher Output.
- [ ] Failing Test: Seite mit **einem** Track → 0 Pausenrillen, nur Einlauf/Auslauf.
- [ ] Rot → implementieren (kumulierte `durationMs`-Fraktionen → Radien zwischen `outerRadius` und `innerRadius`; Pausen-Land = kurzer glatter Abschnitt; feste Einlauf-/Auslauf-Bänder als Konstanten).
- [ ] Grün. Commit: `Feat: build per-side vinyl groove path (MC-117)`.

## Task 3: Track→Seite-Matcher (TDD, rein)

**Files:** Create `apps/frontend/src/lib/media/vinyl-side.ts` + `.test.ts`.

- [ ] Failing Test `sideForTrackTitle(layout, trackTitle)`: bei The-Sermon!-Layout liefert `"J.O.S."` die Seite B, `"The Sermon"` die Seite A; unbekannter Titel → `null`; `layout === null` → `null`; Groß/Klein + Whitespace normalisiert (`"  the sermon "` matcht `"The Sermon"`).
- [ ] Rot → implementieren (normalisierter Titelvergleich über alle `sides[].tracks[]`).
- [ ] Grün. Commit: `Feat: match currently-playing track to vinyl side (MC-117)`.

## Task 4: VinylRecord konsumiert sideLayout (TDD)

**Files:** Modify `VinylRecord.tsx` + `VinylRecord.test.tsx`.

- [ ] Failing Test: mit `sideLayout` (label `"B"`, zwei Tracks) rendert `VinylRecord` den Buchstaben **„B"** (statt „A") und nutzt `vinylSideGroovePath` für das Rillen-Bitmap; ohne `sideLayout` bleibt es „A" und homogen (`vinylGrooveSpiralPath`). Bestehenden „SIDE A"-Test auf den Default-Fall (kein `sideLayout`) umstellen.
- [ ] Rot → implementieren: `sideLayout?: VinylSide` in `VinylRecordProps`; Bitmap per `useMemo` über `sideLayout` (dynamisch) bzw. Modul-Konstante (homogen); Buchstabe = `sideLayout?.label ?? "A"` (SVG-`tspan` + `sr-only`).
- [ ] Grün. Commit: `Feat: render dynamic vinyl groove + side letter (MC-117)`.

## Task 5: vinylLayout ins View-Model (TDD)

**Files:** Modify `media-card.ts`, `parsers.ts`, `share-view.ts` + zugehörige Tests.

- [ ] Failing Test: eine Resolve-/Share-Response mit `album.vinylLayout` landet als `vinylLayout` in `MediaCardContentConfiguration`; fehlt es → `undefined` (kein Fehler).
- [ ] Rot → implementieren: `vinylLayout?: VinylLayout` in `MediaCardContentConfiguration`; Durchreichen in `parseAlbumResolveResponse` und `buildShareViewFromSharePageResponse`.
- [ ] Grün. Commit: `Feat: thread vinylLayout through the view-model (MC-117)`.

## Task 6: RecordLabel + Turntable-Verdrahtung (TDD)

**Files:** Modify `RecordSwapStage.tsx`, `TurntablePlayerParts.tsx`, `MediaCardHead.tsx` + Tests.

- [ ] `RecordLabel` umdefinieren zu `Omit<VinylRecordProps, "spinState"|"className"|"sideLayout"> & { vinylLayout?: VinylLayout }`; `MediaCardHead` gibt `content.vinylLayout` in den `record` weiter.
- [ ] Failing Test: in der Turntable-Schicht wird aus `record.vinylLayout` + `TurntablePlayerContext.trackTitle` per `sideForTrackTitle` die `sideLayout` abgeleitet und an `VinylRecord` gereicht; ändert sich `trackTitle`, ändert sich die Seite; ohne `vinylLayout`/ohne Match → `sideLayout` bleibt `undefined` (homogen).
- [ ] Rot → implementieren (Ableitung an der Stelle, wo der Context konsumiert wird; `sideLayout` an `VinylRecord`).
- [ ] Grün. Commit: `Feat: derive current vinyl side in the turntable layer (MC-117)`.

## Task 7: Gates

- [ ] `pnpm --filter @musiccloud/frontend test:run` grün; `pnpm --filter @musiccloud/frontend exec astro check` 0 Errors; `pnpm doctor:diff` 0 Issues; `biome check` sauber.
- [ ] Commit: `Chore: finalize dynamic vinyl groove frontend (MC-117)`.

## Checkliste (Plan-Fortschritt)

- [ ] Task 1 — Geometrie-Logik auslagern
- [ ] Task 2 — Per-Seite-Rillen-Builder
- [ ] Task 3 — Track→Seite-Matcher
- [ ] Task 4 — VinylRecord konsumiert sideLayout
- [ ] Task 5 — vinylLayout ins View-Model
- [ ] Task 6 — RecordLabel + Turntable-Verdrahtung
- [ ] Task 7 — Gates
- [ ] Alle Code-Referenzen re-verifiziert (Funktionen, Scripts, Pfade, Props, Package-Manager-Commands) vor erstem Edit
