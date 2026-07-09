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
5. Audio Stop (Hub remountet fürs neue Album) → Hub coastet bis Idle (`LP_COAST_DURATION_MS`).
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
- [x] `preloadResolvedMedia` implementiert (`preload-media.ts`): `raceReady` (Timeout `PRELOAD_TIMEOUT_MS = 15000` + Abort + Ready), `decodeCover` (`Image.decode`, guarded), `preloadAudio` (`new Audio()`, `preload="auto"`, `canplaythrough`/`loadedmetadata`/`error`, dann Element freigeben), `Promise.all`. Fehler-/Timeout-tolerant. 4/4 Tests grün. **Das `resolveTrack`-Wiring (Different-Album-Gate mit `sameAlbum`-Check) folgt mit der Integration (Task 2/6).**
- [x] Test grün. Biome. Commit (Helfer).

### Task 2: `RecordSwapStage` oberhalb des Hub-Keys einsetzen

**Files:**
- Modify: `apps/frontend/src/components/cards/MediaCardHead.tsx` (Stage oberhalb des `TurntablePlayerProvider`-Keys platzieren, outgoing-Snapshot durchreichen)
- ggf. Modify: `apps/frontend/src/components/turntable/TurntablePlayerParts.tsx` / `HubPlatter`, damit der incoming-Deck seinen Platten-Render an die Stage abgibt
- Test: `apps/frontend/src/components/cards/MediaCardHead.test.tsx`

- [ ] Failing Test: bei Different-Album-Wechsel überlebt die outgoing Platte den Hub-Remount sichtbar (Doppelpuffer aktiv), die incoming erscheint über die Stage.
- [ ] Test rot.
- [ ] `RecordSwapStage` so einsetzen, dass sie den Config-Wechsel überlebt (oberhalb des `key={turntableHubKey}`). Outgoing-Label-Props via Snapshot; incoming aus der neuen Config. Deck-Chrome/Spindel bleiben statisch. Sicherstellen, dass kein doppelter Platten-Render (Hub-Platter zusätzlich zur Stage) entsteht.
- [ ] Test grün. React-Doctor `doctor:diff`. Biome. Commit.

### Task 3: Coast-Kopplung + Sequenz-Trigger

**Files:**
- Modify: `apps/frontend/src/components/turntable/RecordSwapStage.tsx` bzw. ein kleiner Orchestrierungs-Hook `lib/motion/useRecordSwapSequence.ts`
- Create (optional): `apps/frontend/src/lib/motion/useRecordSwapSequence.ts`
- Test: entsprechende `.test.tsx`

- [ ] Failing Test: nach Dispatch wird zuerst gecoastet (Spin läuft aus), und der Slide startet erst bei Stillstand; nicht vorher.
- [ ] Test rot.
- [ ] Sequenz koppeln: Slide-Start an das Erreichen von `Idle` (Ende des Coast-Fensters, `LP_COAST_DURATION_MS`) hängen. `buildRecordSwapTimeline` erst dann bauen. Reduced-motion → Instant-Swap ohne Coast-Warten.
- [ ] Test grün. Biome. Commit.

### Task 4: Auto-Play best-effort nach `onSettle`

**Files:**
- Modify: Orchestrierung aus Task 3 (Auto-Play-Aufruf), ggf. `TurntablePlayerProvider`/Engine für einen best-effort Auto-Play-Einstieg
- Test: entsprechende `.test.tsx`

- [ ] Failing Test: nach `onSettle` wird ein Play-Versuch unternommen; scheitert er (Autoplay-Policy), bleibt die Platte aufgelegt ohne Fehler/Absturz.
- [ ] Test rot.
- [ ] Auto-Play immer versuchen (Design-Entscheidung), `play()`-Reject abfangen und in einen aufgelegten Idle-Zustand fallen. Warmer-Context-Fall (es lief schon Audio) funktioniert zuverlässig; kalter Safari-Fall degradiert sauber.
- [ ] Test grün. Biome. Commit.

### Task 5: Reduced-Motion + Cover-Swap-Interaktion + Regressionscheck

**Files:**
- Review/Modify: `components/cards/SongInfo.tsx` Cover-Swap-Interaktion mit dem album-skopierten Key
- Test: bestehende Turntable-/SongInfo-Tests erweitern

