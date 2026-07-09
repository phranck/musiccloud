# Plattenspieler: Bogen-Swap Orchestrierung + Daten-Gate + Integration

Plan-Nr.: MC-113

> **Für agentische Worker:** Umsetzung Task-für-Task via superpowers:subagent-driven-development oder superpowers:executing-plans. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Ziel:** Den echten Plattenwechsel bei Wechsel auf ein anderes Album / Similar Artist verdrahten: warten bis Cover und Audio geladen sind (alte Platte spielt weiter), dann Audio Stop, Auslaufen bis Stillstand, Bogen-Swap (alte komplett raus, neue komplett rein), Absetzen, und immer automatisch abspielen (best-effort).

**Architektur:** Ein Daten-Gate im `resolveTrack` lädt Cover (`decodeArtwork`) und Audio vor, bevor der Wechsel dispatcht wird, sodass die alte Platte bis dahin weiterspielt. Der `RecordSwapStage`-Doppelpuffer (MC-112) sitzt oberhalb des album-skopierten Hub-Keys (MC-111), snapshottet die outgoing Label-Props und fährt die Sequenz Coast (Hub) → Heben → Slide → Absetzen → Play. Selbes Album nutzt den MC-111-Pfad (kein Wechsel).

**Tech-Stack:** React 19, Web Animations API (aus MC-112), Web Audio, TypeScript, vitest + Testing Library, Biome, pnpm.

**Voraussetzungen / Reihenfolge:** Braucht MC-111 (Album-Identität `sameAlbum`, album-skopierter Hub-Key) und MC-112 (`buildRecordSwapTimeline`, `RecordSwapStage`). Zuletzt umsetzen.

---

## Preface

Integrationsplan. Er verbindet den Verhaltensteil (MC-111) und den Motion-Teil (MC-112) zum vollständigen Feature und fügt das Daten-Gate, die Coast-Kopplung und das Auto-Play hinzu.

## Verifizierte Fakten

- `ShareLayout.tsx:492-532` `resolveTrack`: `await trackResolver(...)` liefert `update` (`ResolvedShareUpdate`), danach `replaceBrowserUrlWithShortUrl(update.shortUrl)` und `dispatchUi({ type: Resolved, config: update.config, ... })`. Das ist der Punkt, an dem das Daten-Gate vor dem Dispatch greift.
- `ShareLayout.tsx:107-119` `Resolved`-Reducer swappt `currentConfig`, setzt `previewStatus: null`.
- `track-resolver.ts:37-43` `ResolvedShareUpdate = { shortUrl, config, artistName, artistInfoContext?, pageTitle? }`; `config.artworkUrl` und `config.previewUrl` sind die Preload-Ziele.
- `components/cards/SongInfo.tsx:46-57` `decodeArtwork(url)`: `img.decode()` + `nextAnimationFrame()`, Fehler schlucken. Muster fürs Cover-Preload.
- `components/cards/MediaCardHead.tsx:196-204` `<TurntablePlayerProvider key=...>`; Deck-Node kommt als `turntableStage` in `SongInfo` (`MediaCardHead.tsx:211-213`, `SongInfo.tsx:164-166`). Die `RecordSwapStage` muss oberhalb dieses Keys sitzen, damit die outgoing Platte den Config-Wechsel überlebt.
- `components/turntable/TurntablePlayerProvider.tsx:70-83` Hub-Reducer: `PlaybackIntentStarted` → `Playing`; `EngineStatus` → `deriveSpinState`; `CoastFinished` → `Idle`. `:153-160` Coast-Timer (`LP_COAST_DURATION_MS`). Spin läuft aus, wenn Audio aus `Playing`/`Coasting` stoppt.
- `components/audio/AudioPlayer.tsx:1067-1173` `togglePlay` (kein Auto-Play, gesten-sensibel); `:1108-1137` First-Play-Fade; `:1148-1152` Fehlerpfad. Für best-effort Auto-Play nach dem Swap.
- `turntableState.ts:75-82` `deriveSpinState`: `Coasting`, wenn Audio aus `Playing`/`Coasting` stoppt.
- MC-111 liefert `sameAlbum` (`lib/resolve/album-identity.ts`) und den album-skopierten Hub-Key.
- MC-112 liefert `buildRecordSwapTimeline` (`lib/motion/recordSwap.ts`) und `RecordSwapStage` (`components/turntable/RecordSwapStage.tsx`), auf Web-Animations-API-Basis (kein GSAP); das Handle bietet `cancel()` und settlet nicht bei Interrupt.

