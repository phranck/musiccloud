# Frontend-Cleanup: Konsolidierung + die zwei medium-Leaks

Plan-Nr.: MC-073

**Goal:** Die in zwei Audit-Läufen (MC-Audit-Workflows) adversarisch bestätigten, funktionserhaltenden Konsolidierungen umsetzen UND die beiden einzigen medium-Leaks beheben. Kein Verhaltenswechsel ausser den zwei Leak-Fixes (die reine Last/Memory reduzieren, keine sichtbare UX-Änderung).

**Hintergrund:** Der systemweite Ressourcen-/Konsolidierungs-Audit fand keine high-severity-Leaks. Es gibt genau zwei medium-Leaks (beide lifecycle-/track-begrenzt) und eine Reihe echter DRY-/Dead-Code-Chancen, jede einzeln von einem skeptischen Reviewer am Code verifiziert. Dieser Plan setzt nur die als `isReal`/`isWorthwhile && !breaksFunctionality` bestätigten um.

**Explizit ausgeschlossen:**
- **K3 (`usePlayerDisplayCells`)** — würde `PlayerParts.tsx` treffen, das unter dem C-vs-CC-Divergenz-Freeze steht (nicht für DRY-Refactor anfassen).
- Die als `breaksFunctionality=true` verworfenen Kandidaten: `activeTimelines`-WeakMap-Wrapper mit uniformer `settle`-Methode (bricht `collapse.ts`-opacity-0-Sonderfall), `prefersReducedMotion()`-Konvergenz (zerstört Live-Subscription), generischer `useResizeObserver`-Wrapper (YAGNI/KISS).

## Gruppen (je = ein logischer Commit)

### G1 — Dead-Code + Konstanten
- **K4** Toter Export `writeSpectrumBands` + privates `copyBands` entfernen (`spectrumStore.ts:74-92`). Producer nutzt `resolveSpectrumBandsInto` direkt (`AudioPlayer.tsx:737-738`); `writeSpectrumBands` nur im Test referenziert (3 Stellen). `spectrumStore.test.ts` anpassen: band-spezifische Tests entfernen/auf Direkt-Buffer-Mutation umstellen, Clear-Zeroing-Coverage erhalten.
- **K5** `LP_COAST_DURATION_MS = 2000` ist in `VinylRecord.tsx:33` UND `TurntablePlayerProvider.tsx:15` dupliziert, funktional gekoppelt (Coast-Animationsdauer == Settle-Timer-Delay). Konstante nach `VinylRecord.types.ts` heben (beide importieren von dort bereits `VinylSpinState`), TSDoc zur Doppel-Kopplung.

### G2 — nightsky DRY
- **K-I** `smooth01` byte-identisch in `loop.ts:20-23` und `settings.ts:233-236`. In `settings.ts` exportieren, in `loop.ts` importieren, lokale Kopie löschen. `settings.ts` hat keine Imports → kein Zyklus.
- **K-H** Draw-Commit-Zeilen (`needsRedraw=false; lastDrawMs=nowMs; scene.draw(simTime)`) identisch in `loop.ts` tick (108-110) und redrawNow (197-199). Privaten `commitDraw(nowMs)` extrahieren; Guards (visible/fps-Gate) bleiben am Call-Site.

### G3 — canvas-vfd DRY + Leak-1
- **K-E** `shouldMarquee` (`vfdDisplayMarquee.ts:36-40`): beide Branches identisch → `return Boolean(mode) && stringLength(content) > visibleCells;`. Future-Hook-Kommentar ggf. als kurze Notiz behalten.
- **K-D** `VfdInfoDisplay.tsx:102-127`: Titel-Section in beiden Ternary-Branches dedupen → `[titleSection, ...(metaLine ? [metaSection] : [])]`. Section-Objekte bleiben im Render-Body (Runtime-Props, Doctor `separate-logic`).
- **K-B** `blankColumnBuffer(columnCount, brightness)`-Helper für 3 Blank-Fill-Stellen (`vfdDisplayCanvas.ts:143, 207, 228`). Helper arbeitet auf **Column**-Ebene mit `Math.max(1, …)`; `vfdColumnCountForCells` bleibt am Call-Site.
- **K-C** `windowColumns(source, length, offset, brightness)`-Helper für 2 Fenster-Materialisierungen (`vfdDisplayCanvas.ts:183` scrolled `+columnOffset`, `:357` overlay `-start`, fill `VfdBrightness.Bright`). Offset-Semantik einheitlich `source[index+offset]`, brightness als Param.
- **MEDIUM-1** `marqueeStates`-Map ohne Pruning (`vfdDisplayMarquee.ts:113` set ohne Gegenpart; content-Keys `vfdDisplayCanvas.ts:256/:280`). Pro Frame berührte Keys sammeln, am Frame-Ende nicht-berührte löschen — analog zum `transitions`/`overlays`-Pruning (`VfdDisplay.tsx:74-83`). Content-basierter Key bleibt (Bounce-Reset).