- [ ] Prüfen und testen: reduced-motion macht den ganzen Ablauf zu einem Instant-Swap (kein Coast-Warten, kein Slide).
- [ ] Verifizieren, ob der Cover-Swap in `SongInfo` durch den album-skopierten Key jetzt bei Different-Album animiert oder weiterhin remountet; Verhalten dokumentieren und, falls es mit dem Platten-Swap kollidiert (doppelte Bewegung), abstimmen.
- [ ] Manuelles UI-Smoke (lokal, `./app`): Same-Album (dreht durch), Different-Album (voller Bogen-Swap), Similar Artist, reduced-motion. Golden Path + Edge Cases.
- [ ] Biome. `doctor:diff`. `test:run`. Commit.

### Task 6: Härtung gegen überlappende/schnelle Interaktionen (Race Conditions)

**Files:**
- Modify: `apps/frontend/src/components/share/ShareLayout.tsx` (`resolveTrack`: monotones Request-Token, "latest wins")
- Modify: `apps/frontend/src/components/turntable/RecordSwapStage.tsx` bzw. `lib/motion/useRecordSwapSequence.ts` (Interrupt: WAAPI-`cancel`, outgoing-Unmount, Coast-Timer clearen)
- Test: `apps/frontend/src/components/share/ShareLayout.test.tsx` (Race-Fälle) plus Stage-Interrupt-Test

**Härtungs-Invarianten:**
- Letzte Selektion gewinnt: ein älterer, noch laufender Resolve/Preload darf nicht mehr dispatchen, wenn eine neuere Selektion begonnen hat.
- Kein hängender Zustand: kein orphaned outgoing-Puffer, kein orphaner Coast-Timer, keine liegengebliebene WAAPI-Animation, Audio-Hub nicht im Limbo.
- Die Same-/Different-Album-Entscheidung fällt gegen den jeweils aktuellen Ziel-Zustand, nicht gegen einen veralteten.

- [ ] Failing Test: zwei schnell aufeinanderfolgende Selektionen (Different-Album, dann kurz darauf Same-Album des neuen Ziels) — nur die letzte gewinnt; kein doppelter Dispatch, kein hängender outgoing-Puffer; Endzustand entspricht der letzten Selektion. Zusätzlicher Test: neue Selektion mitten in einer laufenden Swap-Animation canceled diese sauber und lässt keinen outgoing zurück.
- [ ] Test rot.
- [ ] Request-Token in `resolveTrack` einführen (Ref, monoton hochzählen): nur dispatchen, wenn das beim Aufruf gezogene Token noch das aktuelle ist; einen laufenden Vorgänger via seinen `AbortController` abbrechen. Swap-Interrupt in der Stage: laufendes WAAPI-Handle `cancel()`en, outgoing des Vorgängers unmounten, Coast-Timer clearen. Same-/Different-Album-Entscheidung gegen das aktuelle Ziel (nicht gegen einen zwischenzeitlich überholten `currentConfig`).
- [ ] Test grün. Biome. `doctor:diff`. Commit.

## Offene Punkte

- Coast-Dauer (`LP_COAST_DURATION_MS`) plus Slide ergibt eine mehrsekündige Choreografie mit Stille dazwischen; das ist die bewusst gewählte Reihenfolge. Feintuning der Dauern bleibt im Rahmen dieses Plans möglich.
- Falls die Cover-Swap-Bewegung (TFT-Screen) und der Platten-Swap gleichzeitig wirken, klären, ob beide laufen sollen oder der Cover-Swap für den Turntable-View unterdrückt wird.

## Checkliste

- [ ] Task 1: Daten-Gate (Cover + Audio Preload) im `resolveTrack`
- [ ] Task 2: `RecordSwapStage` oberhalb des Hub-Keys
- [ ] Task 3: Coast-Kopplung + Sequenz-Trigger
- [ ] Task 4: Auto-Play best-effort
- [ ] Task 5: Reduced-Motion + Cover-Swap-Interaktion + UI-Smoke
- [ ] Task 6: Härtung gegen überlappende/schnelle Interaktionen (Race Conditions)
- [ ] Alle Code-Referenzen verifiziert (Funktionen, Skripte, Pfade, Env-Vars, Package-Manager-Kommandos)
- [ ] Gates grün: `pnpm typecheck`, Biome, `doctor:diff`, `test:run`
