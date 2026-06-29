# VfdDisplay Sonderformen (VfdInfoDisplay, VfdAnalyzerDisplay)

Plan-Nr.: MC-070

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development`. Schritte nutzen Checkbox-Syntax (`- [ ]`). Jeder TS-Code-Block ist Biome-konform; vor dem Commit `biome check --write` laufen lassen.

**Goal:** Die zwei spezialisierten `VfdDisplay`-Nutzungen als benannte, eigenständige Sonderformen herauslösen, die das generische `VfdDisplay` komponieren. `VfdDisplay.tsx` selbst bleibt unverändert.

**Architecture:** `VfdDisplay` ist verifiziert bereits zu 100% generisch (nur `lines`/`sections`/`progress`/`controllerRef`, keine Produkt-Semantik). MC-070 zieht die Info-Konfiguration aus `SongInfo` in `VfdInfoDisplay` und die Analyzer-Konfiguration aus `PlayerProgress` in `VfdAnalyzerDisplay` (plus eine reine Helfer-Datei `vfdAnalyzerLines.ts`). Beide Sonderformen rendern intern `VfdDisplay`. Keine Verhaltens- oder Optik-Änderung, reine Struktur.

**Tech Stack:** React 19, TypeScript, Canvas-2D-VFD-Engine, gsap.ticker (Analyzer 20 Hz), vitest, Biome, React-Doctor.

---

## Kontext (Preface)

`VfdDisplay` wird an genau zwei Stellen gerendert:
- `SongInfo.tsx:261` — vier Info-Zeilen (Titel+Meta, Artist, Detail, Status mit `scrollOutOverlay`), eingebettet in den Media-Block (Cover/Turntable). Reine `lines`-Konfiguration, keine imperative Logik.
- `PlayerParts.tsx:627` (in der `PlayerProgress`-Compound-Komponente) — die Analyzer/Progress-Zeile. Nutzt `controllerRef` (`VfdDisplayHandle.setLines`) plus `subscribeSpectrum` (20 Hz), `buildPlayerLines`, `progress`-Bar, `toggleAnalyzerMode`, `displayCells`-ResizeObserver. `PlayerProgress` hat zusätzlich einen `children`-Pfad (custom Progress-Inhalt statt Analyzer).

Das User-Prinzip (siehe `architecture/player-architecture.html`, Display-Basis): generische Engine, Sonderform nur bei Spezialbehandlung, per Komposition.

## File Structure

**Neu:**
- `apps/frontend/src/components/ui/VfdInfoDisplay.tsx` — Info-Sonderform. Baut die vier `lines` und rendert `VfdDisplay`. Eine Verantwortung: Track-Info-Layout.
- `apps/frontend/src/components/ui/vfdAnalyzerLines.ts` — reine Helfer (kein React): die Spektrum-/VU-Section-Bauer und Geometrie-Funktionen, 1:1 aus `PlayerParts.tsx` verschoben (`spectrumGlyphForLevel`, `renderBandContent`, `renderStereoVuSections`, `renderStereoBandSections`, `renderSpectrumSections`, `buildPlayerLines`, `compactSections`, `sectionFor`, `isStereoSpectrumBands`, `stereoChannelBandCells`, `playerAnalyzerCells`, `playerVfdColumnCountForCells`, `playerVfdCellCountForContentWidth`, `elementContentWidth`, `PlayerLineParams`, `PlayerStereoLevels`, `PlayerStereoPeakHold`, `StereoSpectrumBands`, `PlayerSpectrumBands` plus die `PLAYER_*`-Konstanten und `PLAYER_SPECTRUM_LEVEL_GLYPHS`).
- `apps/frontend/src/components/ui/VfdAnalyzerDisplay.tsx` — Analyzer-Sonderform. Kapselt `controllerRef`, die `subscribeSpectrum`-20-Hz-Subscription, `displayCells`-ResizeObserver, `progress`-Geometrie und den `toggleAnalyzerMode`-Klick. Nimmt die Anzeige-Werte als Props (entkoppelt vom `PlayerContext`, damit testbar und für MC-071 an einen anderen Context andockbar). Rendert intern `VfdDisplay`.

**Geändert:**
- `apps/frontend/src/components/cards/SongInfo.tsx` — der Inline-`VfdDisplay`-Block (Zeile 261-304) wird durch `<VfdInfoDisplay … />` ersetzt; die `lines`-Konstruktion, `SEEK_HINT_TEXT`, `VFD_SEEK_HINT_DURATION_MS`, `shouldMarqueeStatus`, `statusOverlay` wandern in `VfdInfoDisplay`.
- `apps/frontend/src/components/playback/PlayerParts.tsx` — `PlayerProgress` rendert im Analyzer-Fall `<VfdAnalyzerDisplay … />`; die Analyzer-Helfer (siehe oben) sind raus (Import aus `vfdAnalyzerLines.ts`, soweit `PlayerProgress` sie noch braucht). Der `children`-Progress-Pfad bleibt in `PlayerProgress`.

## Tasks

### Task A: VfdInfoDisplay extrahieren

**Files:**
- Create: `apps/frontend/src/components/ui/VfdInfoDisplay.tsx`
- Create: `apps/frontend/src/components/ui/VfdInfoDisplay.test.tsx`
- Modify: `apps/frontend/src/components/cards/SongInfo.tsx`

- [x] **Step 1: `VfdInfoDisplay` mit Props-Interface anlegen.** Props: `title: string`, `artist: string`, `detailLine: string`, `metaLine: string`, `statusLine: string`, `seekHint?: { direction: VfdScrollOutDirection; nonce: number } | null`. Logik 1:1 aus `SongInfo` übernehmen: `shouldMarqueeStatus = statusLine.length > 28`, `statusOverlay` aus `seekHint`, die vier `lines` (Titel+Meta-Sections wie heute, Artist, Detail, Status mit `scrollOutOverlay`). `VfdDisplay` mit `sizingMode={VfdSizingMode.Container}`, `ariaLabel` wie heute. `VFD_SEEK_HINT_DURATION_MS`/`SEEK_HINT_TEXT` mitnehmen. TSDoc auf Component + Props.

- [x] **Step 2: Test schreiben** (`VfdInfoDisplay.test.tsx`): rendert vier Zeilen mit gegebenem Titel/Artist/Detail/Status; Status-Marquee ab >28 Zeichen; mit `seekHint` ist der `scrollOutOverlay` gesetzt. (Analog zu bestehender `SongInfo.test.tsx`-Struktur prüfen.)

- [x] **Step 3: `SongInfo` umstellen** — den `<VfdDisplay …>`-Block (261-304) durch `<VfdInfoDisplay title={title} artist={artist} detailLine={detailLine} metaLine={metaLine} statusLine={statusLine} seekHint={seekHint} />` ersetzen. `detailLine`/`metaLine` bleiben in `SongInfo` berechnet (sie hängen an `album`/`isExplicit`/`metaOverride`/`durationMs`/`releaseDate`). Die jetzt ungenutzten VFD-Imports und `SEEK_HINT_TEXT`/`VFD_SEEK_HINT_DURATION_MS` aus `SongInfo` entfernen.

- [x] **Step 4: Gates** — `biome check --write`, `tsc --noEmit`, `react-doctor` 0 issues, `pnpm --filter @musiccloud/frontend test:run` (inkl. `SongInfo.test.tsx`, `VfdInfoDisplay.test.tsx`).

- [x] **Step 5: Commit** — `Refactor: extract VfdInfoDisplay from SongInfo (MC-070)`

### Task B: Analyzer-Helfer in vfdAnalyzerLines.ts extrahieren

**Files:**
- Create: `apps/frontend/src/components/ui/vfdAnalyzerLines.ts`
- Modify: `apps/frontend/src/components/playback/PlayerParts.tsx`

- [x] **Step 1: Reine Helfer 1:1 verschieben.** Alle in der File-Structure gelisteten Funktionen/Typen/Konstanten aus `PlayerParts.tsx` nach `vfdAnalyzerLines.ts` verschieben (kein Verhaltenswechsel, nur Move). Exporte ergänzen. Imports in `vfdAnalyzerLines.ts`: `VfdGlyph`, die `Vfd*`-Typen/Enums aus `VfdDisplay`, `SpectrumFrame`. TSDoc behalten.

- [x] **Step 2: `PlayerParts.tsx` importiert die verschobenen Symbole** aus `@/components/ui/vfdAnalyzerLines` (soweit `PlayerProgress` sie bis Task C noch direkt nutzt). Doppelte Definitionen entfernen.

- [x] **Step 3: Gates** — `biome check --write`, `tsc --noEmit`, `react-doctor` 0 issues, `pnpm --filter @musiccloud/frontend test:run` (inkl. `spectrumStore.test.ts`). Verhalten unverändert.

- [x] **Step 4: Commit** — `Refactor: move player analyzer line builders to vfdAnalyzerLines (MC-070)`

### Task C: VfdAnalyzerDisplay extrahieren und PlayerProgress umstellen

**Files:**
- Create: `apps/frontend/src/components/ui/VfdAnalyzerDisplay.tsx`
- Modify: `apps/frontend/src/components/playback/PlayerParts.tsx`

- [x] **Step 1: `VfdAnalyzerDisplay` anlegen.** Props: `isPlaying: boolean`, `isDisabled: boolean`, `timeText: string`, `progressRatio: number`, `phosphorColor?: string`, `ariaLabel?: string`. Kapselt aus `PlayerProgress`: `vfdControllerRef` (`VfdDisplayHandle`), `displayCells`-State + ResizeObserver, `lineParams`/`lineParamsRef`/`lines` (via `buildPlayerLines` aus `vfdAnalyzerLines`), die `subscribeSpectrum`-Subscription (`setLines`), die `progress`-Geometrie (`progressWidthPx` → `VfdProgress`), den `analyzerMode` (`useAnalyzerMode`) und rendert `<VfdDisplay controllerRef rows={1} sizingMode={Container} phosphorColor progress lines ariaLabel />`. `hasAnalyzer` ist hier immer true (der children-Fall bleibt in `PlayerProgress`). TSDoc.

- [x] **Step 2: `PlayerProgress` umstellen.** Im Analyzer-Fall (`!children`) `<VfdAnalyzerDisplay isPlaying={…} isDisabled={…} timeText={…} progressRatio={…} phosphorColor={…} ariaLabel={…} />` rendern (Werte aus `usePlayerContext`), umschlossen vom `button` mit `aria-pressed={isStereoVuMode}`/`onClick={toggleAnalyzerMode}` (oder den Toggle in `VfdAnalyzerDisplay` ziehen, falls sauberer). Im `children`-Fall bleibt der bestehende Pfad (custom Progress-Content über `buildPlayerLines` mit `childrenContent`). `PlayerProgress` wird dadurch deutlich schlanker.

- [x] **Step 3: Gates** — `biome check --write`, `tsc --noEmit`, `react-doctor` 0 issues, `pnpm --filter @musiccloud/frontend test:run`.

- [ ] **Step 4: Visuelle/funktionale Verifikation durch den Nutzer** (Analyzer MultiBand + StereoVu, Progress, Toggle-Klick). Playback-Hinweis beachten. (Offen: User-seitig.)

- [x] **Step 5: Commit** — `Refactor: extract VfdAnalyzerDisplay from PlayerProgress (MC-070)`

### Task D: Abschluss

- [x] **Step 1: Volle Gates** auf dem ganzen Frontend (`tsc`, `pnpm lint`, `react-doctor` full, `pnpm test:run`).
- [x] **Step 2: Abschluss-Commit, falls Reständerungen** — `Chore: finalize MC-070 VFD sonderformen`

---

## Checkliste (auswertbar)

- [x] A: `VfdInfoDisplay` extrahiert, `SongInfo` umgestellt, Test grün
- [x] B: Analyzer-Helfer in `vfdAnalyzerLines.ts`, Verhalten unverändert
- [x] C: `VfdAnalyzerDisplay` extrahiert, `PlayerProgress` schlank, Analyzer funktioniert
- [x] D: volle Gates grün
- [x] Alle Code-Referenzen verifiziert (Symbole, Pfade, VfdDisplay-Props)

## Verified Facts (Stand 2026-06-29)

| Referenz | Verifikation |
|---|---|
| Plan-Nr. `MC-070` | `~/.local/bin/plans next` |
| `VfdDisplay` generisch (Props `lines`/`sizingMode`/`rows`/`charsPerLine`/`progress`/`controllerRef`/`ariaLabel`/`phosphorColor`) | `Read` `VfdDisplay.tsx:139-351` |
| `VfdDisplay`-Render an genau 2 Stellen (`SongInfo:261`, `PlayerParts:627`) | `grep "<VfdDisplay"` |
| SongInfo-Info-`lines` (Titel+Meta-Sections, Artist, Detail, Status+`scrollOutOverlay`), `shouldMarqueeStatus = statusLine.length > 28`, `SEEK_HINT_TEXT`, `VFD_SEEK_HINT_DURATION_MS` | `Read` `SongInfo.tsx:99-117, 261-304` |
| Analyzer-Helfer + `buildPlayerLines` + `PlayerLineParams` + `PLAYER_*`-Konstanten + `PLAYER_SPECTRUM_LEVEL_GLYPHS` | `Read` `PlayerParts.tsx:89-457` |
| `PlayerProgress`-Analyzer (`vfdControllerRef`, `subscribeSpectrum`, `displayCells`-Observer, `progress`-Geometrie, `toggleAnalyzerMode`, children-Pfad) | `Read` `PlayerParts.tsx:535-659` |
| Gate-Commands | Memory `feedback_pre_push_gates`, `project_doctor_command_pitfalls` |

## Offene Punkte

- `VfdAnalyzerDisplay` nimmt die Anzeige-Werte als Props (nicht `usePlayerContext`), damit es testbar ist und in MC-071 an den TurntablePlayer-Hub-Context andockbar bleibt. Sollte sich beim Umsetzen zeigen, dass der Context-Weg klar sauberer ist, ist das ein vertretbarer Abweichungs-Entscheid (im Plan vermerken).

## Risiken / Hinweise

- **Performance-kritisch:** Der Analyzer läuft mit 20 Hz über `controllerRef.setLines` (kein React-Commit pro Frame). Beim Verschieben darf dieser Pfad nicht in einen React-State-Pfad umgebogen werden. `buildPlayerLines` bleibt pur.
- **`PlayerProgress`-children-Pfad:** Bleibt erhalten (custom Progress-Inhalt), nur der Analyzer-Zweig wird zu `VfdAnalyzerDisplay`.
- **Folgeplan MC-071:** Der TurntablePlayer-Hub dockt `VfdInfoDisplay`/`VfdAnalyzerDisplay` als Peripherie an seinen Context an; die hier gewählten Props-Schnittstellen sind dafür die Basis.