### G4 — audio helpers
- **K-F/K2** `resolveAudioDuration(audio): number` (Modul-Scope) für die 5× byte-identische Formel `Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : DEFAULT_DURATION_SECONDS` (`AudioPlayer.tsx:153, 961, 966, 1183, 1211`). `resolveAudioProgressRatio` nutzt ihn intern; die State-Default-Literale `30` NICHT mit einziehen.
- **K-G/K1** `disconnectAudioGraphNodes()`-Helper für den byte-identischen Node-Disconnect+Null-Block (`AudioPlayer.tsx:693-702` teardownSpectrum, `:885-894` catch). NUR der Disconnect-Kern; `stopSpectrumLoop`-Prefix, `context.close()`-Suffix, `clearSpectrumFrame/resetPeakHold`/`return` bleiben am Call-Site (catch lässt den Context absichtlich offen für den Pipeline-Rebuild).

### G5 — Leak-2 (Render-Architektur, Player-Hot-Path)
- **MEDIUM-2** `progressRatio` (60fps) fächert über instabile Context-Value auf alle 4 Hub-Consumer aus, obwohl nur `TurntableAnalyzerSlot` ihn braucht (`TurntablePlayerProvider.tsx:160-181`, Ursache `engine` als erste Memo-Dep + frisches `engine`-Objekt pro Render `AudioPlayer.tsx:1325-1340`). Fix: `progressRatio` aus der Haupt-Context-Value herauslösen — eigener schmaler Progress-Context/Store, den nur `TurntableAnalyzerSlot` subscribt (analog `spectrumStore`). Übrige Consumer bleiben stabil. Vorsichtigster Eingriff, gerade erst stabilisierter Player.

### G6 — resolveFetch
- **K-A** `resolveFetch(endpoint, body, signal?)`-Helper (modul-lokal in `useAppState.ts`) für die 3× identischen `AbortController + setTimeout(15000) + fetch + clearTimeout + !ok→ResolveApiError`-Blöcke (`:118-130, :183-195, :228-246`). `RESOLVE_FETCH_TIMEOUT_MS` als benannte Konstante. Helper liefert nur bis `response`; Bodies bleiben Parameter; Success-`json()`-Discriminant-Branching bleibt beim Caller. Timer in `finally` clear'n (behebt dangling-Timer im catch-Pfad). `ShareLayout.resolveTrack` NICHT umstellen (ruft `trackResolver`, nicht `fetch` — Nutzen zu klein).

### G7 — createModeStore Factory
- **K-J** `createModeStore<T>({ storageKey, defaultMode, isValid })`-Factory in `lib/`. `resolveMode.ts` + `dayNightMode.ts` vollständig darauf umstellen; `analyzerMode.ts` nur den Store-**Kern** (Analytics `sendMusicSignal`, Refcount-keydown-Listener, `useAnalyzerMode`-Hook mit bewusster SSR-Strategie bleiben lokale Schicht). Bedingungen: Type-Guard als Parameter, per-Store-`defaultMode` (Commercial/System/MultiBand) übergeben, **Export-Namen identisch re-exportieren** (`dayNightMode.test.ts` prüft `getDayNightMode`/`setDayNightMode`/`subscribeDayNightMode` direkt). SSR-Server-Snapshot bleibt am Call-Site (Konsumenten geben ihn an `useSyncExternalStore`).