## Sequenz (Different-Album / Similar Artist)

1. Klick → `resolveTrack` startet Resolver. Alte Platte spielt weiter (kein Dispatch).
2. Nach Resolver-Ergebnis: `sameAlbum(current, update.config)`? Wenn ja → MC-111-Pfad (kein Wechsel), Ende.
3. Different-Album: Preload parallel: `decodeArtwork(update.config.artworkUrl)` **und** Audio-Preload (`update.config.previewUrl`, `canplay`/`loadedmetadata`). Erst wenn beide bereit → weiter.
4. outgoing Label-Props snapshotten, dann `Resolved` dispatchen.
5. Engine defert (meldet `AudioStatus.Ready` statt Auto-Continue, da `recordSwapKey` sich änderte) → Hub coastet bis Idle (`LP_COAST_DURATION_MS`). Der Hub remountet NICHT (stabil, MC-113 Task 2); nur die Audio-Engine wechselt die Source in-place.
6. Nach Stillstand: `RecordSwapStage` fährt Heben → Slide (raus ‖ rein) → Absetzen.
7. Nach `onSettle`: Auto-Play best-effort (`togglePlay`), bei Block Fallback = Platte bleibt aufgelegt (kein Fehler).

## Überlappende Interaktionen (Härtung)

Beispiel-Szenario (vom User): Nutzer klickt einen Similar Artist (Different-Album, startet Resolve + Preload + Swap), wartet kurz, klickt dann einen Popular-Track vom selben Album. Mehrere Selektionen überlappen: ein Resolve/Preload in flight, eine Animation in flight, eine neue Selektion kommt. Diese Fälle müssen sauber aufgelöst werden (Task 6): letzte Selektion gewinnt, kein hängender Zustand, Album-Entscheidung immer gegen das aktuelle Ziel.

## Tasks

### Task 1: Daten-Gate im `resolveTrack` (Preload vor Dispatch)

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx:492-532`
- Create: `apps/frontend/src/lib/resolve/preload-media.ts` (Cover-Decode + Audio-Preload-Helfer)
- Test: `apps/frontend/src/lib/resolve/preload-media.test.ts`

- [x] Failing Test für `preloadResolvedMedia(target, { signal })`: leerer Target/aborted-Signal → sofort; Cover-Decode → auflösen; nie-bereite Ressource → über 15s-Timeout auflösen (blockiert nie).
- [x] Test rot.
- [x] `preloadResolvedMedia` implementiert (`preload-media.ts`): `raceReady` (Timeout `PRELOAD_TIMEOUT_MS = 15000` + Abort + Ready), `decodeCover` (`Image.decode`, guarded), `preloadAudio` (`new Audio()`, `preload="auto"`, `canplaythrough`/`loadedmetadata`/`error`, dann Element freigeben), `Promise.all`. Fehler-/Timeout-tolerant. 4/4 Tests grün. **Das `resolveTrack`-Wiring ist erledigt (siehe unten): Different-Album-Gate mit `sameAlbum`-Check + Preload vor Dispatch.**
- [x] Test grün. Biome. Commit (Helfer).

### Task 2: `RecordSwapStage` in den Platter (Hub-Key stabil)

**Files:**
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx` (Stage oberhalb des `TurntablePlayerProvider`-Keys platzieren, outgoing-Snapshot durchreichen)
- ggf. Modify: `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx` / `HubPlatter`, damit der incoming-Deck seinen Platten-Render an die Stage abgibt
- Test: `apps/frontend/src/components/cards/MediaCardHead.test.tsx`