### G8 — will-change Toggle (L1)
- **L1** `will-change-transform` statisch am Rotor (`VinylRecord.tsx:525`), spinState-unabhängig → permanenter Compositor-Layer im Idle. Nur bei `spinState !== Idle` setzen (data-attr-/conditional-className-gesteuert). Mikro-Optimierung, GPU-Layer bleibt während Playing/Coasting (gewollt).

## Checkliste

- [x] G1: K4 Dead-Code (`writeSpectrumBands`/`copyBands`) + Test angepasst; K5 `LP_COAST_DURATION_MS` nach `VinylRecord.types.ts`
- [x] G2: K-I `smooth01` dedupliziert; K-H `commitDraw`-Helper
- [x] G3: K-E `shouldMarquee`; K-D `VfdInfoDisplay`-Titel-Section; K-B `blankColumnBuffer`; K-C `windowColumns`; MEDIUM-1 `marqueeStates`-Pruning (+ Regression-Test)
- [x] G4: K-F `resolveAudioDuration`; K-G `disconnectAudioGraphNodes`
- [x] G5: MEDIUM-2 `progressRatio` aus Hub-Context herausgelöst (eigener TurntableProgressContext; Value-Memo auf explizite Felder; tsc 0 / doctor 0)
- [x] G6: K-A `resolveFetch` + `RESOLVE_FETCH_TIMEOUT_MS` + dangling-Timer-Fix
- [x] G7: K-J `createModeStore`-Factory (resolve/dayNight voll, analyzer Kern)
- [x] G8: L1 `will-change` nur bei `!== Idle`
- [x] Alle Code-Referenzen verifiziert (Funktionen, Pfade, Zeilen)
- [x] Gates grün: Biome (875 Files), tsc (0 Fehler), React-Doctor (0 Issues), Vitest (54 Files / 316 Tests)
- [x] Adversarisches Code-Review des Gesamt-Diffs (alle 10 Risiko-Punkte verhaltens-äquivalent, Workarounds unangetastet)
- [x] Commit (als ein logischer Refactor-Commit, MC-073; auf User-Ansage „den Stand committen" 2026-06-30)

## Verified facts

- `~/.local/bin/plans next` → `MC-073` (2026-06-30).
- K4: `grep writeSpectrumBands` → nur Definition (`spectrumStore.ts:89`) + 3 Test-Stellen; `copyBands` nur von `writeSpectrumBands` genutzt; Producer schreibt Bänder via `resolveSpectrumBandsInto(...)` in `frame.leftBands/rightBands` (`AudioPlayer.tsx:737-738`). `writeSpectrumLevels`/`writeSpectrumPeakHold` bleiben (vom Producer genutzt).
- K5: `LP_COAST_DURATION_MS = 2000` in `VinylRecord.tsx:33` und `TurntablePlayerProvider.tsx:15`; beide importieren `VinylRecord.types`.
- K-E: `shouldMarquee` `vfdDisplayMarquee.ts:36`. `marqueeStates.set` `:113`, `.get` `:104`, kein `.delete`.
- K-B Blank-Fill: `vfdDisplayCanvas.ts:143, 207, 228`. K-C Fenster: `:183` (`sourceColumns[columnOffset+index]`), `:357` (`overlaySource[index-start]`). Key-Bau `:256`, `:280`.
- K-I `smooth01`: `loop.ts:20` + `settings.ts:233`. K-H Draw-Commit: `loop.ts` tick `108-110` / redrawNow `197-199`.
- K-F: Duration-Formel `AudioPlayer.tsx:153, 961, 966, 1183, 1211`. K-G Disconnect-Block `:693-697`/`:885-889` (+ Null-Setzungen darunter).
- K-A: `new AbortController` + `setTimeout(... abort, 15000)` `useAppState.ts:118/119, 183/184, 228/229`.
- MEDIUM-2: Context-Value-Memo `TurntablePlayerProvider.tsx:160-181`, `progressRatio` `:169`; nur `TurntableAnalyzerSlot` konsumiert ihn.
- Jeder Ziel-File wird vor dem Edit vollständig erneut gelesen (read-completely + execute-time re-verify).