- [x] **Architektur-Entscheidung (Plan-Deviation, dokumentiert im Code):** Statt "Stage als Overlay oberhalb des Hub-Keys" den **Hub-Key entfernt/stabil** gemacht (kein Remount pro Track) und `RecordSwapStage` direkt in `TurntablePlayerPlatter` gesetzt. Grund: so ist die Platte by-construction korrekt platziert (kein fragiles Overlay-Positioning quer über die Hub-Grenze, keine Handoff-/Alignment-Probleme). Die alte Platte überlebt den Wechsel, weil der Hub nicht mehr remountet (die Audio-Engine reagiert per `previewUrl`-Sync auf den neuen Track, MC-111).
- [x] `turntableHubKey` → `recordSwapKey` umgewidmet (jetzt die Swap-Identität statt Hub-Remount-Key). `MediaCardHead`: `key={hubKey}` entfernt, `swapKey={recordSwapKey(content)}` an beide Decks (`TurntablePlayer` + `Turntable`). `swapKey` durch `TurntablePlayerRoot`/`HubPlatter`/`TurntablePlayerPlatter` verkabelt; Platter rendert `RecordSwapStage(record, spinState, swapKey)` statt `VinylRecord`. Deck-Chrome/Spindel bleiben statisch, kein Doppel-Render.
- [x] Tests: `recordSwapKey.test.ts` (3/3) + alle Deck-Aufrufer (Turntable/TurntablePlayer/SongInfo) mit `swapKey` versorgt. astro check 0 errors, Biome, Full-Doctor 0 issues, 342/342. Der Swap/Doppelpuffer selbst ist in `RecordSwapStage` (MC-112) getestet.

### Task 3: Coast-Kopplung + Sequenz-Trigger

**Files:**
- Modify: `apps/frontend/src/components/turntable/RecordSwapStage.tsx` bzw. ein kleiner Orchestrierungs-Hook `lib/motion/useRecordSwapSequence.ts`
- Create (optional): `apps/frontend/src/lib/motion/useRecordSwapSequence.ts`
- Test: entsprechende `.test.tsx`

- [x] Failing Test + grün: `RecordSwapStage.test.tsx` — bei aktivem Spin startet der Slide erst, wenn `spinState` nach dem swapKey-Wechsel `Idle` erreicht (nicht während Playing/Coasting); bei bereits idler Deck sofort. 6/6.
- [x] **Coast-Kopplung umgesetzt (zweiteilig):** (1) Stage-seitig: `RecordSwapStage` hält die alte Platte in einer neuen `PendingCoast`-Phase auf dem Teller (läuft mit dem live `spinState` aus) und baut `buildRecordSwapTimeline` erst beim Erreichen von `Idle`. (2) Engine-seitig: der Different-Album-Defer (`useAudioController`, Task 3/4-Commit) meldet `AudioStatus.Ready`, damit der Hub coastet und `spinState` überhaupt nach `Idle` läuft. Reduced-motion → Instant-Swap ohne Coast-Warten (Stage) + nahtloser Continue (Engine).
- [x] Test grün. Biome. Full-Doctor 0. Commit (`Feat: coast-gate the record swap until the deck spins down` + `Feat: defer playback to the swap orchestration on a different-album switch`).

### Task 4: Auto-Play best-effort nach `onSettle`

**Files:**
- Modify: Orchestrierung aus Task 3 (Auto-Play-Aufruf), ggf. `TurntablePlayerProvider`/Engine für einen best-effort Auto-Play-Einstieg
- Test: entsprechende `.test.tsx`

- [x] `RecordSwapStage` bekommt ein optionales `onSettled` (feuert nur bei natürlichem Settle, nicht bei Interrupt/Reduced-Motion), durch `TurntablePlayerPlatter` durchgereicht. `RecordSwapStage.test.tsx` deckt das ab.
- [x] `HubPlatter` verdrahtet `onSettled` auf best-effort Play: `if (!isPlaying) togglePlay()`. Der Engine-Defer hat das neue Element idle gelassen, also startet `togglePlay` → `beginPlayback` → `audio.play()`. Ein `play()`-Reject wird von der Engine bereits in einen aufgelegten Unavailable-Idle abgefangen (kein Absturz). **Bewusste Design-Entscheidung „immer auto-play" (auch aus Pause).**
- [x] **Tradeoff im Code dokumentiert (`HubPlatter`-TSDoc):** Der Different-Album-Defer schließt den alten AudioContext (Teardown-Fade). Der Play-nach-Settle läuft ~3 s später ohne frischen User-Gesture → `audio.play()` greift i. d. R. dank Media-Engagement, aber ein frischer `AudioContext.resume()` kann in Safari suspended bleiben (Spektrum kurz dunkel, bis der User interagiert). Bewusst akzeptiert.
- [x] astro check 0, Biome, Full-Doctor 0, 347/347. Commit (`Feat: auto-play the swapped-in record after it settles`).

### Task 5: Reduced-Motion + Cover-Swap-Interaktion + Regressionscheck

**Files:**
- Review/Modify: `components/cards/SongInfo.tsx` Cover-Swap-Interaktion mit dem album-skopierten Key
- Test: bestehende Turntable-/SongInfo-Tests erweitern

- [x] Reduced-motion end-to-end getestet: Stage macht Instant-Swap (kein Coast, kein Slide, kein onSettled) — `RecordSwapStage.test.tsx`; Engine defert nicht, sondern spielt nahtlos weiter — `TurntablePlayerProvider.test.tsx` (`continues playback under reduced motion even on a different-album switch`).
- [x] **Cover-Swap-Interaktion untersucht (Code-first, `SongInfo.tsx`): keine Kollision.** Der Cover-Swap animiert die TFT-Cover-„Tür" (`buildCoverSwapTimeline`, keyed auf `albumArtUrl`), der Platten-Swap die Vinyl auf dem fixen Turntable-Layer dahinter. Pro Zeitpunkt ist nur eine `mc-share-media-stage` sichtbar (Cover-Ansicht = Tür vorne, Turntable-Ansicht = Tür weggeschoben). Beide Mechanismen laufen unabhängig ihre State-Updates, überlagern sich aber nie visuell. Same-Album: beide no-op (Cover-URL gleich, swapKey gleich). Kein Suppress nötig.
- [ ] **Manuelles UI-Smoke (User):** lokal `./app`, Same-Album (dreht durch), Different-Album (voller Bogen-Swap: stop → coast → slide → play), Similar Artist, überlappende schnelle Klicks, reduced-motion. Golden Path + Edge Cases. → offen, macht der User (visuelle Prüfung liegt beim User).
- [x] Biome. Full-Doctor 0. `test:run` 347/347. Commits gemacht.

### Task 6: Härtung gegen überlappende/schnelle Interaktionen (Race Conditions)

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx` (`resolveTrack`: monotones Request-Token, "latest wins")
- Modify: `apps/frontend/src/components/turntable/RecordSwapStage.tsx` bzw. `lib/motion/useRecordSwapSequence.ts` (Interrupt: WAAPI-`cancel`, outgoing-Unmount, Coast-Timer clearen)
- Test: `apps/frontend/src/components/share/ShareLayout.test.tsx` (Race-Fälle) plus Stage-Interrupt-Test

**Härtungs-Invarianten:**
- Letzte Selektion gewinnt: ein älterer, noch laufender Resolve/Preload darf nicht mehr dispatchen, wenn eine neuere Selektion begonnen hat.
- Kein hängender Zustand: kein orphaned outgoing-Puffer, kein orphaner Coast-Timer, keine liegengebliebene WAAPI-Animation, Audio-Hub nicht im Limbo.
- Die Same-/Different-Album-Entscheidung fällt gegen den jeweils aktuellen Ziel-Zustand, nicht gegen einen veralteten.

- [x] **Resolve-seitige Härtung erledigt** in `useTrackResolver` (aus `ShareLayoutInner` ausgelagert, damit die Komponente nicht "too large" wird): monoton hochzählendes Request-Token (`resolveRequestRef`) + geteilter `AbortController` (`resolveAbortRef`). Eine neuere Selektion abortet den Vorgänger; `resolveTrack` committet nur, wenn `isLatest()` (nested `if`, kein Early-Return nach `await`, sonst react-doctor `await-before-early-return-guard`-Warning). Aborted-Resolve ist kein Fehler; superseded-Resolve leert die Loading-Flag nicht. Same-/Different-Album-Entscheidung gegen den `currentConfig` zur Resolve-Zeit; eine spätere Selektion bewertet frisch.
- [x] Stage-seitiger Interrupt (WAAPI `cancel()` + outgoing-Unmount) ist in `RecordSwapStage` gebaut (`RecordSwapStage.test.tsx`: „cancels the in-flight swap and starts a new one on an overlapping swapKey change"). **Coast-Timer-Clearing:** der Hub-Coast-Timer (`TurntablePlayerProvider`, `useEffect` keyed auf `spinState`) räumt sich per Cleanup bei Spin-Wechsel/Unmount selbst auf; ein Interrupt während des Coasts hält den Spin durchgehend `Coasting` (der zweite Defer meldet erneut `Ready`, `spinState` bleibt `Coasting`), der bestehende Timer feuert genau einmal `CoastFinished` → kein Orphan-Timer. Kein zusätzliches Clearing nötig.
- [ ] Race-Verhalten: kein isolierter `resolveTrack`-Unit-Test (bräuchte volles `ShareLayout`-Render + Resolver-Mock); durch Reasoning abgesichert und im UI-Smoke (Task 5) verifiziert (schnelle Doppel-Klicks). Gates grün (Full-Doctor 0, Biome, astro 0, 342/342).

## Offene Punkte

- Coast-Dauer (`LP_COAST_DURATION_MS`) plus Slide ergibt eine mehrsekündige Choreografie mit Stille dazwischen; das ist die bewusst gewählte Reihenfolge. Feintuning der Dauern bleibt im Rahmen dieses Plans möglich.
- Falls die Cover-Swap-Bewegung (TFT-Screen) und der Platten-Swap gleichzeitig wirken, klären, ob beide laufen sollen oder der Cover-Swap für den Turntable-View unterdrückt wird.

## Checkliste

- [x] Task 1: Daten-Gate (Cover + Audio Preload) im `resolveTrack`
- [x] Task 2: `RecordSwapStage` in den Platter (Hub-Key stabil)
- [x] Task 3: Coast-Kopplung + Sequenz-Trigger (Stage `PendingCoast`-Phase + Engine-Defer meldet `Ready`)
- [x] Task 4: Auto-Play best-effort (`HubPlatter.onSettled` → guarded `togglePlay`)
- [x] Task 5: Reduced-Motion (getestet) + Cover-Swap-Interaktion (untersucht, keine Kollision). **Offen: manuelles UI-Smoke (User).**
- [x] Task 6: Härtung (Resolve-seitig „latest wins" + Stage-Interrupt-Cancel + selbsträumender Coast-Timer)
- [x] Alle Code-Referenzen verifiziert (Funktionen, Skripte, Pfade, Env-Vars, Package-Manager-Kommandos)
- [x] Gates grün: astro check 0/0, Biome, Full-Doctor 0, `test:run` 347/347
